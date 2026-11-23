import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.join(here, ".vendor", "vega-mcp-server");
let client;

before(async () => {
  client = new Client({ name: "studyai-spike", version: "0.0.0" });
  await client.connect(new StdioClientTransport({
    command: "uv",
    args: ["run", "--directory", serverDir, "fastmcp", "run", "server.py"],
    cwd: serverDir,
    stderr: "ignore",
  }));
});

after(async () => {
  await client?.close();
});

const chartArgs = (spec, data) => ({ spec, data });
const barSpec = (dataName = "table") => ({
  $schema: "https://vega.github.io/schema/vega-lite/v6.json",
  mark: "bar",
  encoding: {
    x: { field: "category", type: "nominal" },
    y: { field: "value", type: "quantitative" },
  },
  data: { name: dataName },
});
const rows = { table: [{ category: "A", value: 10 }, { category: "B", value: 20 }] };
const textOf = (result) => result.content.map((c) => c.text ?? "").join("\n");

test("Vega MCP exposes chart + syntax tools and advertises an MCP App UI", async () => {
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name);
  assert.ok(names.includes("show_vegalite_chart"));
  assert.ok(names.includes("learn_vegalite_syntax"));
  const chart = tools.find((t) => t.name === "show_vegalite_chart");
  assert.equal(chart._meta?.ui?.resourceUri, "ui://vegalite/mcp-app.html");
});

test("learn_vegalite_syntax returns a compact v6 reference", async () => {
  const result = await client.callTool({ name: "learn_vegalite_syntax", arguments: {} });
  assert.match(textOf(result), /Vega-Lite v6 Syntax Reference/);
});

test("a valid spec plus named data renders successfully", async () => {
  const result = await client.callTool({
    name: "show_vegalite_chart",
    arguments: chartArgs(barSpec(), rows),
  });
  assert.equal(result.structuredContent?.success, true);
  assert.match(textOf(result), /rendered/);
});

test("remote URL data sources are rejected", async () => {
  const spec = { ...barSpec(), data: { url: "https://example.com/data.json" } };
  const result = await client.callTool({ name: "show_vegalite_chart", arguments: chartArgs(spec, {}) });
  assert.equal(result.structuredContent?.success, false);
  assert.match((result.structuredContent?.errors ?? []).join(" "), /URL data sources are blocked/);
});

test("a named data source with no supplied rows is rejected", async () => {
  const result = await client.callTool({
    name: "show_vegalite_chart",
    arguments: chartArgs(barSpec("missing"), rows),
  });
  assert.equal(result.structuredContent?.success, false);
  assert.match((result.structuredContent?.errors ?? []).join(" "), /no records were provided/);
});

test("LIMITATION: malformed spec fields are not caught by the server", async () => {
  // Observed behaviour, recorded deliberately: despite the README's claim that
  // the Vega-Lite compiler validates specs, an unknown mark and a missing
  // encoding `type` both return success. Callers must validate specs themselves.
  const spec = { mark: "banana", encoding: { x: { field: "category" } }, data: { name: "table" } };
  const result = await client.callTool({ name: "show_vegalite_chart", arguments: chartArgs(spec, rows) });
  assert.equal(result.structuredContent?.success, true);
});
