import { describe, it, expect } from "vitest";
import { generateCodes } from "./generate-codes.js";

describe("offline credit code generator", () => {
  it("generates the requested number of unique codes", () => {
    const codes = generateCodes(100, 500_000);
    expect(codes).toHaveLength(100);
    expect(new Set(codes).size).toBe(100);
  });

  it("uses the prefix and fixed grouped-hex format", () => {
    const codes = generateCodes(5, 500_000, "TEST");
    for (const code of codes) {
      expect(code).toMatch(/^TEST-[0-9a-f]{4}(-[0-9a-f]{4}){3}$/);
    }
  });

  it("rejects a non-positive count and value", () => {
    expect(() => generateCodes(0, 500_000)).toThrow();
    expect(() => generateCodes(-1, 500_000)).toThrow();
    expect(() => generateCodes(5, 0)).toThrow();
    expect(() => generateCodes(5, -1)).toThrow();
  });

  it("rejects a pack above the $20 cap", () => {
    expect(() => generateCodes(5, 20_000_001)).toThrow();
  });
});
