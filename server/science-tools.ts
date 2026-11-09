import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { compileExpression } from "../src/canvas/expressions.js";
import { validateWithOpenChemLib } from "../src/canvas/chemistry.js";
import { formalCharge, vectorDot, vectorMagnitude, type Element } from "../src/science.js";

const vectorComponent = z.number().finite().min(-1e100).max(1e100);
const vector = z.tuple([vectorComponent, vectorComponent, vectorComponent]);
const molecule = z.object({
  name: z.string().trim().min(1).max(160),
  atoms: z.array(z.object({ id: z.string().min(1).max(80), element: z.enum(["H", "C", "N", "O", "F", "P", "S", "Cl", "Br", "I"]), nonbondingElectrons: z.number().int().min(0).max(32) }).strict()).min(1).max(100),
  resonanceForms: z.array(z.object({ id: z.string().min(1).max(80), name: z.string().max(160), bonds: z.array(z.object({ id: z.string().min(1).max(80), from: z.string().min(1).max(80), to: z.string().min(1).max(80), order: z.union([z.literal(1), z.literal(1.5), z.literal(2), z.literal(3)]) }).strict()).max(200) }).strict()).min(1).max(20),
  activeResonanceId: z.string().min(1).max(80),
}).strict().superRefine((value, context) => {
  const ids = new Set(value.atoms.map((atom) => atom.id));
  if (ids.size !== value.atoms.length) context.addIssue({ code: "custom", path: ["atoms"], message: "Atom IDs must be unique." });
  if (!value.resonanceForms.some((form) => form.id === value.activeResonanceId)) context.addIssue({ code: "custom", path: ["activeResonanceId"], message: "The active resonance form must exist." });
});

export function createScienceTools() {
  return [
    tool(async ({ expression, variables }) => {
      const compiled = await compileExpression(expression);
      const result = compiled.evaluate(variables ?? {});
      return JSON.stringify({ verified: true, expression, result, method: "bounded Math.js numeric expression" });
    }, {
      name: "calculate_expression",
      description: "Evaluate a numeric equation deterministically. Use only for explicit arithmetic; units are not converted.",
      schema: z.object({ expression: z.string().trim().min(1).max(500), variables: z.record(z.string(), z.number().finite()).default({}) }),
    }),
    tool(async ({ element, nonbondingElectrons, bondOrderSum }) => JSON.stringify({
      verified: true,
      element,
      formalCharge: formalCharge(element as Element, nonbondingElectrons, bondOrderSum),
      method: "valence electron count minus nonbonding electrons and bond order sum",
    }), {
      name: "calculate_formal_charge",
      description: "Calculate formal charge from an element, nonbonding electron count, and bond order sum.",
      schema: z.object({ element: z.enum(["H", "C", "N", "O", "F", "P", "S", "Cl", "Br", "I"]), nonbondingElectrons: z.number().int().min(0).max(32), bondOrderSum: z.number().finite().min(0).max(32) }),
    }),
    tool(async ({ operation, vectorA, vectorB }) => {
      const result = operation === "magnitude" ? vectorMagnitude(...vectorA) : operation === "dot" ? vectorDot(vectorA, vectorB!) : vectorA.map((value, index) => value + vectorB![index]);
      return JSON.stringify({ verified: true, operation, result, method: "Cartesian vector components" });
    }, {
      name: "calculate_vector",
      description: "Calculate vector magnitude, dot product, or component-wise sum from Cartesian components.",
      schema: z.object({ operation: z.enum(["magnitude", "dot", "add"]), vectorA: vector, vectorB: vector.optional() }).superRefine((value, context) => {
        if (value.operation !== "magnitude" && !value.vectorB) context.addIssue({ code: "custom", path: ["vectorB"], message: "A second vector is required." });
      }),
    }),
    tool(async ({ name, atoms, resonanceForms, activeResonanceId }) => {
      const result = validateWithOpenChemLib({ id: "tutor-molecule", kind: "molecule", x: 0, y: 0, width: 1, height: 1, name, atoms, resonanceForms, activeResonanceId });
      return JSON.stringify({ verified: true, valid: true, ...result, method: "OpenChemLib molecular structure validation" });
    }, {
      name: "validate_molecule",
      description: "Validate a bounded molecular structure and calculate its canonical SMILES with OpenChemLib. This does not verify the source drawing or all chemical context.",
      schema: molecule,
    }),
  ];
}
