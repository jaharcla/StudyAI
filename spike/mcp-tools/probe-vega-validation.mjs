import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.join(here, ".vendor", "vega-mcp-server");
const client = new Client({ name: "studyai-spike", version: "0.0.0" });
await client.connect(new StdioClientTransport({
  command: "uv",
  args: ["run", "--directory", serverDir, "fastmcp", "run", "server.py"],
  cwd: serverDir,
  stderr: "ignore",
}));

const cases = {
  unknownMark: { spec: { mark: "banana", encoding: { x: { field: "a", type: "quantitative" } }, data: { name: "table" } }, data: { table: [{ a: 1 }] } },
  missingDataName: { spec: { mark: "bar", encoding: { x: { field: "a", type: "nominal" }, y: { field: "b", type: "quantitative" } }, data: { name: "missing" } }, data: { table: [{ a: "x", b: 1 }] } },
  noType: { spec: { mark: "bar", encoding: { x: { field: "a" }, y: { field: "b", type: "quantitative" } }, data: { name: "table" } }, data: { table: [{ a: "x", b: 1 }] } },
};
for (const [name, args] of Object.entries(cases)) {
  const r = await client.callTool({ name: "show_vegalite_chart", arguments: args });
  console.log(name, JSON.stringify({ success: r.structuredContent?.success, errors: r.structuredContent?.errors, text: r.content?.[0]?.text }));
}
await client.close();
