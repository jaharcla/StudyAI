import { afterAll, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { makeMolecule } from "../src/canvas/model";

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), bindTools: vi.fn() }));
vi.mock("@langchain/ollama", () => ({ ChatOllama: class {
  invoke = mocks.invoke;
  bindTools(tools: unknown[]) { mocks.bindTools(tools); return this; }
} }));
const folder = mkdtempSync(join(tmpdir(), "studyai-tutor-"));
process.env.STUDYAI_DB = join(folder, "test.sqlite");
const { db } = await import("../server/db");
for (const [id, title] of [["chem-120", "Chemistry test course"], ["biol-130", "Biology test course"]]) {
  db.prepare("INSERT INTO courses VALUES(?,?,?,?)").run(id, title, "Test fixture", "#abcdef");
  db.prepare("INSERT INTO lessons VALUES(?,?,?)").run("lesson-03", id, "Test lesson");
}
const { importDocuments, searchDocuments } = await import("../server/document-intelligence/service");
const { graph } = await import("../server/agent");
const molecule = makeMolecule(100, 100);
const context = [
  { description: "StudyAI current workspace and structured canvas metadata", value: { courseId: "chem-120", lessonId: "lesson-03" } },
  { description: "StudyAI active scientific canvas objects", value: { courseId: "chem-120", lessonId: "lesson-03", boardId: "board-1", objects: [molecule] } },
  { description: "Active Quickdraw board context", value: { scope: { courseId: "chem-120", lessonId: "lesson-03", boardId: "board-1" }, selected: [], visible: [], nearbyObjects: [] } },
];
beforeEach(() => { mocks.invoke.mockReset(); mocks.bindTools.mockClear(); });

it("retrieves course evidence, canonicalizes real citations and removes invented references", async () => {
  await importDocuments(db, "chem-120", [{ name: "lecture.txt", bytes: Buffer.from("The lecture marker is TUTOR-771.") }], join(folder, "documents"));
  const ref = searchDocuments(db, "chem-120", "TUTOR-771")[0].sourceRef;
  mocks.invoke.mockResolvedValue(new AIMessage(`[wrong page](#studyai-citation=${encodeURIComponent(ref)}) [fake](#studyai-citation=made-up)`));
  const result = await graph.invoke({ copilotkit: { context }, messages: [new HumanMessage("What is the lecture marker TUTOR-771?")] });
  expect(result.messages.at(-1)?.content).toContain("lecture.txt · document text");
  expect(result.messages.at(-1)?.content).toContain("[unverified citation removed]");
  expect(JSON.stringify(mocks.invoke.mock.calls[0][0])).toContain("TUTOR-771");
  expect(JSON.stringify(mocks.invoke.mock.calls[0][0])).toContain(molecule.atoms[0].id);
});

it("forwards a registered canvas tool call through LangGraph for browser review", async () => {
  const response = new AIMessage({ content: "", tool_calls: [{ name: "propose_canvas_edit", id: "edit-1", args: { boardId: "board-1", objectId: molecule.id, patchJson: '{"name":"Reviewed"}', reason: "Clarify" } }] });
  mocks.invoke.mockResolvedValue(response);
  const result = await graph.invoke({ copilotkit: { context, actions: [{ name: "propose_canvas_edit" }] }, messages: [new HumanMessage("Rename my molecule")] });
  expect((result.messages.at(-1) as AIMessage).tool_calls?.[0]).toEqual(response.tool_calls![0]);
  expect(mocks.bindTools.mock.calls[0][0].map((tool: { name: string }) => tool.name)).toContain("propose_canvas_edit");
});

it("binds structured QuickDraw tools only for the active course and forwards calls", async () => {
  const response = new AIMessage({ content: "", tool_calls: [{ name: "propose_canvas_action", id: "shape-1", args: { boardId: "board-1", actions: [{ kind: "createText", id: "label-1", x: 40, y: 50, text: "Nitrate" }] } }] });
  mocks.invoke.mockResolvedValue(response);
  const result = await graph.invoke({ copilotkit: { context, actions: [{ name: "propose_canvas_action" }, { name: "get_canvas_state" }] }, messages: [new HumanMessage("Add a nitrate label")] });
  expect(mocks.bindTools.mock.calls[0][0].map((tool: { name: string }) => tool.name)).toContain("propose_canvas_action");
  expect(mocks.bindTools.mock.calls[0][0].map((tool: { name: string }) => tool.name)).toContain("get_canvas_state");
  expect((result.messages.at(-1) as AIMessage).tool_calls?.[0]).toEqual(response.tool_calls![0]);
});

