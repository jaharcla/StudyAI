import { describe, expect, test } from "vitest";
import type { ScientificObject } from "../src/canvas/model";
import { displayNames, objectName } from "../src/canvas/naming";

function molecule(id: string, name: string): ScientificObject {
  return {
    id,
    kind: "molecule",
    name,
    x: 0,
    y: 0,
    width: 220,
    height: 110,
    atoms: [],
    resonanceForms: [{ id: `${id}-form`, name: "Form 1", bonds: [] }],
    activeResonanceId: `${id}-form`,
  };
}

describe("canvas human names", () => {
  test("uses a real label when the object has one", () => {
    expect(objectName(molecule("a", "  Carbon dioxide  "))).toBe("Carbon dioxide");
  });

  test("falls back to the kind when no human label exists", () => {
    expect(objectName({ id: "b", kind: "equation", x: 0, y: 0, expression: "x=1", variables: {} } as ScientificObject)).toBe("equation");
  });

  test("leaves unique names unchanged", () => {
    const names = displayNames([molecule("a", "Water"), molecule("b", "Oxygen")]);
    expect(names.get("a")).toBe("Water");
    expect(names.get("b")).toBe("Oxygen");
  });

  test("disambiguates duplicate labels without exposing ids", () => {
    const names = displayNames([molecule("atom-xyz", "Oxygen"), molecule("atom-abc", "Oxygen")]);
    expect(names.get("atom-xyz")).toBe("Oxygen (1 of 2)");
    expect(names.get("atom-abc")).toBe("Oxygen (2 of 2)");
    for (const name of names.values()) expect(name).not.toMatch(/atom-|xyz|abc/);
  });

  test("numbers three or more duplicates in board order", () => {
    const names = displayNames([molecule("a", "Force"), molecule("b", "Force"), molecule("c", "Force")]);
    expect([...names.values()]).toEqual(["Force (1 of 3)", "Force (2 of 3)", "Force (3 of 3)"]);
  });
});
