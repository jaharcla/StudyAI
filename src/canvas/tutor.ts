import { z } from "zod";
import { emptyCanvasDocument, parseCanvasDocument, type ScientificObject } from "./model";
import { synchronizeObject } from "./geometry";

export const canvasEditSchema = z.object({
  boardId: z.string(), objectId: z.string().describe("Top-level scientific object ID. For molecule edits use its molecule ID, never a child atom or bond ID."),
  patchJson: z.string().default("{}").describe("JSON field patch, e.g. a molecule name. For molecule atom/bond corrections use atomEdits/bondEdits instead of replacing arrays."),
  atomEdits: z.array(z.object({ id: z.string(), nonbondingElectrons: z.number().int().min(0) })).optional().describe("For molecule objects: update electron counts using exact child atom IDs."),
  bondEdits: z.array(z.object({ id: z.string(), order: z.union([z.literal(1), z.literal(1.5), z.literal(2), z.literal(3)]) })).optional().describe("For molecule objects: update bond orders in the active resonance form using exact bond IDs."),
  reason: z.string(),
});
export type CanvasEdit = z.infer<typeof canvasEditSchema>;
export type CanvasContext = { boardId: string; courseId: string; lessonId: string; objects: ScientificObject[] };
export type CanvasProposal = CanvasEdit & { before: ScientificObject; after: ScientificObject };

export function proposeCanvasEdit(context: CanvasContext, edit: CanvasEdit): CanvasProposal {
  if (context.boardId !== edit.boardId) throw new Error("The active board changed. Read its current context again.");
  const before = context.objects.find((object) => object.id === edit.objectId);
  if (!before) throw new Error("Scientific object not found on the active board.");
  const patch = JSON.parse(edit.patchJson);
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw new Error("The edit must be a JSON object.");
  if (Object.keys(patch).some((key) => ["id", "kind", "__proto__", "constructor", "prototype"].includes(key))) throw new Error("Object identity cannot be changed.");
  if (edit.atomEdits?.length || edit.bondEdits?.length) {
    if (before.kind !== "molecule") throw new Error("Atom and bond edits require the parent molecule object ID.");
    if (edit.atomEdits?.some((update) => !before.atoms.some((atom) => atom.id === update.id))) throw new Error("Atom not found in this molecule.");
    const active = before.resonanceForms.find((form) => form.id === before.activeResonanceId)!;
    if (edit.bondEdits?.some((update) => !active.bonds.some((bond) => bond.id === update.id))) throw new Error("Bond not found in the active resonance form.");
    if (edit.atomEdits?.length) patch.atoms = before.atoms.map((atom) => ({ ...atom, ...edit.atomEdits?.find((update) => update.id === atom.id) }));
    if (edit.bondEdits?.length) patch.resonanceForms = before.resonanceForms.map((form) => form.id !== active.id ? form : { ...form, bonds: form.bonds.map((bond) => ({ ...bond, ...edit.bondEdits?.find((update) => update.id === bond.id) })) });
  }
  const after = synchronizeObject(before, { ...before, ...patch });
  parseCanvasDocument({ ...emptyCanvasDocument(), objects: [after] });
  return { ...edit, patchJson: JSON.stringify(patch, null, 2), before: structuredClone(before), after };
}

export function applyCanvasProposal(context: CanvasContext, proposal: CanvasProposal): ScientificObject[] {
  const current = context.objects.find((object) => object.id === proposal.objectId);
  if (context.boardId !== proposal.boardId || JSON.stringify(current) !== JSON.stringify(proposal.before)) throw new Error("This proposal is stale. Ask the tutor to propose it again.");
  return context.objects.map((object) => object.id === proposal.objectId ? proposal.after : object);
}