it("reports tool-calling incompatibility without returning JSON as ordinary chat", async () => {
  mocks.invoke.mockRejectedValueOnce(new Error("model does not support tools"));
  const result = await graph.invoke({ copilotkit: { context, actions: [{ name: "propose_canvas_action" }] }, messages: [new HumanMessage("Draw an arrow")] });
  expect(result.messages.at(-1)?.content).toContain("did not accept the required tool call");
  expect(result.messages.at(-1)?.content).not.toContain("{\"kind\"");
});

it("rejects an invalid canvas analysis before it reaches the inference provider", async () => {
  const result = await graph.invoke({
    copilotkit: { context: [...context, { description: "StudyAI canvas analysis result", value: { boardId: "board-1", courseId: "chem-120", lessonId: "lesson-03", inferredInterpretations: { items: [{ statement: "verified fact" }] } } }] },
    messages: [new HumanMessage("Explain this board")],
  });
  expect(mocks.invoke).not.toHaveBeenCalled();
  expect(result.messages.at(-1)?.content).toContain("rejected as invalid, stale, or out of scope");
});

it("does not bind canvas tools from another course or retrieve another course's excerpts", async () => {
  mocks.invoke.mockResolvedValue(new AIMessage("No course excerpts found."));
  await graph.invoke({ copilotkit: { context: [{ ...context[0], value: { courseId: "biol-130", lessonId: "lesson-03" } }, context[1]], actions: [{ name: "propose_canvas_edit" }] }, messages: [new HumanMessage("TUTOR-771")] });
  expect(mocks.bindTools.mock.calls[0][0].map((tool: { name: string }) => tool.name)).not.toContain("propose_canvas_edit");
  expect(JSON.stringify(mocks.invoke.mock.calls[0][0][0].content)).toContain('no_evidence');
});

it("keeps previous course and lesson conversation out of the current model prompt", async () => {
  mocks.invoke.mockResolvedValue(new AIMessage("Current course only."));
  const current = new HumanMessage({ id: "new-course", content: "Explain this course" });
  const result = await graph.invoke({
    activeScope: "chem-120:lesson-03", scopeStart: "old-course",
    copilotkit: { context: [{ ...context[0], value: { courseId: "biol-130", lessonId: "lesson-03" } }] },
    messages: [new HumanMessage({ id: "old-course", content: "PRIVATE-PREVIOUS-COURSE" }), new AIMessage("OLD-COURSE-ANSWER"), current],
  });
  expect(result.scopeStart).toBe(current.id);
  expect(JSON.stringify(mocks.invoke.mock.calls[0][0])).not.toContain("PRIVATE-PREVIOUS-COURSE");
  expect(JSON.stringify(mocks.invoke.mock.calls[0][0])).not.toContain("OLD-COURSE-ANSWER");
});

it("retains both retrieval tool turns when the model refines its search", async () => {
  const search = (id: string) => new AIMessage({ content: "", tool_calls: [{ name: "search_course_documents", id, args: { query: "TUTOR-771" } }] });
  mocks.invoke.mockResolvedValueOnce(search("search-1")).mockResolvedValueOnce(search("search-2")).mockResolvedValueOnce(new AIMessage("Found the excerpt."));
  await graph.invoke({ copilotkit: { context }, messages: [new HumanMessage("TUTOR-771")] });
  expect(mocks.invoke).toHaveBeenCalledTimes(3);
  expect(mocks.invoke.mock.calls[2][0].filter((message: { _getType: () => string }) => message._getType() === "tool")).toHaveLength(2);
});

afterAll(() => { db.close(); rmSync(folder, { recursive: true, force: true }); });
