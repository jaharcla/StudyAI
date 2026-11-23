import { join } from "node:path";
import { tmpdir } from "node:os";

process.env.STUDYAI_DB = join(tmpdir(), `mcp-tools-agent-${process.pid}.sqlite`);
process.env.TUTOR_PROVIDER ??= "ollama";
process.env.STUDYAI_EXTERNAL_MCP_TOOLS = "1";
process.env.TUTOR_CONTEXT_BUDGET ??= "8192";
process.env.TUTOR_MAX_COMPLETION_TOKENS ??= "800";
process.env.TUTOR_MAX_PROVIDER_CALLS ??= "3";
process.env.TUTOR_OLLAMA_NUM_CTX ??= "8192";
const testModel = process.env.TUTOR_PROVIDER === "opencode-go"
  ? (process.env.CANVAS_OPENCODE_GO_MODEL ?? "opencode-go")
  : (process.env.TEST_MODEL ?? "qwen3.5:0.8b");

// The graph returns only the final assistant turn, so observe the actual
// provider request payloads (Ollama /api/chat or OpenAI /chat/completions)
// to see which tools were called between turns.
const nativeFetch = globalThis.fetch;
let observedCalls: string[] = [];
let observedResults: string[] = [];
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if ((url.includes("/api/chat") || url.includes("/chat/completions")) && init?.body) {
    const body = JSON.parse(String(init.body)) as {
      messages?: Array<{ role: string; content: string; tool_calls?: Array<{ function?: { name?: string; arguments?: unknown } }> }>;
    };
    for (const message of body.messages ?? []) {
      for (const call of message.tool_calls ?? []) {
        const name = call.function?.name ?? "";
        if (name && !observedCalls.includes(name)) observedCalls.push(name);
        if (name === "show_vegalite_chart" && process.env.DEBUG_CHART_ARGS === "1") {
          const raw = typeof call.function?.arguments === "string" ? call.function.arguments : JSON.stringify(call.function?.arguments);
          console.log("CHART ARGS:", raw);
        }
      }
      if (message.role === "tool") observedResults.push(String(message.content).slice(0, 180));
    }
  }
  return nativeFetch(input, init);
};

const { HumanMessage } = await import("@langchain/core/messages");
const { graph } = await import("../server/agent.js");

const context = [{ description: "StudyAI selected model", value: { model: testModel } }];
const cases = [
  { name: "symbolic calculus", question: "Use wolfram_compute to expand (x+1)^3 exactly.", expect: "wolfram_compute" },
  { name: "curated data", question: "Use wolfram_alpha to tell me the molar mass of water.", expect: "wolfram_alpha" },
  { name: "chart", question: "Use show_vegalite_chart to draw a bar chart: A is 10 and B is 20.", expect: "show_vegalite_chart" },
  { name: "greeting", question: "Hello, how are you?", expect: "(none)" },
];

console.log(`MODEL: ${testModel}`);
for (const item of cases) {
  observedCalls = [];
  observedResults = [];
  const started = Date.now();
  try {
    const result = await graph.invoke({ copilotkit: { context }, messages: [new HumanMessage(item.question)] });
    const answer = String(result.messages.at(-1)?.content ?? "").slice(0, 200);
    console.log(JSON.stringify({
      case: item.name,
      expected: item.expect,
      calls: observedCalls,
      passed: item.expect === "(none)" ? observedCalls.length === 0 : observedCalls.includes(item.expect),
      toolResults: observedResults,
      answer,
      seconds: Number(((Date.now() - started) / 1000).toFixed(1)),
    }));
  } catch (error) {
    console.log(JSON.stringify({ case: item.name, error: error instanceof Error ? error.message : String(error) }));
  }
}
