import { z } from "zod";
import { claimProvenanceSchema } from "./contracts";

const finite = z.number().finite().min(-1_000_000).max(1_000_000);
const componentBase = {
  id: z.string().min(1).max(200),
  sourceRefs: z.array(z.string().min(1).max(400)).max(8).default([]),
  claims: z.array(claimProvenanceSchema).max(20).optional(),
};

export const artifactComponentSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("explanation"), ...componentBase, text: z.string().min(1).max(4000), concepts: z.array(z.string().min(1).max(80)).max(8).default([]) }).strict(),
  z.object({ kind: z.literal("worked-example"), ...componentBase, prompt: z.string().min(1).max(2000), steps: z.array(z.string().min(1).max(1000)).min(1).max(20), answer: z.string().min(1).max(2000) }).strict(),
  z.object({
    kind: z.literal("diagram"), ...componentBase, title: z.string().min(1).max(120), surfaceAngleDeg: z.number().min(-180).max(180).optional(),
    forces: z.array(z.object({ label: z.string().min(1).max(60), components: z.tuple([finite, finite]) }).strict()).min(1).max(8).optional(),
  }).strict(),
  z.object({ kind: z.literal("equation"), ...componentBase, expression: z.string().min(1).max(500), variables: z.record(z.string().min(1).max(40), finite).default({}) }).strict(),
  z.object({
    kind: z.literal("graph"), ...componentBase, expression: z.string().min(1).max(500),
    xRange: z.tuple([finite, finite]).refine(([min, max]) => max > min, "xRange maximum must exceed minimum"),
    xLabel: z.string().min(1).max(40).default("x"), yLabel: z.string().min(1).max(40).default("y"),
  }).strict(),
  z.object({ kind: z.literal("question"), ...componentBase, prompt: z.string().min(1).max(2000), answer: z.string().max(2000).optional() }).strict(),
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
  components: z.array(artifactComponentSchema).min(1).max(20),
  relations: z.array(componentRelationSchema).max(40).default([]),
  provenance: z.object({ generatedAt: z.string().optional(), claims: z.array(claimProvenanceSchema).max(20).optional() }).strict().default({}),
  acceptance: z.object({ decision: z.enum(["pending", "accept", "correct", "decline"]).default("pending") }).strict().default({ decision: "pending" }),
}).strict();

export type ArtifactComponent = z.infer<typeof artifactComponentSchema>;
export type ComponentRelation = z.infer<typeof componentRelationSchema>;
export type ArtifactPackage = z.infer<typeof artifactPackageSchema>;

/** Parse a package against the refs actually retrieved this turn, then validate its relation graph. */
export function parseArtifactPackage(value: unknown, retrievedRefs: readonly string[]): ArtifactPackage {
  const pkg = artifactPackageSchema.parse(value);
  const ids = new Set<string>();
  for (const component of pkg.components) {
    if (ids.has(component.id)) throw new Error(`Duplicate component id: ${component.id}`);
    ids.add(component.id);
    for (const ref of component.sourceRefs) {
      if (!retrievedRefs.includes(ref)) throw new Error(`sourceRef "${ref}" was not retrieved this turn.`);
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
