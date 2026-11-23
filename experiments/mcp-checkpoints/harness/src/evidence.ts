import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { EvidenceRecord } from "./types";

const EVIDENCE_ROOT = path.resolve(
  process.cwd(),
  "experiments/mcp-checkpoints/evidence"
);

function sanitize(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-");
}

export async function writeEvidence(
  record: EvidenceRecord
): Promise<{ path: string; sha256: string }> {
  const createdAt = record.createdAt ?? new Date().toISOString();
  const dir = path.join(
    EVIDENCE_ROOT,
    `phase-${record.phase}`,
    sanitize(record.experiment)
  );
  await mkdir(dir, { recursive: true });

  const stored = { ...record, createdAt };
  const filePath = path.join(
    dir,
    `${sanitize(record.kind)}-${sanitize(createdAt)}.json`
  );
  const bytes = Buffer.from(JSON.stringify(stored, null, 2), "utf8");
  await writeFile(filePath, bytes);

  return {
    path: filePath,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}
