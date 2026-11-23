import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { writeEvidence } from "../src/evidence.js";

type OpencodeEvent = {
  type?: string;
  sessionID?: string;
  part?: { type?: string; text?: string; tokens?: { input?: number; output?: number; reasoning?: number } };
  tokens?: { input?: number; output?: number; reasoning?: number };
  cost?: number;
};

type Artifact = {
  nodes: Array<{ id: string; type: string; text?: string; x: number; y: number; width: number; height: number }>;
  edges: Array<{ from: string; to: string; label?: string }>;
};

const [phaseArg, taskArg, sessionArg, ...defectArgs] = process.argv.slice(2);
if (phaseArg !== "A" && phaseArg !== "B") {
  throw new Error("usage: visual-ab-live.ts <A|B> <taskId> [sessionID] [defect text]");
}
const taskId = taskArg ?? "signup-flow";
const session = sessionArg && sessionArg !== "-" ? sessionArg : undefined;
const model = process.env.LIVE_MODEL ?? "opencode-go/beam-free";
const modelSlug = model.replace(/[^a-zA-Z0-9]+/g, "-");
const repo = process.cwd();
const upstream = path.resolve(repo, "experiments/mcp-checkpoints/checkpoints/upstream/mcp_excalidraw");
const evidenceDir = path.resolve(repo, `experiments/mcp-checkpoints/evidence/phase-1-live/${taskId}`);
await mkdir(evidenceDir, { recursive: true });

const defectText = defectArgs.join(" ");
const instruction = phaseArg === "A"
  ? "Create the requested diagram as a JSON scene. Return ONLY a JSON object with keys nodes and edges. nodes: array of {id,type,text,x,y,width,height} where type is rectangle, ellipse or diamond. edges: array of {from,to,label}. No prose, no markdown fences."
  : `The previous diagram had these defects: ${defectText || "unknown"}. Return ONLY a corrected JSON object with keys nodes and edges, same schema as before. No prose, no markdown fences.`;

const prompt = `${instruction}\n\nTask: ${taskId}. Use clear labels, at least 40px spacing, font size 16 or larger, and route arrows so they do not cross unrelated shapes.`;
const args = ["run", "--format", "json", "--model", model];
if (session) args.push("--session", session);
args.push(prompt);

const started = Date.now();
const opencodeScript = path.join(process.env.APPDATA ?? "", "npm", "opencode.ps1");
const run = spawnSync(
  "powershell.exe",
  ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", opencodeScript, ...args],
  { cwd: repo, encoding: "utf8", timeout: 600000, maxBuffer: 20 * 1024 * 1024 }
);
if (run.status !== 0) {
  const detail = [run.error?.message, run.signal, run.stderr, run.stdout].filter(Boolean).join(" | ").slice(-1500);
  throw new Error(`opencode failed (status=${run.status}, signal=${run.signal}): ${detail}`);
}
await writeFile(path.join(evidenceDir, `${taskId}-${modelSlug}-${phaseArg}-opencode.jsonl`), run.stdout);
const events: OpencodeEvent[] = run.stdout
  .split(/\r?\n/)
  .filter((line) => line.trim().startsWith("{"))
  .map((line) => JSON.parse(line) as OpencodeEvent);
const text = events
  .filter((e) => e.part?.type === "text")
  .map((e) => e.part?.text ?? "")
  .join("");
const totals = events.reduce(
  (acc, e) => ({
    input: acc.input + (e.tokens?.input ?? e.part?.tokens?.input ?? 0),
    output: acc.output + (e.tokens?.output ?? e.part?.tokens?.output ?? 0),
    reasoning: acc.reasoning + (e.tokens?.reasoning ?? e.part?.tokens?.reasoning ?? 0),
  }),
  { input: 0, output: 0, reasoning: 0 }
);
const sessionID = events.find((e) => e.sessionID)?.sessionID ?? "";
const durationMs = Date.now() - started;

const jsonMatch = text.match(/\{[\s\S]*\}/);
if (!jsonMatch) throw new Error(`no JSON object in model output: ${text.slice(0, 500)}`);
const artifact = JSON.parse(jsonMatch[0]) as Artifact;
if (!Array.isArray(artifact.nodes) || !Array.isArray(artifact.edges)) {
  throw new Error("model output missing nodes/edges arrays");
}

const elements = [
  ...artifact.nodes.map((n) => ({
    id: n.id,
    type: n.type,
    x: n.x,
    y: n.y,
    width: n.width,
    height: n.height,
    ...(n.text ? { text: n.text, fontSize: 18 } : {}),
    backgroundColor: n.type === "diamond" ? "#fff3bf" : "#a5d8ff",
    fillStyle: "solid",
  })),
  ...artifact.edges.map((e, i) => ({
    id: `edge-${i}`,
    type: "arrow",
    x: 0,
    y: 0,
    startElementId: e.from,
    endElementId: e.to,
    ...(e.label ? { text: e.label } : {}),
    endArrowhead: "arrow",
  })),
];

const clear = spawnSync("node", ["dist/bin.js", "clear", "--yes"], { cwd: upstream, encoding: "utf8" });
if (clear.status !== 0) throw new Error(`clear failed: ${clear.stderr}`);
const add = spawnSync("node", ["dist/bin.js", "add"], { cwd: upstream, encoding: "utf8", input: JSON.stringify(elements) });
if (add.status !== 0) throw new Error(`add failed: ${add.stderr}`);
const screenshotPath = path.join(evidenceDir, `${taskId}-${modelSlug}-${phaseArg}.png`);
const shot = spawnSync("node", ["dist/bin.js", "screenshot", "--out", screenshotPath], { cwd: upstream, encoding: "utf8" });
if (shot.status !== 0) throw new Error(`screenshot failed: ${shot.stderr}`);

await writeFile(path.join(evidenceDir, `${taskId}-${modelSlug}-${phaseArg}.json`), JSON.stringify(artifact, null, 2));
const payload = {
  model,
  phase: phaseArg,
  taskId,
  sessionID,
  prompt,
  defectText,
  artifact,
  elements,
  tokens: totals,
  durationMs,
  screenshots: [screenshotPath],
};
await writeEvidence({ experiment: "phase-1-live", phase: 1, kind: `${taskId}-${phaseArg}`, payload });
console.log(JSON.stringify({ model, phase: phaseArg, sessionID, nodes: artifact.nodes.length, edges: artifact.edges.length, tokens: totals, durationMs, screenshotPath }, null, 2));
