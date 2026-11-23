import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { writeEvidence, type EvidenceRecord } from "./evidence";

describe("writeEvidence", () => {
  it("writes JSON under the phase directory and returns a matching sha256", async () => {
    const record: EvidenceRecord = {
      experiment: "phase-0",
      phase: 0,
      kind: "smoke",
      payload: { ok: true, n: 42 },
      createdAt: "2026-11-23T00:00:00.000Z",
    };

    const { path: writtenPath, sha256 } = await writeEvidence(record);
    const bytes = await readFile(writtenPath);

    expect(writtenPath.replace(/\\/g, "/")).toContain(
      "evidence/phase-0/phase-0/"
    );
    expect(JSON.parse(bytes.toString("utf8"))).toEqual(record);
    expect(sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
  });
});
