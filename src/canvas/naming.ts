import type { ScientificObject } from "./model";

/** The human label a Tutor answer may use; never an internal id. */
export function objectName(object: ScientificObject): string {
  const fields = object as unknown as Record<string, unknown>;
  const name = ["label", "name", "title"].map((key) => fields[key]).find((value) => typeof value === "string" && value.trim());
  return typeof name === "string" ? name.trim().slice(0, 80) : object.kind;
}

/** Duplicate labels get a board-order qualifier so a name cannot point at two objects. */
export function displayNames(objects: ScientificObject[]): Map<string, string> {
  const totals = new Map<string, number>();
  for (const object of objects) {
    const name = objectName(object);
    totals.set(name, (totals.get(name) ?? 0) + 1);
  }
  const seen = new Map<string, number>();
  const names = new Map<string, string>();
  for (const object of objects) {
    const name = objectName(object);
    const total = totals.get(name)!;
    if (total === 1) {
      names.set(object.id, name);
      continue;
    }
    const index = (seen.get(name) ?? 0) + 1;
    seen.set(name, index);
    names.set(object.id, `${name} (${index} of ${total})`);
  }
  return names;
}
