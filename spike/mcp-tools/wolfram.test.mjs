import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const ENDPOINT = "https://agenttools.wolfram.com/mcp";
let client;
let transport;

before(async () => {
  client = new Client({ name: "studyai-spike", version: "0.0.0" });
  transport = new StreamableHTTPClientTransport(new URL(ENDPOINT));
  await client.connect(transport);
});

after(async () => {
  await client?.close();
});

const textOf = (result) => result.content.map((c) => c.text ?? "").join("\n");

test("Wolfram Cloud MCP exposes the three expected tools, no auth required", async () => {
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name);
  for (const expected of ["WolframLanguageEvaluator", "WolframAlpha", "WolframContext"]) {
    assert.ok(names.includes(expected), `missing tool: ${expected} (got ${names.join(", ")})`);
  }
});

test("WolframLanguageEvaluator returns exact symbolic expansion", async () => {
  const result = await client.callTool({
    name: "WolframLanguageEvaluator",
    arguments: { code: "Expand[(x+1)^5]" },
  });
  const text = textOf(result);
  console.log("  wolfram expansion:", text);
  assert.match(text, /1 \+ 5\*x \+ 10\*x\^2 \+ 10\*x\^3 \+ 5\*x\^4 \+ x\^5/);
});

test("WolframLanguageEvaluator is stateless across calls", async () => {
  await client.callTool({ name: "WolframLanguageEvaluator", arguments: { code: "f[x_] = x^2; f[3]" } });
  const followUp = await client.callTool({
    name: "WolframLanguageEvaluator",
    arguments: { code: "f[3]" },
  });
  const text = textOf(followUp);
  console.log("  stateless follow-up:", text);
  assert.match(text, /f\[3\]/);
});

test("WolframAlpha returns curated factual data with units", async () => {
  const result = await client.callTool({
    name: "WolframAlpha",
    arguments: { query: "molar mass of water" },
  });
  const text = textOf(result);
  assert.match(text, /g\/mol/);
  assert.match(text, /18\.015/);
});
