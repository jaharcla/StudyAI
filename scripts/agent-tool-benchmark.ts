import { join } from "node:path";
import { tmpdir } from "node:os";

process.env.STUDYAI_DB = join(tmpdir(), `tool-bench-${process.pid}.sqlite`);
process.env.TUTOR_PROVIDER ??= "ollama";
process.env.STUDYAI_EXTERNAL_MCP_TOOLS = "1";
process.env.TUTOR_CONTEXT_BUDGET ??= "8192";
process.env.TUTOR_MAX_COMPLETION_TOKENS ??= "800";
process.env.TUTOR_MAX_PROVIDER_CALLS ??= "3";
process.env.TUTOR_OLLAMA_NUM_CTX ??= "8192";
const repeats = Number(process.env.BENCH_REPEATS ?? 3);
const label = process.env.TUTOR_PROVIDER === "opencode-go"
  ? (process.env.CANVAS_OPENCODE_GO_MODEL ?? "opencode-go")
  : (process.env.TEST_MODEL ?? "qwen3.5:0.8b");

type ToolCall = { name: string; args: unknown; id?: string };
type CallRecord = { name: string; args: unknown; result: string; ok: boolean };
type Case = {
  name: string;
  question: string;
  expect: string[];
  grounded?: RegExp;
  mentionSource?: boolean;
};

const cases: Case[] = [
  { name: "expand", question: "Use wolfram_compute to expand (x+1)^3 exactly.", expect: ["wolfram_compute"], grounded: /3\*x|x\^3|x\^2/, mentionSource: true },
  { name: "derivative", question: "Differentiate Sin[x] Exp[x] with respect to x using Wolfram.", expect: ["wolfram_compute"], grounded: /Cos|Sin/, mentionSource: true },
  { name: "integral", question: "Integrate x^2 from 0 to 1 with Wolfram Language.", expect: ["wolfram_compute"], grounded: /1\/3|0\.333/, mentionSource: true },
  { name: "molar-mass", question: "Use wolfram_alpha to tell me the molar mass of water.", expect: ["wolfram_alpha"], grounded: /18\.015/, mentionSource: true },
  { name: "speed-of-light", question: "Ask Wolfram|Alpha for the speed of light in metres per second.", expect: ["wolfram_alpha"], mentionSource: true },
  { name: "bar-chart", question: "Use show_vegalite_chart to draw a bar chart: A is 10 and B is 20.", expect: ["show_vegalite_chart"], grounded: /chart|A|B/i },
  { name: "line-chart", question: "Draw a line chart with time 1,2,3 and distance 4,5,6 using a chart tool.", expect: ["show_vegalite_chart"], grounded: /chart|line/i },
  { name: "arithmetic-negative", question: "What is 2+2?", expect: [] },
  { name: "concept-negative", question: "Explain in your own words what a force vector represents in physics.", expect: [] },
  { name: "max-negative", question: "What is the maximum value of sin(x)? Answer from what you know.", expect: [] },
  { name: "multi-tool", question: "Expand (x+1)^3 with wolfram_compute and give me the molar mass of water with wolfram_alpha.", expect: ["wolfram_compute", "wolfram_alpha"], mentionSource: true },
  { name: "chart-no-data", question: "Draw a chart of temperature over time, but do not use any data or numbers.", expect: [], grounded: /data|numbers/i },
];

const nativeFetch = globalThis.fetch;
let calls: CallRecord[] = [];
let toolResults: string[] = [];
let seen = new Set<string>();
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if ((url.includes("/api/chat") || url.includes("/chat/completions")) && init?.body) {
    const body = JSON.parse(String(init.body)) as {
      messages?: Array<{ role: string; content: string; tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: unknown } }> }>;
    };
    for (const message of body.messages ?? []) {
      for (const raw of message.tool_calls ?? []) {
        const name = raw.function?.name ?? "";
        if (!name) continue;
        const rawArgs = raw.function?.arguments;
        let args: unknown = rawArgs;
        if (typeof rawArgs === "string") { try { args = JSON.parse(rawArgs) as unknown; } catch { args = rawArgs; } }
        const key = raw.id ?? `${name}:${JSON.stringify(args)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        calls.push({ name, args, result: "", ok: true });
      }
      if (message.role === "tool") {
        const content = String(message.content ?? "");
        toolResults.push(content);
        const last = [...calls].reverse().find((call) => !call.result);
        if (last) { last.result = content; last.ok = !/"status":"error"|"ok":false|"valid":false/.test(content); }
      }
    }
  }
  return nativeFetch(input, init);
};

const { HumanMessage } = await import("@langchain/core/messages");
const { graph } = await import("../server/agent.js");
const { createVegaChartTool, createWolframTools } = await import("../server/mcp-tools.js");
const { createScienceTools } = await import("../server/science-tools.js");
const tools = [...Object.values(createWolframTools()), createVegaChartTool(), ...createScienceTools()];
const schemas = new Map<string, { safeParse(input: unknown): { success: boolean } }>(tools.map((tool) => [tool.name, tool.schema]));
const context = [{ description: "StudyAI selected model", value: { model: label } }];

console.log(JSON.stringify({ benchmark: "agent-tool-selection", model: label, repeats, cases: cases.length }));
for (const item of cases) {
  const stats = { selection: 0, grounded: 0, mentionedSource: 0, argValid: 0, calls: 0, duplicateCalls: 0, toolErrors: 0, emptyAnswers: 0 };
  const nameCounts = new Map<string, number>();
  for (let run = 0; run < repeats; run++) {
    calls = []; toolResults = []; seen = new Set();
    try {
      const result = await graph.invoke({ copilotkit: { context }, messages: [new HumanMessage(item.question)] });
      const answer = String(result.messages.at(-1)?.content ?? "");
      if (item.expect.length === 0 ? calls.length === 0 : item.expect.every((name) => calls.some((call) => call.name === name))) stats.selection++;
      stats.calls += calls.length;
      const names = new Map<string, number>();
      for (const call of calls) {
        names.set(call.name, (names.get(call.name) ?? 0) + 1);
        nameCounts.set(call.name, (nameCounts.get(call.name) ?? 0) + 1);
        const schema = schemas.get(call.name);
        if (schema?.safeParse(call.args).success) stats.argValid++;
        if (!call.ok) stats.toolErrors++;
      }
      if ([...names.values()].some((count) => count > 1)) stats.duplicateCalls++;
      if (item.grounded && item.grounded.test(answer)) stats.grounded++;
      if (item.mentionSource && /wolfram/i.test(answer)) stats.mentionedSource++;
      if (!answer.trim()) stats.emptyAnswers++;
    } catch {
      stats.toolErrors++;
    }
  }
  const n = Math.max(1, repeats);
  console.log(JSON.stringify({
    case: item.name,
    expected: item.expect,
    selection: `${stats.selection}/${repeats}`,
    callsPerTurn: Number((stats.calls / n).toFixed(2)),
    duplicateCallTurns: stats.duplicateCalls,
    toolNames: Object.fromEntries(nameCounts),
    argValid: stats.argValid,
    grounded: stats.grounded,
    sourceMention: stats.mentionedSource,
    toolErrors: stats.toolErrors,
    emptyAnswers: stats.emptyAnswers,
  }));
}
