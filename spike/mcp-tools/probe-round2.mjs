import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compile } from "vega-lite";

const here = path.dirname(fileURLToPath(import.meta.url));
const short = (s) => (s.length > 260 ? s.slice(0, 260) + "..." : s);
const textOf = (r) => r.content.map((c) => c.text ?? "").join("\n");

const w = new Client({ name: "studyai-spike", version: "0.0.0" });
await w.connect(new StreamableHTTPClientTransport(new URL("https://agenttools.wolfram.com/mcp")));

for (const code of [
  "D[Sin[x] Exp[x], x]",
  "Integrate[x^2, {x, 0, 1}]",
  "Inverse[{{1, 2}, {3, 4}}]",
  "Quantity[10, \"Meters\"]/Quantity[2, \"Seconds\"]",
  "Entity[\"Chemical\", \"Water\"][\"MolarMass\"]",
  "Table[i, {i, 10000}]",
  "Plot[",
]) {
  const r = await w.callTool({ name: "WolframLanguageEvaluator", arguments: { code } });
  console.log("WL", code, "| isError:", r.isError, "|", short(textOf(r)));
}
const ctx = await w.callTool({ name: "WolframContext", arguments: { context: "A student is studying equilibrium force vectors in physics and wants a worked example with a free body diagram." } });
console.log("CONTEXT", short(textOf(ctx)));
await w.close();

const serverDir = path.join(here, ".vendor", "vega-mcp-server");
const v = new Client({ name: "studyai-spike", version: "0.0.0" });
await v.connect(new StdioClientTransport({
  command: "uv",
  args: ["run", "--directory", serverDir, "fastmcp", "run", "server.py"],
  cwd: serverDir,
  stderr: "ignore",
}));
const resources = await v.listResources();
console.log("RESOURCES", JSON.stringify(resources.resources.map((r) => r.uri)));
const read = await v.readResource({ uri: "ui://vegalite/mcp-app.html" });
const html = read.contents?.[0]?.text ?? "";
console.log("RESOURCE HTML", html.length, html.slice(0, 80));

const specs = {
  scatter: { mark: "point", encoding: { x: { field: "t", type: "quantitative" }, y: { field: "v", type: "quantitative" } }, data: { name: "table" } },
  line: { mark: "line", encoding: { x: { field: "t", type: "quantitative" }, y: { field: "v", type: "quantitative" } }, data: { name: "table" } },
  layered: { layer: [{ mark: "point", encoding: { x: { field: "t", type: "quantitative" }, y: { field: "v", type: "quantitative" } } }, { mark: "line", encoding: { x: { field: "t", type: "quantitative" }, y: { field: "v", type: "quantitative" } } }], data: { name: "table" } },
  faceted: { mark: "bar", facet: { column: { field: "g", type: "nominal" } }, encoding: { x: { field: "t", type: "ordinal" }, y: { field: "v", type: "quantitative" } }, data: { name: "table" } },
};
const rows = { table: [
  { t: 0, v: 0, g: "a" }, { t: 1, v: 1, g: "a" }, { t: 2, v: 4, g: "b" },
  { t: 3, v: 9, g: "b" }, { t: 4, v: 16, g: "a" }, { t: 5, v: 25, g: "b" },
] };
for (const [name, spec] of Object.entries(specs)) {
  const r = await v.callTool({ name: "show_vegalite_chart", arguments: { spec, data: rows } });
  console.log("CHART", name, JSON.stringify({ success: r.structuredContent?.success, errors: r.structuredContent?.errors }));
}

const badSpecs = {
  unknownMark: { mark: "banana", encoding: { x: { field: "t", type: "quantitative" } }, data: { name: "table" } },
  noType: { mark: "bar", encoding: { x: { field: "t" }, y: { field: "v", type: "quantitative" } }, data: { name: "table" } },
};
for (const [name, spec] of Object.entries(badSpecs)) {
  try {
    compile(spec, { data: rows });
    console.log("LOCAL COMPILE", name, "accepted");
  } catch (e) {
    console.log("LOCAL COMPILE", name, "rejected:", short(String(e.message)));
  }
}
await v.close();
