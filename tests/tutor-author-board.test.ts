import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AIMessage, HumanMessage } from "@langchain/core/messages";

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), bindTools: vi.fn() }));
vi.mock("@langchain/ollama", () => ({ ChatOllama: class {
  invoke = mocks.invoke;
  bindTools(tools: unknown[]) { mocks.bindTools(tools); return this; }
} }));

const folder = mkdtempSync(join(tmpdir(), "studyai-author-board-"));
const originals = {
  db: process.env.STUDYAI_DB, provider: process.env.TUTOR_PROVIDER, groqKey: process.env.GROQ_API_KEY,
  calls: process.env.TUTOR_MAX_PROVIDER_CALLS, budget: process.env.TUTOR_CONTEXT_BUDGET,
  completion: process.env.TUTOR_MAX_COMPLETION_TOKENS, retries: process.env.TUTOR_GROQ_RETRIES,
};
process.env.STUDYAI_DB = join(folder, "test.sqlite");
process.env.TUTOR_PROVIDER = "ollama";
process.env.GROQ_API_KEY = "";
process.env.TUTOR_CONTEXT_BUDGET = "16384";
process.env.TUTOR_MAX_COMPLETION_TOKENS = "2048";
process.env.TUTOR_GROQ_RETRIES = "0";

const { db } = await import("../server/db");
db.prepare("INSERT INTO courses VALUES(?,?,?,?)").run("chem-120", "Chemistry", "Test", "#abcdef");
db.prepare("INSERT INTO lessons VALUES(?,?,?)").run("lesson-03", "chem-120", "Test lesson");
const { importDocuments, searchDocuments } = await import("../server/document-intelligence/service");
const { graph } = await import("../server/agent");

await importDocuments(db, "chem-120", [{ name: "module-1.txt", bytes: Buffer.from("Friction opposes relative motion; the normal force is perpendicular to the surface.") }], join(folder, "documents"));
const realRef = searchDocuments(db, "chem-120", "friction")[0].sourceRef;

const context = [
  { description: "StudyAI current workspace and structured canvas metadata", value: { courseId: "chem-120", lessonId: "lesson-03" } },
  { description: "Active canvas scene", value: { scope: { courseId: "chem-120", lessonId: "lesson-03", boardId: "board-1", revision: 3 }, selected: [], visible: [] } },
];
const actions = [{ name: "author_board" }];
const briefArgs = {
  boardId: "board-1", topic: "friction from module 1",
  artifact: { kind: "question", count: 1, prompt: "Name the three forces.", citationLabel: "Module 1 · p. 4", figure: { kind: "freebody", title: "Forces", forces: [{ label: "gravity", components: [0, -9.8] }] } },
  placement: { relation: "clear-area" }, reason: "Student asked for a friction question.",
};
const toolCall = (args: unknown, name = "author_board") => new AIMessage({ content: "", tool_calls: [{ name, args, id: "call-1", type: "tool_call" }] });

function boundToolNames(): string[] {
  return ((mocks.bindTools.mock.calls[0]?.[0] ?? []) as Array<{ function?: { name?: string } }>).map((tool) => tool.function?.name ?? "");
}

beforeEach(() => {
  process.env.TUTOR_PROVIDER = "ollama";
  process.env.GROQ_API_KEY = "";
  process.env.TUTOR_GROQ_RETRIES = "0";
  process.env.TUTOR_CONTEXT_BUDGET = "16384";
  process.env.TUTOR_MAX_COMPLETION_TOKENS = "2048";
  process.env.TUTOR_MAX_PROVIDER_CALLS = "2";
  mocks.invoke.mockReset();
  mocks.bindTools.mockClear();
});
afterEach(() => {
  for (const [key, value] of Object.entries(originals)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

it("binds author_board only when the client action is present and returns the tool call to the client", async () => {
  mocks.invoke.mockResolvedValue(toolCall({ ...briefArgs, sourceRefs: [realRef] }));
  const result = await graph.invoke({ copilotkit: { context, actions }, messages: [new HumanMessage("Can you make a friction question?")] });
  expect(boundToolNames()).toContain("author_board");
  const message = result.messages.at(-1) as AIMessage;
  expect(message.tool_calls?.[0]?.name).toBe("author_board");
  expect(mocks.invoke).toHaveBeenCalledTimes(1);
});

it("does not bind author_board without the frontend action", async () => {
  mocks.invoke.mockResolvedValue(new AIMessage("A short answer."));
  await graph.invoke({ copilotkit: { context }, messages: [new HumanMessage("Hello")] });
  expect(boundToolNames()).not.toContain("author_board");
});

it("filters invented citation refs before the tool call reaches the client", async () => {
  mocks.invoke.mockResolvedValue(toolCall({ ...briefArgs, sourceRefs: [realRef, "made-up-ref"] }));
  const result = await graph.invoke({ copilotkit: { context, actions }, messages: [new HumanMessage("Can you make a friction question?")] });
  const message = result.messages.at(-1) as AIMessage;
  expect(message.tool_calls?.[0]?.args.sourceRefs).toEqual([realRef]);
  expect((message.response_metadata?.studyai as { retrieval: { rejectedCitationCount: number } }).retrieval.rejectedCitationCount).toBe(1);
});

it("fits the normal path in one call and reports provider_call_limit honestly when a two-call path exceeds the cap", async () => {
  mocks.invoke.mockResolvedValueOnce(toolCall({ ...briefArgs, sourceRefs: [realRef] }, "search_course_documents"))
    .mockResolvedValueOnce(toolCall({ ...briefArgs, sourceRefs: [realRef] }));
  process.env.TUTOR_MAX_PROVIDER_CALLS = "1";
  const result = await graph.invoke({ copilotkit: { context, actions }, messages: [new HumanMessage("Can you make a friction question?")] });
  expect(mocks.invoke).toHaveBeenCalledTimes(1);
  expect(String(result.messages.at(-1)?.content)).toMatch(/provider call limit/i);
});
