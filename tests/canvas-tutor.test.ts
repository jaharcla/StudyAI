import { describe, expect, it } from "vitest";
import { createObject } from "../src/canvas/model";
import { applyCanvasObjectProposal, applyCanvasProposal, proposeCanvasEdit, proposeCanvasObject } from "../src/canvas/tutor";

describe("tutor canvas proposals", () => {
  const object = createObject("molecule", 100, 100);
  const context = { boardId: "board-1", courseId: "chem-120", lessonId: "lesson-03", revision: 4, objects: [object] };
  const edit = { boardId: "board-1", objectId: object.id, patchJson: '{"name":"Reviewed CO2"}', reason: "Clarify the label" };
  it("proposes without mutating and applies the approved patch", async () => {
    const proposal = await proposeCanvasEdit(context, edit);
    expect(context.objects[0]).toEqual(object);
    expect((await applyCanvasProposal(context, proposal))[0]).toMatchObject({ id: object.id, kind: "molecule", name: "Reviewed CO2" });
  });
  it("rejects another board, unknown objects, identity changes and malformed science", async () => {
    for (const patch of [{ boardId: "other" }, { objectId: "other" }, { patchJson: '{"id":"replacement"}' }, { patchJson: '{"atoms":[{"id":"x","element":"XX","nonbondingElectrons":-1}]}' }]) {
      await expect(proposeCanvasEdit(context, { ...edit, ...patch })).rejects.toThrow();
    }
  });
  it("rejects proposals after manual edits or board changes", async () => {
    const proposal = await proposeCanvasEdit(context, edit);
    await expect(applyCanvasProposal({ ...context, boardId: "other" }, proposal)).rejects.toThrow("stale");
    await expect(applyCanvasProposal({ ...context, objects: [{ ...object, x: 300 }] }, proposal)).rejects.toThrow("stale");
    await expect(applyCanvasProposal({ ...context, revision: 5 }, proposal)).rejects.toThrow("stale");
    await expect(applyCanvasProposal({ ...context, courseId: "other-course" }, proposal)).rejects.toThrow("stale");
  });
  it("rejects edits that break structured object rendering or molecule references", async () => {
    const anatomy = createObject("anatomy", 100, 100);
    await expect(proposeCanvasEdit({ ...context, objects: [anatomy] }, { ...edit, objectId: anatomy.id, patchJson: '{"labels":null}' })).rejects.toThrow();
    if (object.kind !== "molecule") throw new Error("Expected molecule fixture");
    const forms = [{ ...object.resonanceForms[0], bonds: [{ ...object.resonanceForms[0].bonds[0], to: "missing-atom" }] }];
    await expect(proposeCanvasEdit(context, { ...edit, patchJson: JSON.stringify({ resonanceForms: forms }) })).rejects.toThrow("endpoints");
  });
  it("proposes adding one validated scientific object and applies it only after approval", () => {
    const input = { boardId: "board-1", kind: "concept" as const, x: 400, y: 250, fieldsJson: '{"title":"Entropy","definition":"A measure of disorder.","width":240,"height":120}', reason: "Add the concept named in the lesson" };
    const proposal = proposeCanvasObject(context, input);
    expect(context.objects).toHaveLength(1);
    expect(proposal.object).toMatchObject({ kind: "concept", title: "Entropy", definition: "A measure of disorder.", x: 400, y: 250, width: 240, height: 120 });
    expect(proposal.object.id).toMatch(/^concept-/);
    const next = applyCanvasObjectProposal(context, proposal);
    expect(next).toHaveLength(2);
    expect(next[1].id).toBe(proposal.object.id);
    expect(() => proposeCanvasObject(context, { ...input, boardId: "other" })).toThrow("board changed");
    expect(() => proposeCanvasObject(context, { ...input, fieldsJson: '{"id":"fixed"}' })).toThrow("identity");
    expect(() => proposeCanvasObject(context, { ...input, kind: "not-a-kind" as never })).toThrow();
    expect(() => proposeCanvasObject(context, { ...input, kind: "equation", fieldsJson: '{"variables":null}' })).toThrow("invalid");
    expect(() => applyCanvasObjectProposal({ ...context, revision: 5 }, proposal)).toThrow("stale");
  });

  it("merges typed Lewis corrections while preserving all atom, bond and resonance IDs", async () => {    if (object.kind !== "molecule") throw new Error("Expected molecule fixture");
    const proposal = await proposeCanvasEdit(context, { ...edit, atomEdits: [{ id: object.atoms[0].id, nonbondingElectrons: 6 }], bondEdits: [{ id: object.resonanceForms[0].bonds[0].id, order: 1 }] });
    const next = (await applyCanvasProposal(context, proposal))[0];
    if (next.kind !== "molecule") throw new Error("Expected molecule result");
    expect(next.atoms.map((atom) => atom.id)).toEqual(object.atoms.map((atom) => atom.id));
    expect(next.atoms[0].nonbondingElectrons).toBe(6);
    expect(next.resonanceForms[0].id).toBe(object.resonanceForms[0].id);
    expect(next.resonanceForms[0].bonds[0]).toMatchObject({ id: object.resonanceForms[0].bonds[0].id, order: 1 });
  });
});
