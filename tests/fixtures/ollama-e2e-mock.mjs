import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const model = "qwen3:latest";
const port = Number(process.env.MOCK_OLLAMA_PORT || 18599);
const endpoint = `http://127.0.0.1:${port}`;
const script = fileURLToPath(import.meta.url);

function response(res, status, value) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(value));
}

function text(value) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map((part) => typeof part === "string" ? part : part?.text ?? "").join("");
  return "";
}

function contextFrom(messages) {
  const system = messages.filter((item) => item.role === "system").map((item) => text(item.content)).join("\n");
  const start = "Workspace and canvas context: ";
  const end = ". Course evidence from the server: ";
  const content = system.split(start)[1]?.split(end)[0];
  try { return content ? JSON.parse(content) : []; } catch { return []; }
}

function toolCall(name, args) {
  return [{ function: { name, arguments: args } }];
}

function tutorReply(body) {
  const messages = body.messages ?? [];
  const query = text([...messages].reverse().find((item) => item.role === "user")?.content);
  const contexts = contextFrom(messages);
  const valueFor = (description) => {
    let value = contexts.find((item) => item.description === description)?.value;
    if (typeof value === "string") { try { value = JSON.parse(value); } catch {} }
    if (value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 1 && "value" in value) value = value.value;
    if (typeof value === "string") { try { value = JSON.parse(value); } catch {} }
    return value && typeof value === "object" ? value : {};
  };
  const science = valueFor("StudyAI active scientific canvas objects");
  const quickdraw = valueFor("Active Quickdraw board context");
  const boardId = quickdraw.scope?.boardId ?? science.boardId ?? "";
  if (process.env.MOCK_OLLAMA_DEBUG === "1") console.log(JSON.stringify({ queryFlags: { quickdraw: /propose_canvas_action/i.test(query), science: /propose_canvas_edit/i.test(query), vectorRead: /Read the vector/i.test(query), workspace: /STUDYAI-OLLAMA-OK/.test(query) }, contextDescriptions: contexts.map((item) => item.description), contextValues: contexts.map((item) => ({ description: item.description, type: typeof item.value, keys: item.value && typeof item.value === "object" ? Object.keys(item.value) : [] })), objectKinds: (science.objects ?? []).map((item) => item.kind), boardIdPresent: Boolean(boardId), toolNames: (body.tools ?? []).map((item) => item.function?.name ?? item.name) }));
  if (/propose_canvas_action/i.test(query)) {
    const label = query.match(/label\s+"([^"]+)"/i)?.[1] ?? "Approved AI label";
    const x = Number(query.match(/x\s*=\s*(\d+)/i)?.[1] ?? 250);
    const y = Number(query.match(/y\s*=\s*(\d+)/i)?.[1] ?? 200);
    return { content: "", tool_calls: toolCall("propose_canvas_action", { boardId, actions: [{ kind: "createText", x, y, text: label, style: { color: "blue", size: "m", font: "sans", scale: 1 } }] }) };
  }
  if (/propose_canvas_edit/i.test(query)) {
    const target = (science.objects ?? []).find((item) => item.kind === "molecule") ?? (science.objects ?? []).find((item) => item.kind === "vector");
    if (target?.kind === "molecule") {
      const atom = target.atoms[0];
      const bond = target.resonanceForms?.find((item) => item.id === target.activeResonanceId)?.bonds?.[0];
      return { content: "", tool_calls: toolCall("propose_canvas_edit", { boardId, objectId: target.id, patchJson: JSON.stringify({ name: "Tutor reviewed CO2" }), atomEdits: [{ id: atom.id, nonbondingElectrons: 4 }], bondEdits: [{ id: bond.id, order: 2 }], reason: "Apply the requested synthetic test correction for review." }) };
    }
    if (target?.kind === "vector") return { content: "", tool_calls: toolCall("propose_canvas_edit", { boardId, objectId: target.id, patchJson: JSON.stringify({ components: [80, 30, 0] }), reason: "Apply the requested synthetic test vector correction for review." }) };
  }
  if (/STUDYAI-OLLAMA-OK/.test(query)) return { content: "STUDYAI-OLLAMA-OK" };
  if (/assigned alloy code/i.test(query)) return { content: "The assigned alloy code is ZORBIUM-417, as stated in the imported lecture." };
  if (/LEWIS-7042/i.test(query)) return { content: "The lecture marker is LEWIS-7042. Carbon dioxide has two double bonds." };
  if (/Read the vector/i.test(query)) return { content: "The vector has x = 120 and y = 60." };
  return { content: "The requested synthetic study response is available." };
}

function serve() {
  const server = createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/api/tags") return response(res, 200, { models: [{ name: model, size: 1 }] });
    if (req.method !== "POST" || req.url !== "/api/chat") return response(res, 404, { error: "not found" });
    let raw = "";
    for await (const chunk of req) raw += chunk;
    let body;
    try { body = JSON.parse(raw); } catch { return response(res, 400, { error: "invalid JSON" }); }
    const reply = tutorReply(body);
    return response(res, 200, { model, created_at: new Date().toISOString(), message: { role: "assistant", ...reply }, done: true, done_reason: "stop", prompt_eval_count: 1, eval_count: 1 });
  });
  server.listen(port, "127.0.0.1");
  return server;
}

if (process.argv[2] === "--server") {
  serve();
} else {
  const fake = spawn(process.execPath, [script, "--server"], { env: { ...process.env, MOCK_OLLAMA_PORT: String(port) }, stdio: process.env.MOCK_OLLAMA_DEBUG === "1" ? "inherit" : "ignore" });
  let exitCode = 1;
  try {
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      try {
        const result = await fetch(`${endpoint}/api/tags`);
        if (result.ok) break;
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    const ready = await fetch(`${endpoint}/api/tags`).then((result) => result.ok).catch(() => false);
    if (!ready) throw new Error("Local Ollama mock did not become ready.");
    const cli = resolve("node_modules", "@playwright", "test", "cli.js");
    const args = process.argv.slice(2);
    const run = spawn(process.execPath, [cli, "test", ...args], { env: { ...process.env, OLLAMA_BASE_URL: endpoint, TUTOR_PROVIDER: "ollama", CANVAS_INFERENCE_PROVIDER: "ollama" }, stdio: "inherit" });
    exitCode = await new Promise((resolve, reject) => {
      run.once("error", reject);
      run.once("exit", (code) => resolve(code ?? 1));
    });
  } finally {
    fake.kill();
  }
  process.exitCode = exitCode;
}
