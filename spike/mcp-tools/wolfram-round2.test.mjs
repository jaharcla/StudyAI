import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

let client;

before(async () => {
  client = new Client({ name: "studyai-spike", version: "0.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL("https://agenttools.wolfram.com/mcp")));
});
after(async () => { await client?.close(); });

const evaluate = async (code) => {
  const r = await client.callTool({ name: "WolframLanguageEvaluator", arguments: { code } });
  return { text: r.content.map((c) => c.text ?? "").join("\n"), isError: r.isError };
};

test("symbolic calculus: derivative", async () => {
  const { text } = await evaluate("D[Sin[x] Exp[x], x]");
  assert.match(text, /E\^x\*Cos\[x\] \+ E\^x\*Sin\[x\]/);
});

test("symbolic calculus: definite integral", async () => {
  const { text } = await evaluate("Integrate[x^2, {x, 0, 1}]");
  assert.match(text, /1\/3/);
});

test("exact linear algebra", async () => {
  const { text } = await evaluate("Inverse[{{1, 2}, {3, 4}}]");
  assert.match(text, /\{\{-2, 1\}, \{3\/2, -1\/2\}\}/);
});

test("physical quantities keep units", async () => {
  const { text } = await evaluate('Quantity[10, "Meters"]/Quantity[2, "Seconds"]');
  assert.match(text, /Quantity\[5, "Meters"\/"Seconds"\]/);
});

test("curated chemistry data via Entity", async () => {
  const { text } = await evaluate('Entity["Chemical", "Water"]["MolarMass"]');
  assert.match(text, /Quantity\[18\.015/);
  assert.match(text, /"Grams"\/"Moles"/);
});

test("WolframContext returns a factual preamble", async () => {
  const r = await client.callTool({
    name: "WolframContext",
    arguments: { context: "A student is studying equilibrium force vectors and wants a worked free-body-diagram example." },
  });
  const text = r.content.map((c) => c.text ?? "").join("\n");
  assert.match(text, /automatically generated using Wolfram Alpha/);
});

test("ERROR HANDLING: invalid syntax is text, not an MCP error", async () => {
  const { text, isError } = await evaluate("Plot[");
  assert.notEqual(isError, true);
  assert.match(text, /Plot::argrx/);
});

test("OUTPUT BOUND: large evaluations are truncated with a middle ellipsis", async () => {
  // Favourable finding: the server caps output at roughly 10k characters,
  // keeping head and tail and inserting "...". No wrapper cap is required for
  // context safety, though the missing middle must be shown to the student.
  const { text } = await evaluate("Table[i, {i, 10000}]");
  console.log("  large result chars:", text.length);
  assert.ok(text.includes("..."), "expected an ellipsis marking omitted output");
  assert.ok(text.length < 12000, `expected a bounded result, got ${text.length} chars`);
  assert.match(text, /10000\}/);
});
