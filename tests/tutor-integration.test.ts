import { afterAll, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { makeMolecule } from "../src/canvas/model";

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), bindTools: vi.fn(), ollamaOptions: [] as unknown[], groqInvoke: vi.fn(), groqBindTools: vi.fn(), groqOptions: [] as unknown[] }));
vi.mock("@langchain/ollama", () => ({ ChatOllama: class {
  invoke = mocks.invoke;
  constructor(options: unknown) { mocks.ollamaOptions.push(options); }
  bindTools(tools: unknown[]) { mocks.bindTools(tools); return this; }
} }));
vi.mock("@langchain/groq", () => ({ ChatGroq: class {
  invoke = mocks.groqInvoke;
  constructor(options: unknown) { mocks.groqOptions.push(options); }
  bindTools(tools: unknown[]) { mocks.groqBindTools(tools); return this; }
} }));
const folder = mkdtempSync(join(tmpdir(), "studyai-tutor-"));
const originalTutorProvider = process.env.TUTOR_PROVIDER;
const originalGroqApiKey = process.env.GROQ_API_KEY;
const originalGroqRetries = process.env.TUTOR_GROQ_RETRIES;
const originalMaxProviderCalls = process.env.TUTOR_MAX_PROVIDER_CALLS;
const originalMaxGroqCost = process.env.TUTOR_MAX_GROQ_COST_USD;
const originalContextBudget = process.env.TUTOR_CONTEXT_BUDGET;
const originalCompletionTokens = process.env.TUTOR_MAX_COMPLETION_TOKENS;
const originalDiagnostics = process.env.AI_DIAGNOSTICS;
process.env.STUDYAI_DB = join(folder, "test.sqlite");
process.env.TUTOR_PROVIDER = "ollama";
process.env.GROQ_API_KEY = "";
process.env.TUTOR_GROQ_RETRIES = "0";
process.env.TUTOR_CONTEXT_BUDGET = "16384";
process.env.TUTOR_MAX_COMPLETION_TOKENS = "2048";
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
beforeEach(() => { mocks.invoke.mockReset(); mocks.bindTools.mockClear(); mocks.ollamaOptions.length = 0; mocks.groqInvoke.mockReset(); mocks.groqBindTools.mockClear(); mocks.groqOptions.length = 0; });

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
  mocks.invoke.mockRejectedValueOnce(new Error("model does not support tools")).mockResolvedValueOnce(new AIMessage("This model cannot draw an arrow."));
  const result = await graph.invoke({ copilotkit: { context, actions: [{ name: "propose_canvas_action" }] }, messages: [new HumanMessage("Draw an arrow")] });
  expect(result.messages.at(-1)?.content).toContain("did not receive a structured canvas tool call");
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

it("prefers Groq with a bounded completion and accounts for provider usage metadata", async () => {
  process.env.TUTOR_PROVIDER = "auto";
  process.env.GROQ_API_KEY = "mock-key";
  process.env.TUTOR_GROQ_RETRIES = "0";
  process.env.TUTOR_MAX_PROVIDER_CALLS = "3";
  process.env.TUTOR_MAX_GROQ_COST_USD = "0.02";
  process.env.TUTOR_MAX_COMPLETION_TOKENS = "2048";
  process.env.TUTOR_CONTEXT_BUDGET = "16384";
  process.env.AI_DIAGNOSTICS = "1";
  const diagnostic = vi.spyOn(console, "info").mockImplementation(() => {});
  mocks.groqInvoke.mockResolvedValue(new AIMessage({ content: "Groq answer", response_metadata: { costUsd: 0.0004 }, usage_metadata: { input_tokens: 20, output_tokens: 5, total_tokens: 25 } } as any));
  const result = await graph.invoke({ copilotkit: { context }, messages: [new HumanMessage("Explain this canvas.")] });
  expect(result.messages.at(-1)?.content).toContain("Groq answer");
  expect(mocks.groqInvoke).toHaveBeenCalledTimes(1);
  expect(mocks.invoke).not.toHaveBeenCalled();
  expect(mocks.groqOptions[0]).toMatchObject({ model: "openai/gpt-oss-120b", maxRetries: 0, maxTokens: 2048 });
  const record = diagnostic.mock.calls.map(([line]) => JSON.parse(String(line))).find((item) => item.type === "tutor_request");
  expect(record).toMatchObject({ provider: "groq", invocationCount: 1, usage: { inputTokens: 20, outputTokens: 5, totalTokens: 25 }, estimatedCostUsd: 0.0004 });
  diagnostic.mockRestore();
  if (originalDiagnostics === undefined) delete process.env.AI_DIAGNOSTICS; else process.env.AI_DIAGNOSTICS = originalDiagnostics;
});

