import { describe, expect, it } from "vitest";
import { evaluateMath, type MathResult } from "../src/math/evaluator";

function ok(input: unknown): Extract<MathResult, { status: "ok" }> {
  const result = evaluateMath(input);
  if (result.status !== "ok") throw new Error(`expected ok, got: ${JSON.stringify(result)}`);
  return result;
}

function errorReason(input: unknown): string {
  const result = evaluateMath(input);
  if (result.status !== "error") throw new Error(`expected error, got: ${JSON.stringify(result)}`);
  return result.reason;
}

const simplify = (expression: string) => ok({ operation: "simplify", arguments: { expression } });

describe("simplify", () => {
  it("returns exact reduced rationals", () => {
    expect(simplify("1/2 + 1/3").result).toBe("5/6");
    expect(simplify("2 + 3 * 4").result).toBe("14");
    expect(simplify("(2+3)^2").result).toBe("25");
    expect(simplify("3/4 - 1/2").result).toBe("1/4");
    expect(simplify("(1/2) / (1/4)").result).toBe("2");
    expect(simplify("-3 + 5").result).toBe("2");
    expect(simplify("0.5 + 0.25").result).toBe("3/4");
  });

  it("normalizes fractions to lowest terms", () => {
    const result = simplify("2/4");
    expect(result.result).toBe("1/2");
    expect(result.method).toContain("exact");
    expect(result.computed).toBe(true);
    expect(result.operation).toBe("simplify");
  });

  it("computes perfect roots exactly and labels float fallback", () => {
    expect(simplify("sqrt(9)").result).toBe("3");
    expect(simplify("sqrt(9)").method).toContain("exact");
    const approx = simplify("sqrt(2)");
    expect(Number(approx.result)).toBeCloseTo(Math.SQRT2, 10);
    expect(approx.method.toLowerCase()).toMatch(/float|numeric|approx/);
    expect(approx.computed).toBe(true);
  });

  it("supports allowlisted functions and constants", () => {
    expect(simplify("abs(-5)").result).toBe("5");
    expect(Number(simplify("sin(0)").result)).toBeCloseTo(0, 10);
    expect(Number(simplify("ln(1)").result)).toBeCloseTo(0, 10);
    expect(Number(simplify("log(100)").result)).toBeCloseTo(2, 10);
    expect(Number(simplify("exp(0)").result)).toBeCloseTo(1, 10);
    expect(Number(simplify("pi").result)).toBeCloseTo(Math.PI, 10);
    expect(Number(simplify("cos(0)").result)).toBeCloseTo(1, 10);
    expect(Number(simplify("tan(0)").result)).toBeCloseTo(0, 10);
  });
});

describe("solve", () => {
  const solve = (expression: string, variable?: string) =>
    ok({ operation: "solve", arguments: variable ? { expression, variable } : { expression } });

  it("solves linear equations exactly", () => {
    expect(solve("2x + 3 = 7").result).toBe("x = 2");
    expect(solve("3x - 5 = x + 3").result).toBe("x = 4");
    expect(solve("x/2 + 1 = 3").result).toBe("x = 4");
    expect(solve("2x = 1/2").result).toBe("x = 1/4");
  });

  it("honours a supplied variable name", () => {
    expect(solve("2y = 6", "y").result).toBe("y = 3");
  });

  it("reports degenerate and non-linear equations explicitly", () => {
    expect(errorReason({ operation: "solve", arguments: { expression: "x = x + 1" } })).toContain("no solution");
    expect(errorReason({ operation: "solve", arguments: { expression: "x + 1 = 1 + x" } })).toContain("infinitely many");
    expect(errorReason({ operation: "solve", arguments: { expression: "x^2 = 4" } })).toContain("non-linear");
  });
});

