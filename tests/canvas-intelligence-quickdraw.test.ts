import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { Store } from "@quickdrawjs/react";
import { normalizeCanvasInput, quickdrawBondRelationships } from "../server/canvas-intelligence/input.js";
import { scoreCanvasRelationships } from "../server/canvas-intelligence/relationship-score.js";

const manifest = JSON.parse(await readFile(new URL("./fixtures/quickdraw-canvas/manifest.json", import.meta.url), "utf8"));
const validationManifest = JSON.parse(await readFile(new URL("./fixtures/quickdraw-validation/manifest.json", import.meta.url), "utf8"));
describe("serialized Quickdraw architecture fixtures", () => {
  it("covers chemistry, physics, biology, mixed labels, and ambiguous relationships", () => {
    expect(manifest.fixtures.map((fixture: any) => fixture.id)).toEqual([
      "chemistry-lewis-resonance", "physics-free-body", "biology-cell-annotations", "mixed-typed-handwritten", "ambiguous-incomplete-link",
    ]);
  });

  it("uses opaque IDs for validation inputs and includes a persisted human Store stroke", async () => {
    expect(validationManifest.fixtures.map((fixture: any) => fixture.id)).toContain("chemistry-lewis-resonance");
    expect(validationManifest.fixtures.map((fixture: any) => fixture.id)).toContain("physics-free-body");
    expect(validationManifest.humanDrawingSource).toContain("persisted local Quickdraw Store");
    for (const fixture of validationManifest.fixtures.filter((fixture: any) => !fixture.humanCreated)) {
      expect(fixture.expectedObjectIds.every((id: string) => /^qd_\d{3}$/.test(id))).toBe(true);
      const validationSnapshot = JSON.parse(await readFile(new URL(`./fixtures/quickdraw-validation/${fixture.id}.snapshot.json`, import.meta.url), "utf8"));
      expect(Object.keys(validationSnapshot.document.store).every((id) => /^qd_\d{3}$/.test(id))).toBe(true);
    }
    const human = validationManifest.fixtures.find((fixture: any) => fixture.humanCreated);
    const humanSnapshot = JSON.parse(await readFile(new URL(`./fixtures/quickdraw-validation/${human.id}.snapshot.json`, import.meta.url), "utf8"));
    const humanStore = new Store();
    humanStore.loadSnapshot(humanSnapshot, "remote");
    const shape: any = [...humanStore.shapes()][0];
    expect(shape.type).toBe("draw");
    expect(shape.props.pts).toHaveLength(219);
    expect(human.id).toBe("human-created-curve");
  });

  it("recovers Lewis single and double bonds from exact line geometry and gives known-correct relation outputs full credit", async () => {
    const fixture = validationManifest.fixtures.find((entry: any) => entry.id === "chemistry-lewis-resonance");
    const snapshot = JSON.parse(await readFile(new URL(`./fixtures/quickdraw-validation/${fixture.id}.snapshot.json`, import.meta.url), "utf8"));
    const input = normalizeCanvasInput({ boardId: fixture.id, snapshot });
    const relationships = quickdrawBondRelationships(input);
    expect(relationships.map(({ fromId, toId, relation }) => ({ fromId, toId, relation }))).toEqual(fixture.expectedRelationships);
    expect(scoreCanvasRelationships(fixture.expectedRelationships, relationships).f1).toBe(1);
  });

  for (const fixture of manifest.fixtures as Array<{ id: string; strokes: string[] }>) {
    it(`round-trips the real Quickdraw Store snapshot for ${fixture.id}`, async () => {
      const snapshot = JSON.parse(await readFile(new URL(`./fixtures/quickdraw-canvas/${fixture.id}.snapshot.json`, import.meta.url), "utf8"));
      const store = new Store();
      store.loadSnapshot(snapshot, "remote");
      expect(store.getSnapshot()).toEqual(snapshot);
      const normalized = normalizeCanvasInput({ boardId: fixture.id, snapshot });
      expect(normalized.nativeRecords.length).toBe(Object.keys(snapshot.document.store).length);
      expect(fixture.strokes.every((id) => normalized.nativeRecords.some((record) => record.id === id))).toBe(true);
      expect(normalized.nativeRecords.some((record) => record.type === "draw" && Array.isArray((record.geometry as any)?.points))).toBe(true);
      expect(normalized.nativeRecords.some((record) => record.type === "arrow")).toBe(fixture.id !== "ambiguous-incomplete-link");
      expect(normalized.relationships.length).toBeGreaterThan(0);
    });
  }
});
