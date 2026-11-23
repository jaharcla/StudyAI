import type { ArtifactComponent, ArtifactPackage } from "./package";

export type ProjectionTargets = { canvas: string[]; studio: string[]; learning: string[] };

const CANVAS_KINDS = new Set<ArtifactComponent["kind"]>([
  "question", "worked-example", "flashcard", "diagram", "graph", "equation", "mind-map",
]);

/** Pure ownership map. A component appears in exactly one renderer's list. */
export function projectPackage(pkg: ArtifactPackage): ProjectionTargets {
  const targets: ProjectionTargets = { canvas: [], studio: [], learning: [] };
  for (const component of pkg.components) {
    if (CANVAS_KINDS.has(component.kind) || component.kind === "explanation") targets.canvas.push(component.id);
    else if (component.kind === "summary") targets.studio.push(component.id);
    else targets.learning.push(component.id);
  }
  return targets;
}

/** Narrow a package's components to the requested kinds, preserving package order. */
export function componentsOfKind<T extends ArtifactComponent["kind"]>(
  pkg: ArtifactPackage,
  kinds: readonly T[],
): Array<Extract<ArtifactComponent, { kind: T }>> {
  return pkg.components.filter((component): component is Extract<ArtifactComponent, { kind: T }> =>
    (kinds as readonly string[]).includes(component.kind));
}
