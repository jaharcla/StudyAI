import { tool } from "@langchain/core/tools";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { compile, type TopLevelSpec } from "vega-lite";
import { z } from "zod";
import { buildChartSpec, CHART_DATASET, resolveChartFields, vegaChartSchema } from "../src/charts/vega-contract.js";

// Prototype integration for the two tools evaluated in spike/mcp-tools.
// Enabled only when STUDYAI_EXTERNAL_MCP_TOOLS=1 so the default tutor path and
// its benchmarks are unchanged until the integration is reviewed on main.

const WOLFRAM_ENDPOINT = "https://agenttools.wolfram.com/mcp";
const WOLFRAM_CONNECT_TIMEOUT_MS = 10_000;
const WOLFRAM_CALL_TIMEOUT_MS = 30_000;
const MAX_WOLFRAM_CODE_CHARS = 2_000;
const MAX_WOLFRAM_RESULT_CHARS = 12_000;

export function normalizeWolframText(raw: string): { result: string; truncated: boolean; hasMessage: boolean } {
  const text = raw.trim();
  const hasMessage = /(?:^|\s)[A-Za-z]+::[A-Za-z]+/.test(text) || text.includes("Messages were generated");
  let result = text;
  let truncated = false;
  if (result.length > MAX_WOLFRAM_RESULT_CHARS) {
    const head = result.slice(0, MAX_WOLFRAM_RESULT_CHARS / 2);
    const tail = result.slice(-MAX_WOLFRAM_RESULT_CHARS / 2);
    result = `${head}\n...[middle omitted by StudyAI]...\n${tail}`;
    truncated = true;
  }
  return { result, truncated, hasMessage };
}

type WolframPayload = { ok: boolean; source: string; tool: string; result?: string; truncated?: boolean; error?: string };

async function callWolfram(toolName: "WolframLanguageEvaluator" | "WolframAlpha", args: Record<string, string | number>): Promise<WolframPayload> {
  const client = new Client({ name: "studyai-tutor", version: "0.1.0" });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(WOLFRAM_ENDPOINT)), { timeout: WOLFRAM_CONNECT_TIMEOUT_MS });
    const response = await client.callTool({ name: toolName, arguments: args }, undefined, { timeout: WOLFRAM_CALL_TIMEOUT_MS });
    const payload = response as { content?: Array<{ type: string; text?: string }>; isError?: boolean };
    const raw = (payload.content ?? []).map((item) => (typeof item.text === "string" ? item.text : "")).join("\n");
    const normalized = normalizeWolframText(raw);
    return {
      ok: payload.isError !== true && !normalized.hasMessage,
      source: "Wolfram Cloud MCP",
      tool: toolName,
      result: normalized.result,
      truncated: normalized.truncated,
      ...(payload.isError === true || normalized.hasMessage ? { error: normalized.result } : {}),
    };
  } catch (error) {
    return { ok: false, source: "Wolfram Cloud MCP", tool: toolName, error: error instanceof Error ? error.message : "Wolfram request failed." };
  } finally {
    await client.close().catch(() => undefined);
  }
}

export function createWolframTools() {
  // Named fields keep each tool's input type distinct for direct callers;
  // the agent consumes Object.values() below.
  return {
    compute: tool(async ({ expression }) => JSON.stringify(await callWolfram("WolframLanguageEvaluator", { code: expression, timeConstraint: 20 })), {
      name: "wolfram_compute",
      description: "Compute an exact result with Wolfram Language. Use for symbolic algebra or calculus, exact arithmetic, matrix algebra, unit conversion, and curated scientific quantities that local Math.js cannot do. The result is an external computation: present it as computed output, not as a fact from the course. Returns ok:false when Wolfram reports a message or is unavailable.",
      schema: z.object({ expression: z.string().trim().min(1).max(MAX_WOLFRAM_CODE_CHARS) }),
    }),
    alpha: tool(async ({ query }) => JSON.stringify(await callWolfram("WolframAlpha", { query })), {
      name: "wolfram_alpha",
      description: "Answer a short factual or computational query with Wolfram|Alpha's curated knowledgebase, for example chemical data or unit conversions. Do not use it for course-specific questions or for pure arithmetic. Label the answer as a Wolfram|Alpha result, not course evidence.",
      schema: z.object({ query: z.string().trim().min(1).max(500) }),
    }),
  };
}

export function normalizeVegaSpec(args: z.infer<typeof vegaChartSchema>): { ok: boolean; error?: string } {
  // The built spec is compiled locally before it reaches the renderer: this is
  // the guard the upstream Vega MCP server omits.
  try {
    compile(buildChartSpec(args) as unknown as TopLevelSpec);
  } catch (error) {
    return { ok: false, error: `Invalid chart: ${error instanceof Error ? error.message : String(error)}` };
  }
  return { ok: true };
}

export function createVegaChartTool() {
  return tool(async (input) => {
    const parsed = vegaChartSchema.safeParse(input);
    if (!parsed.success) return JSON.stringify({ status: "error", error: "Invalid chart arguments." });
    const args = resolveChartFields(parsed.data);
    const checked = normalizeVegaSpec(args);
    if (!checked.ok) return JSON.stringify({ status: "error", error: checked.error });
    return JSON.stringify({
      status: "ok",
      spec: buildChartSpec(args),
      data: { [CHART_DATASET]: args.data },
      renderer: "chat",
    });
  }, {
    name: "show_vegalite_chart",
    description: "Render an interactive chart in the chat. Supply chart parameters, not a Vega spec: choose a mark (bar, line, point or area), give xField and yField matching keys in your rows, set xType/yType, and pass data as an array of row objects such as [{\"category\":\"A\",\"value\":10}]. Use this for plotted functions, vectors over time or experimental results. Values are supplied by the call; no remote data is fetched.",
    schema: vegaChartSchema,
  });
}