it("falls back once to the selected Ollama model after a Groq provider failure", async () => {
  process.env.TUTOR_PROVIDER = "auto";
  process.env.GROQ_API_KEY = "mock-key";
  process.env.TUTOR_GROQ_RETRIES = "0";
  process.env.TUTOR_MAX_PROVIDER_CALLS = "3";
  process.env.TUTOR_MAX_GROQ_COST_USD = "0.02";
  mocks.groqInvoke.mockRejectedValueOnce(new Error("Groq request failed"));
  mocks.invoke.mockResolvedValue(new AIMessage("Ollama fallback"));
  const result = await graph.invoke({ copilotkit: { context: [...context, { description: "StudyAI selected model", value: { model: "qwen3:8b" } }] }, messages: [new HumanMessage("Explain this canvas.")] });
  expect(result.messages.at(-1)?.content).toContain("Ollama fallback");
  expect(mocks.groqInvoke).toHaveBeenCalledTimes(1);
  expect(mocks.invoke).toHaveBeenCalledTimes(1);
  expect(mocks.ollamaOptions[0]).toMatchObject({ model: "qwen3:8b", numPredict: 2048 });
});

it("allows one configured retry for mocked transient Groq failures", async () => {
  process.env.TUTOR_PROVIDER = "auto";
  process.env.GROQ_API_KEY = "mock-key";
  process.env.TUTOR_GROQ_RETRIES = "1";
  process.env.TUTOR_MAX_PROVIDER_CALLS = "3";
  process.env.TUTOR_MAX_GROQ_COST_USD = "0.02";
  mocks.groqInvoke.mockRejectedValueOnce(Object.assign(new Error("rate limited"), { status: 429 })).mockResolvedValueOnce(new AIMessage("Recovered Groq answer"));
  const result = await graph.invoke({ copilotkit: { context }, messages: [new HumanMessage("Explain this canvas.")] });
  expect(result.messages.at(-1)?.content).toContain("Recovered Groq answer");
  expect(mocks.groqInvoke).toHaveBeenCalledTimes(2);
  expect(mocks.invoke).not.toHaveBeenCalled();
});

it("caps combined Groq fallback and Ollama invocations per request", async () => {
  process.env.TUTOR_PROVIDER = "auto";
  process.env.GROQ_API_KEY = "mock-key";
  process.env.TUTOR_GROQ_RETRIES = "0";
  process.env.TUTOR_MAX_PROVIDER_CALLS = "1";
  process.env.TUTOR_MAX_GROQ_COST_USD = "0.02";
  mocks.groqInvoke.mockRejectedValueOnce(new Error("Groq request failed"));
  const result = await graph.invoke({ copilotkit: { context }, messages: [new HumanMessage("Explain this canvas.")] });
  expect(result.messages.at(-1)?.content).toContain("provider call limit");
  expect(mocks.groqInvoke).toHaveBeenCalledTimes(1);
  expect(mocks.invoke).not.toHaveBeenCalled();
});

it("rejects Groq before invocation when one bounded call exceeds the request cost cap", async () => {
  process.env.TUTOR_PROVIDER = "auto";
  process.env.GROQ_API_KEY = "mock-key";
  process.env.TUTOR_GROQ_RETRIES = "0";
  process.env.TUTOR_MAX_PROVIDER_CALLS = "3";
  process.env.TUTOR_MAX_GROQ_COST_USD = "0.001";
  const result = await graph.invoke({ copilotkit: { context }, messages: [new HumanMessage("Explain this canvas.")] });
  expect(result.messages.at(-1)?.content).toContain("Groq cost limit");
  expect(mocks.groqInvoke).not.toHaveBeenCalled();
  expect(mocks.invoke).not.toHaveBeenCalled();
});

afterAll(() => {
  db.close();
  rmSync(folder, { recursive: true, force: true });
  if (originalTutorProvider === undefined) delete process.env.TUTOR_PROVIDER; else process.env.TUTOR_PROVIDER = originalTutorProvider;
  if (originalGroqApiKey === undefined) delete process.env.GROQ_API_KEY; else process.env.GROQ_API_KEY = originalGroqApiKey;
  if (originalGroqRetries === undefined) delete process.env.TUTOR_GROQ_RETRIES; else process.env.TUTOR_GROQ_RETRIES = originalGroqRetries;
  if (originalMaxProviderCalls === undefined) delete process.env.TUTOR_MAX_PROVIDER_CALLS; else process.env.TUTOR_MAX_PROVIDER_CALLS = originalMaxProviderCalls;
  if (originalMaxGroqCost === undefined) delete process.env.TUTOR_MAX_GROQ_COST_USD; else process.env.TUTOR_MAX_GROQ_COST_USD = originalMaxGroqCost;
  if (originalContextBudget === undefined) delete process.env.TUTOR_CONTEXT_BUDGET; else process.env.TUTOR_CONTEXT_BUDGET = originalContextBudget;
  if (originalCompletionTokens === undefined) delete process.env.TUTOR_MAX_COMPLETION_TOKENS; else process.env.TUTOR_MAX_COMPLETION_TOKENS = originalCompletionTokens;
  if (originalDiagnostics === undefined) delete process.env.AI_DIAGNOSTICS; else process.env.AI_DIAGNOSTICS = originalDiagnostics;
});
