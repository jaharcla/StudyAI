import { COMPONENT_OWNERS, componentOwner } from "./contracts";
import type { ArtifactComponent, ArtifactPackage } from "./package";

export type ProjectionTargets = { canvas: string[]; studio: string[]; learning: string[] };

/** Every advertised component kind, so a renderer-ownership test can cover the schema exhaustively. */
export const OWNED_KINDS = Object.keys(COMPONENT_OWNERS) as ArtifactComponent["kind"][];

/** Pure ownership map. A component appears in exactly one renderer's list, never zero or two. */
export function projectPackage(pkg: ArtifactPackage): ProjectionTargets {
  const targets: ProjectionTargets = { canvas: [], studio: [], learning: [] };
  for (const component of pkg.components) {
    const owner = componentOwner(component.kind, pkg.format);
    if (!owner) throw new Error(`Component "${component.id}" of kind "${component.kind}" has no renderer.`);
    targets[owner].push(component.id);
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
