import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { compile } from "vega-lite";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
after(async () => { await client?.close(); });

const rows = { table: [
  { t: 0, v: 0, g: "a" }, { t: 1, v: 1, g: "a" }, { t: 2, v: 4, g: "b" },
  { t: 3, v: 9, g: "b" }, { t: 4, v: 16, g: "a" }, { t: 5, v: 25, g: "b" },
] };
const q = { x: { field: "t", type: "quantitative" }, y: { field: "v", type: "quantitative" } };
const specs = {
  scatter: { mark: "point", encoding: q, data: { name: "table" } },
  line: { mark: "line", encoding: q, data: { name: "table" } },
  layered: { layer: [{ mark: "point", encoding: q }, { mark: "line", encoding: q }], data: { name: "table" } },
  faceted: { mark: "bar", facet: { column: { field: "g", type: "nominal" } }, encoding: q, data: { name: "table" } },
};

test("MCP Apps UI resource is discoverable and readable", async () => {
  const { resources } = await client.listResources();
  assert.ok(resources.some((r) => r.uri === "ui://vegalite/mcp-app.html"));
  const read = await client.readResource({ uri: "ui://vegalite/mcp-app.html" });
  const html = read.contents?.[0]?.text ?? "";
  console.log("  MCP App HTML bytes:", html.length);
  assert.ok(html.length > 500000);
  assert.match(html, /<!DOCTYPE html>/);
});

for (const [name, spec] of Object.entries(specs)) {
  test(`chart type renders: ${name}`, async () => {
    const r = await client.callTool({ name: "show_vegalite_chart", arguments: { spec, data: rows } });
    assert.equal(r.structuredContent?.success, true, JSON.stringify(r.structuredContent?.errors));
  });
}

test("MITIGATION: local vega-lite compile rejects an unknown mark", async () => {
  // The MCP server accepts this; compiling before the call catches it.
  const bad = { mark: "banana", encoding: q, data: { name: "table" } };
  assert.throws(() => compile(bad, { data: rows }));
});

test("LIMITATION: missing encoding type is accepted even by vega-lite compile", async () => {
  // Vega-Lite v6 tolerates it, so this is a grammar behaviour, not a server bug.
  const noType = { mark: "bar", encoding: { x: { field: "t" }, y: { field: "v", type: "quantitative" } }, data: { name: "table" } };
  assert.doesNotThrow(() => compile(noType, { data: rows }));
});
