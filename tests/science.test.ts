import { describe, expect, it } from "vitest";
import { formalCharge, vectorDot, vectorMagnitude } from "../src/science";

describe("scientific calculations", () => {
  it("calculates formal charges for standard Lewis structures", () => {
    expect(formalCharge("O", 4, 2)).toBe(0);
    expect(formalCharge("N", 2, 4)).toBe(-1);
    expect(formalCharge("N", 0, 4)).toBe(1);
  });
  it("calculates vector magnitude and dot product", () => {
    expect(vectorMagnitude(3, 4)).toBe(5);
    expect(vectorDot([1, 2, 3], [4, 5, 6])).toBe(32);
  });
});
