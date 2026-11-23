import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.join(here, ".vendor", "vega-mcp-server");

const client = new Client({ name: "studyai-spike", version: "0.0.0" });
const transport = new StdioClientTransport({
  command: "uv",
  args: ["run", "--directory", serverDir, "fastmcp", "run", "server.py"],
  cwd: serverDir,
  stderr: "pipe",
});
transport.stderr?.on("data", (chunk) => process.stderr.write(`[vega] ${chunk}`));
await client.connect(transport);
console.log(JSON.stringify(await client.listTools(), null, 2));
await client.close();
