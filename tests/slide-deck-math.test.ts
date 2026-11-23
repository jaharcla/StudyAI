import { describe, expect, it } from "vitest";
import { explainSolution } from "../server/presentations/math";

describe("explainSolution", () => {
  it("produces substitution steps and a verified 2-variable solution", () => {
    const result = explainSolution(["x + y = 60", "8x + 12y = 600"]);
    expect(result.solution).toEqual({ x: 30, y: 30 });
    expect(result.steps.join(" ")).toContain("y = 60 - x");
    expect(result.steps.join(" ")).toContain("8x + 12(60 - x) = 600");
    expect(result.steps.join(" ")).toContain("x = 30");
    expect(result.steps.join(" ")).toContain("y = 30");
    expect(result.checks).toContain("30 + 30 = 60");
    expect(result.checks).toContain("8*30 + 12*30 = 600");
  });

  it("solves and verifies a 3-variable word problem", () => {
    const result = explainSolution(["x + y + z = 60", "8x + 12y + 9z = 600", "y = z + 10"]);
    expect(result.solution).toEqual({ x: 18, y: 26, z: 16 });
    expect(result.checks).toContain("18 + 26 + 16 = 60");
    expect(result.checks).toContain("8*18 + 12*26 + 9*16 = 600");
  });

  it("rejects an inconsistent system", () => {
    expect(() => explainSolution(["x + y = 60", "x + y = 70"])).toThrow(/inconsistent/i);
  });
});
