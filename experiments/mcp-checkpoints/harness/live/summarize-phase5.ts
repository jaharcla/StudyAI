import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

type Row = {
  surface: string;
  taskId: string;
  calls: number;
  invalidCalls: number;
  retries: number;
  promptTokens: number;
  completionTokens: number;
  durationMs: number;
  completed: boolean;
  quality: number;
  attempts: number;
};

const dir = path.resolve("experiments/mcp-checkpoints/evidence/phase-5/phase-5-live");
const files = (await readdir(dir)).filter((f) => f.startsWith("summary-")).sort();
const latest = files[files.length - 1];
if (!latest) throw new Error("no summary evidence found");
const parsed: unknown = JSON.parse(await readFile(path.join(dir, latest), "utf8"));
const envelope = parsed as { payload?: unknown };
const rows = Array.isArray(envelope.payload) ? (envelope.payload as Row[]) : [];

for (const surface of ["current", "granular", "batched"]) {
  const subset = rows.filter((r) => r.surface === surface);
  const sum = (key: "calls" | "invalidCalls" | "retries" | "promptTokens" | "completionTokens" | "durationMs") =>
    subset.reduce((total, r) => total + r[key], 0);
  const successes = subset.filter((r) => r.completed).length;
  const avgQuality = subset.reduce((t, r) => t + r.quality, 0) / subset.length;
  console.log(
    [
      surface.padEnd(8),
      `success=${successes}/${subset.length}`,
      `calls=${sum("calls")}`,
      `calls/success=${successes ? (sum("calls") / successes).toFixed(1) : "n/a"}`,
      `tokens=${sum("promptTokens") + sum("completionTokens")}`,
      `tok/success=${successes ? ((sum("promptTokens") + sum("completionTokens")) / successes).toFixed(0) : "n/a"}`,
      `invalid=${sum("invalidCalls")}`,
      `retries=${sum("retries")}`,
      `modelRetries=${subset.reduce((t, r) => t + Math.max(0, r.attempts - 1), 0)}`,
      `ms=${sum("durationMs")}`,
      `quality=${avgQuality.toFixed(2)}`,
    ].join("  ")
  );
}
