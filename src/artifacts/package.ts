import { z } from "zod";
import { claimProvenanceSchema, componentOwner } from "./contracts";
import type { RetrievedEvidence } from "./context";

const finite = z.number().finite().min(-1_000_000).max(1_000_000);
const componentBase = {
  id: z.string().min(1).max(200),
  sourceRefs: z.array(z.string().min(1).max(400)).max(8).default([]),
  claims: z.array(claimProvenanceSchema).max(20).optional(),
};

/**
 * One authored step of a replayable worked example. `reveal`, `highlight` and `focus` are
 * aliases of objects the same artifact compiles — never coordinates. Claims reuse the single
 * provenance type; a non-direct claim is labelled in review, not rejected by the schema.
 */
export const exampleStepSchema = z.object({
  id: z.string().min(1).max(80),
  narration: z.string().min(1).max(1000),
  reveal: z.array(z.string().min(1).max(80)).max(12).default([]),
  highlight: z.array(z.string().min(1).max(80)).max(4).default([]),
  focus: z.string().min(1).max(80).optional(),
  claims: z.array(claimProvenanceSchema).max(10).optional(),
}).strict();
export type ExampleStep = z.infer<typeof exampleStepSchema>;

export const artifactComponentSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("explanation"), ...componentBase, text: z.string().min(1).max(4000), concepts: z.array(z.string().min(1).max(80)).max(8).default([]) }).strict(),
  z.object({ kind: z.literal("worked-example"), ...componentBase, prompt: z.string().min(1).max(2000), steps: z.array(z.string().min(1).max(1000)).min(1).max(20), answer: z.string().min(1).max(2000), states: z.array(exampleStepSchema).min(1).max(12).optional() }).strict(),
  z.object({
    kind: z.literal("diagram"), ...componentBase, title: z.string().min(1).max(120), surfaceAngleDeg: z.number().min(-180).max(180).optional(),
    forces: z.array(z.object({
      label: z.string().min(1).max(60),
      components: z.tuple([finite, finite]),
      position: z.object({ x: finite, y: finite }).strict().optional(),
    }).strict()).min(1).max(8).optional(),
  }).strict(),
  z.object({ kind: z.literal("equation"), ...componentBase, expression: z.string().min(1).max(500), variables: z.record(z.string().min(1).max(40), finite).default({}) }).strict(),
  z.object({
    kind: z.literal("graph"), ...componentBase, expression: z.string().min(1).max(500),
    xRange: z.tuple([finite, finite]).refine(([min, max]) => max > min, "xRange maximum must exceed minimum"),
    xLabel: z.string().min(1).max(40).default("x"), yLabel: z.string().min(1).max(40).default("y"),
  }).strict(),
  z.object({
    kind: z.literal("question"), ...componentBase,
    prompt: z.string().min(1).max(2000),
    answer: z.string().max(2000).optional(),
    scenario: z.string().min(40).max(2000).optional(),
    bloomLevel: z.literal("application").optional(),
  }).strict(),
  z.object({ kind: z.literal("flashcard"), ...componentBase, front: z.string().min(1).max(2000), back: z.string().min(1).max(2000) }).strict(),
  z.object({
    kind: z.literal("mind-map"), ...componentBase, title: z.string().min(1).max(120),
    nodes: z.array(z.object({ id: z.string().min(1).max(80), label: z.string().min(1).max(120) }).strict()).min(1).max(12),
    edges: z.array(z.object({ from: z.string().min(1).max(80), to: z.string().min(1).max(80) }).strict()).max(16).default([]),
  }).strict(),
  z.object({
    kind: z.literal("interactive-exercise"), ...componentBase, prompt: z.string().min(1).max(2000),
    exercise: z.discriminatedUnion("mode", [
      z.object({ mode: z.literal("graph-interpretation"), slope: finite, intercept: finite, xRange: z.tuple([finite, finite]).refine(([min, max]) => max > min, "xRange maximum must exceed minimum"), atX: finite }).strict(),
      z.object({ mode: z.literal("force-motion"), massKg: z.number().finite().positive().max(1_000_000), forcesN: z.array(finite).min(1).max(8) }).strict(),
    ]),
  }).strict(),
  z.object({
    kind: z.literal("summary"), ...componentBase, title: z.string().min(1).max(160),
    sections: z.array(z.object({ heading: z.string().min(1).max(160), body: z.string().min(1).max(4000) }).strict()).min(1).max(8),
  }).strict(),
  z.object({
    kind: z.literal("slide_deck"), ...componentBase,
    objective: z.string().min(1).max(280),
    templateId: z.string().min(1).max(80),
    language: z.literal("en"),
    slides: z.array(z.object({
      role: z.enum(["title", "overview", "mechanism", "example", "check", "summary"]),
      title: z.string().min(1).max(120),
      claims: z.array(claimProvenanceSchema).max(6).default([]),
      visual: z.object({
        kind: z.enum(["none", "diagram", "photo", "illustration"]),
        query: z.string().max(200).optional(),
        prompt: z.string().max(500).optional(),
        altText: z.string().min(1).max(300),
        credit: z.string().max(300).optional(),
      }).strict().optional(),
      notes: z.string().max(2000).optional(),
      math: z.object({
        equations: z.array(z.string().min(1).max(200)).min(1).max(4),
        variables: z.array(z.string().min(1).max(2)).min(1).max(4),
      }).strict().optional(),
    }).strict()).min(2).max(20),
  }).strict(),
]);

