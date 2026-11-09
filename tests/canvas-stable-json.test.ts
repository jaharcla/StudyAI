import { describe, expect, it } from "vitest";
import { stableJson } from "../src/canvas/stable-json";

describe("stable canvas JSON", () => {
  it("matches an object with undefined geometry refs after JSON persistence", () => {
    const vector = {
      kind: "vector",
      geometry: {
        tail: { x: 10, y: 20 },
        tip: { x: 30, y: 40 },
        tailRef: undefined,
        tipRef: undefined,
      },
    };
    const persisted = JSON.parse(JSON.stringify(vector));

    expect(stableJson(vector)).toBe(stableJson(persisted));
  });
});
