export type CanvasRelationship = { fromId: string; toId: string; relation: string };

type RelationForm = { kind: string; direction: "directed" | "symmetric"; invert?: boolean };
const normalize = (value: string) => value.toLowerCase().normalize("NFKC").replace(/[‐‑‒–—]/g, "-").replace(/[^\p{L}\p{N}+\- ]/gu, " ").replace(/\s+/g, " ").trim();
const aliases = new Map<string, RelationForm>();
const define = (kind: string, direction: RelationForm["direction"], direct: string[], inverse: string[] = []) => {
  for (const phrase of direct) aliases.set(normalize(phrase), { kind, direction });
  for (const phrase of inverse) aliases.set(normalize(phrase), { kind, direction: "directed", invert: true });
};

define("single-bond", "symmetric", ["single bond", "bond order 1"]);
define("double-bond", "symmetric", ["double bond", "bond order 2"]);
define("unspecified-bond", "symmetric", ["bond", "chemical bond"]);
define("contains", "directed", ["contains", "encloses"], ["contained in", "inside of"]);
define("acts-on", "directed", ["acts on", "acts upon", "applies force to", "force on"], ["receives force from", "acted upon by"]);
define("visually-connected", "symmetric", ["connected", "visually connected", "connected by line", "visual connection"]);
define("balances", "symmetric", ["balances", "balance", "vertical balance", "in equilibrium with"]);
define("field-at", "directed", ["field at particle", "electric field at particle"]);

function canonical(edge: CanvasRelationship) {
  const relation = normalize(edge.relation), form = aliases.get(relation) ?? { kind: relation, direction: "directed" as const };
  return { fromId: form.invert ? edge.toId : edge.fromId, toId: form.invert ? edge.fromId : edge.toId, kind: form.kind, direction: form.direction };
}

function matches(expected: CanvasRelationship, actual: CanvasRelationship) {
  const a = canonical(expected), b = canonical(actual);
  if (!a.kind || a.kind !== b.kind || a.direction !== b.direction) return false;
  return a.fromId === b.fromId && a.toId === b.toId || a.direction === "symmetric" && a.fromId === b.toId && a.toId === b.fromId;
}

export function scoreCanvasRelationships(expected: CanvasRelationship[], actual: CanvasRelationship[]) {
  const matchedExpected = new Array(expected.length).fill(false);
  const assignedExpected = new Array(actual.length).fill(-1);
  const assign = (actualIndex: number, visited: boolean[]): boolean => {
    for (let expectedIndex = 0; expectedIndex < expected.length; expectedIndex++) {
      if (visited[expectedIndex] || !matches(expected[expectedIndex], actual[actualIndex])) continue;
      visited[expectedIndex] = true;
      if (matchedExpected[expectedIndex]) {
        const previous = assignedExpected.indexOf(expectedIndex);
        if (previous >= 0 && !assign(previous, visited)) continue;
      }
      matchedExpected[expectedIndex] = true;
      assignedExpected[actualIndex] = expectedIndex;
      return true;
    }
    return false;
  };
  let truePositives = 0;
  for (let i = 0; i < actual.length; i++) if (assign(i, new Array(expected.length).fill(false))) truePositives++;
  const precision = actual.length ? truePositives / actual.length : expected.length ? 0 : 1;
  const recall = expected.length ? truePositives / expected.length : actual.length ? 0 : 1;
  return { precision, recall, f1: precision + recall ? 2 * precision * recall / (precision + recall) : 0, truePositives, falsePositives: actual.length - truePositives, falseNegatives: expected.length - truePositives };
}

export function scoreCanvasRelationshipEndpoints(expected: CanvasRelationship[], actual: CanvasRelationship[]) {
  const endpointEdge = (edge: CanvasRelationship) => {
    const value = canonical(edge);
    return { fromId: value.fromId, toId: value.toId, relation: value.direction === "symmetric" ? "connected" : "acts on" };
  };
  const projectedExpected = expected.map(endpointEdge), projectedActual = actual.map(endpointEdge);
  return scoreCanvasRelationships(projectedExpected, projectedActual);
}

export function scoreCanvasRelationshipQuality(expected: CanvasRelationship[], actual: CanvasRelationship[]) {
  const endpoints = scoreCanvasRelationshipEndpoints(expected, actual);
  const typed = scoreCanvasRelationships(expected, actual);
  return { ...typed, endpointPrecision: endpoints.precision, endpointRecall: endpoints.recall, endpointF1: endpoints.f1, relationTypeAccuracy: endpoints.truePositives ? typed.truePositives / endpoints.truePositives : null };
}
