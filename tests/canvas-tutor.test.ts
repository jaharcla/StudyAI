import { describe, expect, it } from "vitest";
import { createObject } from "../src/canvas/model";
import { applyCanvasProposal, proposeCanvasEdit } from "../src/canvas/tutor";

describe("tutor canvas proposals", () => {
  const object = createObject("molecule", 100, 100);
  const context = { boardId: "board-1", courseId: "chem-120", lessonId: "lesson-03", objects: [object] };
  const edit = { boardId: "board-1", objectId: object.id, patchJson: '{"name":"Reviewed CO2"}', reason: "Clarify the label" };
  it("proposes without mutating and applies the approved patch", () => {
    const proposal = proposeCanvasEdit(context, edit);
    expect(context.objects[0]).toEqual(object);
    expect(applyCanvasProposal(context, proposal)[0]).toMatchObject({ id: object.id, kind: "molecule", name: "Reviewed CO2" });
  });
  it("rejects another board, unknown objects, identity changes and malformed science", () => {
    for (const patch of [{ boardId: "other" }, { objectId: "other" }, { patchJson: '{"id":"replacement"}' }, { patchJson: '{"atoms":[{"id":"x","element":"XX","nonbondingElectrons":-1}]}' }]) {
      expect(() => proposeCanvasEdit(context, { ...edit, ...patch })).toThrow();
    }
  });
  it("rejects proposals after manual edits or board changes", () => {
    const proposal = proposeCanvasEdit(context, edit);
    expect(() => applyCanvasProposal({ ...context, boardId: "other" }, proposal)).toThrow("stale");
    expect(() => applyCanvasProposal({ ...context, objects: [{ ...object, x: 300 }] }, proposal)).toThrow("stale");
  });
  it("rejects edits that break structured object rendering or molecule references", () => {
    const anatomy = createObject("anatomy", 100, 100);
    expect(() => proposeCanvasEdit({ ...context, objects: [anatomy] }, { ...edit, objectId: anatomy.id, patchJson: '{"labels":null}' })).toThrow();
    if (object.kind !== "molecule") throw new Error("Expected molecule fixture");
    const forms = [{ ...object.resonanceForms[0], bonds: [{ ...object.resonanceForms[0].bonds[0], to: "missing-atom" }] }];
    expect(() => proposeCanvasEdit(context, { ...edit, patchJson: JSON.stringify({ resonanceForms: forms }) })).toThrow("endpoints");
  });
  it("merges typed Lewis corrections while preserving all atom, bond and resonance IDs", () => {
    if (object.kind !== "molecule") throw new Error("Expected molecule fixture");
    const proposal = proposeCanvasEdit(context, { ...edit, atomEdits: [{ id: object.atoms[0].id, nonbondingElectrons: 6 }], bondEdits: [{ id: object.resonanceForms[0].bonds[0].id, order: 1 }] });
    const next = applyCanvasProposal(context, proposal)[0];
    if (next.kind !== "molecule") throw new Error("Expected molecule result");
    expect(next.atoms.map((atom) => atom.id)).toEqual(object.atoms.map((atom) => atom.id));
    expect(next.atoms[0].nonbondingElectrons).toBe(6);
    expect(next.resonanceForms[0].id).toBe(object.resonanceForms[0].id);
    expect(next.resonanceForms[0].bonds[0]).toMatchObject({ id: object.resonanceForms[0].bonds[0].id, order: 1 });
  });
});