export const componentRelationSchema = z.object({
  from: z.string().min(1).max(200),
  to: z.string().min(1).max(200),
  relation: z.enum(["tests", "demonstrates", "explains", "summarizes", "extends"]),
}).strict();

export const artifactPackageSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1).max(200),
  objective: z.string().min(1).max(280),
  courseId: z.string().min(1).max(200),
  lessonId: z.string().min(1).max(200),
  /** Optional presentation intent: routes a diagram to the infographic studio projection. */
  format: z.enum(["study-guide", "infographic"]).optional(),
  components: z.array(artifactComponentSchema).max(20),
  outcome: z.object({
    status: z.literal("insufficient-source"),
    missing: z.array(z.string().min(1).max(200)).min(1).max(8),
    nextStep: z.string().min(1).max(1000),
  }).strict().optional(),
  relations: z.array(componentRelationSchema).max(40).default([]),
  provenance: z.object({ generatedAt: z.string().optional(), claims: z.array(claimProvenanceSchema).max(20).optional() }).strict().default({}),
  acceptance: z.object({ decision: z.enum(["pending", "accept", "correct", "decline"]).default("pending") }).strict().default({ decision: "pending" }),
}).strict().superRefine((value, context) => {
  if (!value.components.length && !value.outcome) {
    context.addIssue({ code: "custom", message: "A package needs at least one component unless it declares an insufficient-source outcome.", path: ["components"] });
  }
});

export type ArtifactComponent = z.infer<typeof artifactComponentSchema>;
export type ComponentRelation = z.infer<typeof componentRelationSchema>;
export type ArtifactPackage = z.infer<typeof artifactPackageSchema>;
export type SlideDeckComponent = Extract<ArtifactComponent, { kind: "slide_deck" }>;
export type SlideDeckSlide = SlideDeckComponent["slides"][number];

/**
 * Parse a package against the refs actually retrieved this turn, then enforce the shared
 * contract: every ref/claim ref was retrieved, every direct claim is contained in its chunk,
 * and every component has exactly one renderer. `retrievedChunks` is the containment authority;
 * callers that only have refs still get the ref and ownership checks.
 */
export function parseArtifactPackage(
  value: unknown,
  retrievedRefs: readonly string[],
  retrievedChunks?: readonly RetrievedEvidence[],
): ArtifactPackage {
  const pkg = artifactPackageSchema.parse(value);
  const ids = new Set<string>();
  for (const component of pkg.components) {
    if (ids.has(component.id)) throw new Error(`Duplicate component id: ${component.id}`);
    ids.add(component.id);
    if (!componentOwner(component.kind, pkg.format)) {
      throw new Error(`Component "${component.id}" of kind "${component.kind}" has no renderer.`);
    }
    for (const ref of component.sourceRefs) {
      if (!retrievedRefs.includes(ref)) throw new Error(`sourceRef "${ref}" was not retrieved this turn.`);
    }
  }
  const claims = [
    ...pkg.components.flatMap((component) => component.claims ?? []),
    ...(pkg.provenance.claims ?? []),
  ];
  for (const claim of claims) {
    if (!retrievedRefs.includes(claim.sourceRef)) {
      throw new Error(`Claim sourceRef "${claim.sourceRef}" was not retrieved this turn.`);
    }
  }
  if (retrievedChunks) {
    const textByRef = new Map(retrievedChunks.map((chunk) => [chunk.ref, chunk.text]));
    for (const claim of claims) {
      if (claim.relationship !== "direct") continue;
      const text = textByRef.get(claim.sourceRef);
      if (text === undefined || !text.includes(claim.excerpt)) {
        throw new Error(`Direct claim "${claim.claim}" has no excerpt containment in retrieved chunk "${claim.sourceRef}".`);
      }
    }
  }
  const edges = new Map<string, string[]>();
  for (const relation of pkg.relations) {
    if (!ids.has(relation.from) || !ids.has(relation.to)) throw new Error(`Relation references an unknown endpoint: ${relation.from} → ${relation.to}`);
    edges.set(relation.from, [...(edges.get(relation.from) ?? []), relation.to]);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visiting.has(id)) throw new Error(`Component relation cycle at ${id}.`);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const next of edges.get(id) ?? []) visit(next);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of ids) visit(id);
  return pkg;
}
