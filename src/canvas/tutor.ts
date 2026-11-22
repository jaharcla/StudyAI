import { z } from "zod";
import { createObject, emptyCanvasDocument, newId, parseCanvasDocument, type ScientificObject } from "./model";
import { synchronizeObject } from "./geometry";
import { assertCanvasRevision, requireCanvasRevision } from "./proposal-revision";
import { verifyMathOperation } from "./math-workspace";
import type { MathStepOperation } from "./model";

const mathOperationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.enum(["add-constant", "subtract-constant", "multiply-constant", "divide-constant"]), value: z.number().finite() }),
  z.object({ kind: z.literal("divide-by-variable"), variable: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,31}$/) }),
  z.object({ kind: z.literal("expand") }),
]);

export const canvasEditSchema = z.object({
  boardId: z.string(), objectId: z.string().describe("Top-level scientific object ID. For molecule edits use its molecule ID, never a child atom or bond ID."),
  patchJson: z.string().default("{}").describe("JSON field patch, e.g. a molecule name. For molecule atom/bond corrections use atomEdits/bondEdits instead of replacing arrays."),
  atomEdits: z.array(z.object({ id: z.string(), nonbondingElectrons: z.number().int().min(0) })).optional().describe("For molecule objects: update electron counts using exact child atom IDs."),
  bondEdits: z.array(z.object({ id: z.string(), order: z.union([z.literal(1), z.literal(1.5), z.literal(2), z.literal(3)]) })).optional().describe("For molecule objects: update bond orders in the active resonance form using exact bond IDs."),
  mathOperation: mathOperationSchema.optional().describe("For a math workspace, request one explicitly supported operation on both current statement sides. Do not propose replacement algebra text; zero divisors are invalid, symbolic divisors require an explicit nonzero assumption, and every valid result still needs user approval."),
  reason: z.string(),
});
export type CanvasEdit = z.infer<typeof canvasEditSchema>;
export type CanvasContext = { boardId: string; courseId: string; lessonId: string; revision?: number; objects: ScientificObject[] };
export type CanvasProposal = CanvasEdit & { courseId: string; lessonId: string; baseRevision: number; expectedObjects: string; before: ScientificObject; after: ScientificObject };

export const scientificObjectKinds = ["atom", "bond", "molecule", "equation", "vector", "force", "measurement", "graph", "anatomy", "concept", "relationship", "linked-note", "linked-document", "question", "flashcard"] as const;
export const canvasObjectCreateSchema = z.object({
  boardId: z.string(),
  kind: z.enum(scientificObjectKinds),
  x: z.number().finite().min(-1_000_000).max(1_000_000),
  y: z.number().finite().min(-1_000_000).max(1_000_000),
  fieldsJson: z.string().default("{}").describe("JSON object fields such as title, definition, expression, components, or name. Omit id and kind; position may be refined with width and height."),
  reason: z.string().min(1).max(1000),
});
export type CanvasObjectCreateInput = z.infer<typeof canvasObjectCreateSchema>;
export type CanvasObjectProposal = CanvasObjectCreateInput & { courseId: string; lessonId: string; baseRevision: number; expectedObjects: string; object: ScientificObject };

/** Flat molecule schema: atom/bond indices instead of generated nested IDs. */
export const moleculeProposalSchema = z.object({
  boardId: z.string(),
  name: z.string().trim().min(1).max(120),
  x: z.number().finite(),
  y: z.number().finite(),
  atoms: z.array(z.object({
    element: z.enum(["H", "C", "N", "O", "F", "P", "S", "Cl", "Br", "I"]),
    nonbondingElectrons: z.number().int().min(0),
  })).min(2).max(30),
  bonds: z.array(z.object({
    from: z.number().int().nonnegative().describe("Zero-based index into atoms."),
    to: z.number().int().nonnegative().describe("Zero-based index into atoms."),
    order: z.union([z.literal(1), z.literal(1.5), z.literal(2), z.literal(3)]),
  })).min(1).max(60),
  reason: z.string().min(1).max(1000),
});
export type MoleculeProposalInput = z.infer<typeof moleculeProposalSchema>;

export function proposeMolecule(context: CanvasContext, value: unknown): CanvasObjectProposal {
  const input = moleculeProposalSchema.parse(value);
  const baseRevision = context.revision;
  requireCanvasRevision(baseRevision);
  if (input.bonds.some((bond) => bond.from >= input.atoms.length || bond.to >= input.atoms.length || bond.from === bond.to)) {
    throw new Error("Molecule bond endpoints must be distinct, valid atom indices.");
  }
  const atomIds = input.atoms.map(() => newId("atom"));
  const atoms = input.atoms.map((atom, index) => ({ ...atom, id: atomIds[index] }));
  const formId = newId("form");
  const bonds = input.bonds.map((bond) => ({ id: newId("bond"), from: atomIds[bond.from], to: atomIds[bond.to], order: bond.order }));
  const object: ScientificObject = {
    id: newId("molecule"), kind: "molecule", x: input.x, y: input.y, width: 260, height: 154,
    name: input.name, atoms, resonanceForms: [{ id: formId, name: "Resonance form 1", bonds }], activeResonanceId: formId,
  };
  parseCanvasDocument({ ...emptyCanvasDocument(), objects: [object] });
  return {
    boardId: input.boardId, courseId: context.courseId, lessonId: context.lessonId,
    kind: "molecule", x: input.x, y: input.y,
    fieldsJson: JSON.stringify({ name: input.name, atoms, resonanceForms: object.resonanceForms, activeResonanceId: formId }, null, 2),
    reason: input.reason, baseRevision, expectedObjects: JSON.stringify(context.objects), object,
  };
}

