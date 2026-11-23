import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));

const wolfram = new Client({ name: "studyai-spike", version: "0.0.0" });
await wolfram.connect(new StreamableHTTPClientTransport(new URL("https://agenttools.wolfram.com/mcp")));
for (const code of ["Expand[(x+1)^5]", "f[x_] = x^2; f[3]", "f[3]"]) {
  const r = await wolfram.callTool({ name: "WolframLanguageEvaluator", arguments: { code } });
  console.log("WOLFRAM", code, JSON.stringify(r));
}
const alpha = await wolfram.callTool({ name: "WolframAlpha", arguments: { query: "molar mass of water" } });
console.log("ALPHA", JSON.stringify(alpha));
await wolfram.close();

const serverDir = path.join(here, ".vendor", "vega-mcp-server");
const vega = new Client({ name: "studyai-spike", version: "0.0.0" });
await vega.connect(new StdioClientTransport({
  command: "uv",
  args: ["run", "--directory", serverDir, "fastmcp", "run", "server.py"],
  cwd: serverDir,
  stderr: "ignore",
}));
const syntax = await vega.callTool({ name: "learn_vegalite_syntax", arguments: {} });
console.log("SYNTAX", JSON.stringify(syntax).slice(0, 400));
const good = {
  spec: { $schema: "https://vega.github.io/schema/vega-lite/v6.json", mark: "bar", encoding: { x: { field: "category", type: "nominal" }, y: { field: "value", type: "quantitative" } }, data: { name: "table" } },
  data: { table: [{ category: "A", value: 10 }, { category: "B", value: 20 }] },
};
console.log("GOOD", JSON.stringify(await vega.callTool({ name: "show_vegalite_chart", arguments: good })));
const bad = { spec: { mark: "bar", encoding: { x: { field: "category" }, y: { field: "value", type: "quantitative" } }, data: { name: "table" } }, data: good.data };
console.log("BAD", JSON.stringify(await vega.callTool({ name: "show_vegalite_chart", arguments: bad })));
const url = { spec: { mark: "bar", encoding: { x: { field: "category", type: "nominal" }, y: { field: "value", type: "quantitative" } }, data: { url: "https://example.com/data.json" } } };
console.log("URL", JSON.stringify(await vega.callTool({ name: "show_vegalite_chart", arguments: url })));
await vega.close();
