import { z } from "zod";
import { emptyCanvasDocument, parseCanvasDocument, type ScientificObject } from "./model";
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