describe("check_equivalence", () => {
  const equivalent = (left: string, right: string) =>
    ok({ operation: "check_equivalence", arguments: { left, right } });

  it("proves rational and canonical linear equivalence", () => {
    expect(equivalent("2+2", "4").result).toBe("true");
    expect(equivalent("1/2 + 1/2", "1").result).toBe("true");
    expect(equivalent("x+x", "2x").result).toBe("true");
  });

  it("disproves equivalence exactly", () => {
    expect(equivalent("2+2", "5").result).toBe("false");
    expect(equivalent("x+1", "x+2").result).toBe("false");
  });

  it("returns unknown when it cannot prove equivalence", () => {
    expect(equivalent("sqrt(2)^2", "2").result).toBe("unknown");
    expect(equivalent("sin(x)^2 + cos(x)^2", "1").result).toBe("unknown");
    expect(equivalent("x^2", "x*x").result).toBe("unknown");
    expect(equivalent("x", "y").result).toBe("unknown");
  });
});

describe("unit_convert", () => {
  const convert = (value: unknown, from: string, to: string) =>
    ok({ operation: "unit_convert", arguments: { value, from, to } });

  it("uses a fixed conversion table with exact factors", () => {
    expect(convert(100, "cm", "m").result).toBe("1");
    expect(convert(1, "km", "m").result).toBe("1000");
    expect(convert(1, "in", "cm").result).toBe("127/50");
    expect(convert(1, "kg", "g").result).toBe("1000");
    expect(convert(1, "h", "s").result).toBe("3600");
  });

  it("handles affine temperature conversions", () => {
    expect(convert(100, "C", "F").result).toBe("212");
    expect(convert(32, "F", "C").result).toBe("0");
  });

  it("rejects units outside the table", () => {
    expect(errorReason({ operation: "unit_convert", arguments: { value: 1, from: "furlong", to: "m" } })).toContain("Unsupported unit");
  });
});

describe("typed errors and bounds", () => {
  it("rejects a non-object input and a missing operation", () => {
    expect(errorReason("2+2")).toContain("object");
    expect(errorReason({ arguments: {} })).toContain("operation");
  });

  it("rejects unknown operations and unknown fields", () => {
    expect(errorReason({ operation: "integrate", arguments: {} })).toContain("Unsupported operation");
    expect(errorReason({ operation: "simplify", arguments: { expression: "1+1" }, extra: true })).toContain("Unknown field");
    expect(errorReason({ operation: "simplify", arguments: { expression: "1+1", extra: true } })).toContain("Unknown field");
  });

  it("rejects unsupported functions and identifiers", () => {
    expect(errorReason({ operation: "simplify", arguments: { expression: "foo(2)" } })).toContain("Unsupported function");
    expect(errorReason({ operation: "simplify", arguments: { expression: "y + 1" } })).toContain("Unsupported identifier");
  });

  it("enforces length, depth, node, exponent and magnitude bounds", () => {
    expect(errorReason({ operation: "simplify", arguments: { expression: "1+".repeat(120) } })).toContain("length");
    expect(errorReason({ operation: "simplify", arguments: { expression: "(".repeat(80) + "1" + ")".repeat(80) } })).toContain("depth");
    expect(errorReason({ operation: "simplify", arguments: { expression: "1+".repeat(50) + "1" } })).toContain("node");
    expect(errorReason({ operation: "simplify", arguments: { expression: "2^33" } })).toContain("exponent");
    expect(errorReason({ operation: "simplify", arguments: { expression: "1000000000000 * 1000000000000" } })).toContain("magnitude");
  });

  it("reports division by zero and malformed expressions", () => {
    expect(errorReason({ operation: "simplify", arguments: { expression: "1/0" } })).toContain("Division by zero");
    expect(errorReason({ operation: "simplify", arguments: { expression: "2 +" } })).toContain("Malformed");
  });

  it("never includes a citation in a calculation result", () => {
    const result = simplify("2+2");
    expect(result).not.toHaveProperty("citation");
    expect(result).not.toHaveProperty("source");
  });
});
