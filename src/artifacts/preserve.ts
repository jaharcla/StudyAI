import { stableJson } from "../canvas/stable-json";
import type { PreserveList, PreservableComponent, PreservableSource } from "./repair-message";

export type PreserveCheck =
  | { ok: true }
  | { ok: false; reason: "preserve-list-violation"; changed: string[] };

const refsOf = <T extends PreservableComponent>(source: PreservableSource<T>): string[] => source.components.flatMap((component) => component.sourceRefs).sort();

/** A repair may change only components named in the failure report; citations are immutable across the package. */
export function enforcePreserveList<T extends PreservableComponent>(
  original: PreservableSource<T>,
  candidate: PreservableSource<T>,
  preserve: PreserveList,
): PreserveCheck {
  const changed: string[] = [];
  const before = new Map(original.components.map((component) => [component.id, component]));
  const after = new Map(candidate.components.map((component) => [component.id, component]));
  for (const id of preserve.componentIds) {
    const originalComponent = before.get(id);
    const candidateComponent = after.get(id);
    if (!originalComponent || !candidateComponent || stableJson(originalComponent) !== stableJson(candidateComponent)) changed.push(id);
  }
  const originalRefs = refsOf(original);
  const candidateRefs = refsOf(candidate);
  if (stableJson(originalRefs) !== stableJson(candidateRefs)) {
    for (const ref of originalRefs) if (!candidateRefs.includes(ref) && !changed.includes(ref)) changed.push(ref);
    for (const ref of candidateRefs) if (!originalRefs.includes(ref) && !changed.includes(ref)) changed.push(ref);
    if (changed.length === 0) changed.push("sourceRefs");
  }
  return changed.length
    ? { ok: false, reason: "preserve-list-violation", changed }
    : { ok: true };
}
