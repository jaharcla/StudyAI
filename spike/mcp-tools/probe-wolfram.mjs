import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const client = new Client({ name: "studyai-spike", version: "0.0.0" });
const transport = new StreamableHTTPClientTransport(new URL("https://agenttools.wolfram.com/mcp"));
await client.connect(transport);
const tools = await client.listTools();
console.log(JSON.stringify(tools, null, 2));
await client.close();