export class MathProposalValidationError extends Error {
  constructor(readonly status: "invalid" | "unknown" | "unsupported", message: string) { super(message); this.name = "MathProposalValidationError"; }
}

export async function proposeCanvasEdit(context: CanvasContext, edit: CanvasEdit): Promise<CanvasProposal> {
  const baseRevision = context.revision;
  requireCanvasRevision(baseRevision);
  if (context.boardId !== edit.boardId) throw new Error("The active board changed. Read its current context again.");
  const before = context.objects.find((object) => object.id === edit.objectId);
  if (!before) throw new Error("Scientific object not found on the active board.");
  const patch = JSON.parse(edit.patchJson);
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw new Error("The edit must be a JSON object.");
  if (Object.keys(patch).some((key) => ["id", "kind", "__proto__", "constructor", "prototype"].includes(key))) throw new Error("Object identity cannot be changed.");
  if (before.kind === "equation" && before.mathWorkspace && ["expression", "variables", "mathWorkspace"].some((key) => key in patch)) throw new Error("Math workspace changes must use validated notation or mathOperation paths.");
  if (edit.mathOperation) {
    if (before.kind !== "equation" || !before.mathWorkspace) throw new Error("Math operations require an active math workspace equation.");
    const verified = await verifyMathOperation(before.mathWorkspace, edit.mathOperation as MathStepOperation);
    if (verified.status !== "valid") throw new MathProposalValidationError(verified.status, verified.reason);
    patch.mathWorkspace = verified.state;
  }
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
  return { ...edit, courseId: context.courseId, lessonId: context.lessonId, baseRevision, expectedObjects: JSON.stringify(context.objects), patchJson: JSON.stringify(patch, null, 2), before: structuredClone(before), after };
}

export async function applyCanvasProposal(context: CanvasContext, proposal: CanvasProposal): Promise<ScientificObject[]> {
  const current = context.objects.find((object) => object.id === proposal.objectId);
  assertCanvasRevision(proposal.baseRevision, context.revision);
  if (context.boardId !== proposal.boardId || context.courseId !== proposal.courseId || context.lessonId !== proposal.lessonId || JSON.stringify(context.objects) !== proposal.expectedObjects || JSON.stringify(current) !== JSON.stringify(proposal.before)) throw new Error("This proposal is stale. Ask the tutor to propose it again.");
  if (proposal.mathOperation) {
    if (current?.kind !== "equation" || !current.mathWorkspace || proposal.after.kind !== "equation") throw new Error("The math workspace proposal is incomplete.");
    const verified = await verifyMathOperation(current.mathWorkspace, proposal.mathOperation as MathStepOperation);
    if (verified.status !== "valid" || JSON.stringify(verified.state) !== JSON.stringify(proposal.after.mathWorkspace)) throw new Error("The mathematical step no longer validates. Ask the tutor to propose it again.");
  }
  return context.objects.map((object) => object.id === proposal.objectId ? proposal.after : object);
}

export function proposeCanvasObject(context: CanvasContext, value: unknown, baseRevisionOverride?: number): CanvasObjectProposal {
  const baseRevision = baseRevisionOverride ?? context.revision;
  requireCanvasRevision(baseRevision);
  const input = canvasObjectCreateSchema.parse(value);
  if (context.boardId !== input.boardId) throw new Error("The active board changed. Read its current context again.");
  const fields = JSON.parse(input.fieldsJson || "{}");
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) throw new Error("Object fields must be a JSON object.");
  if (Object.keys(fields).some((key) => ["id", "kind", "__proto__", "constructor", "prototype"].includes(key))) throw new Error("Object identity cannot be supplied.");
  const base = createObject(input.kind, input.x, input.y);
  let object: ScientificObject;
  try {
    const parsed = parseCanvasDocument({
      version: 1,
      snapshot: emptyCanvasDocument().snapshot,
      objects: [synchronizeObject(base, { ...base, ...fields, id: newId(input.kind), kind: input.kind })],
    });
    object = parsed.objects[0];
  } catch (error) {
    throw new Error(`The proposed ${input.kind} object is invalid: ${error instanceof Error ? error.message : "validation failed"}.`);
  }
  return { ...input, fieldsJson: JSON.stringify(fields, null, 2), courseId: context.courseId, lessonId: context.lessonId, baseRevision, expectedObjects: JSON.stringify(context.objects), object };
}

export function applyCanvasObjectProposal(context: CanvasContext, proposal: CanvasObjectProposal): ScientificObject[] {
  assertCanvasRevision(proposal.baseRevision, context.revision);
  if (context.boardId !== proposal.boardId || context.courseId !== proposal.courseId || context.lessonId !== proposal.lessonId || JSON.stringify(context.objects) !== proposal.expectedObjects) throw new Error("This proposal is stale. Ask the tutor to propose it again.");
  if (context.objects.some((object) => object.id === proposal.object.id)) throw new Error("That object already exists on the board.");
  parseCanvasDocument({ ...emptyCanvasDocument(), objects: [...context.objects, proposal.object] });
  return [...context.objects, structuredClone(proposal.object)];
}
