import { expect, it } from "vitest";
import { compileExpression, evaluateScientificObject } from "../src/canvas/expressions";
import { createObject } from "../src/canvas/model";

it("uses Math.js for variables, functions and legacy square notation", async () => {
  const expression = await compileExpression("a * sin(pi/2) + b^2");
  expect(expression.variables).toEqual(["a", "b"]);
  expect(expression.evaluate({ a: 3, b: 4 })).toBe(19);
  expect((await compileExpression("y = x²")).evaluate({ x: -3 })).toBe(9);
  expect(() => expression.evaluate({ a: 3 })).toThrow("Supply a finite value for b");
}, 15_000);

it("samples edited graphs and clears invalid results instead of keeping a stale plot", async () => {
  const graph = createObject("graph", 0, 0);
  if (graph.kind !== "graph") throw Error();
  const next = await evaluateScientificObject({ ...graph, expression: "2*x+1", xRange: [-2, 2] });
  expect(next).toMatchObject({ points: expect.arrayContaining([[-2, -3], [0, 1], [2, 5]]) });
  expect(await evaluateScientificObject({ ...graph, expression: "sqrt(-1)" })).toMatchObject({ points: [], evaluationError: expect.any(String) });
  expect(await evaluateScientificObject({ ...graph, xRange: [2, -2] })).toMatchObject({ points: [], evaluationError: "x maximum must exceed x minimum." });
});

it("rejects executable, assignment, accessor and unbounded expression syntax", async () => {
  for (const expression of ['import("x")', 'evaluate("2+2")', "a=2", "x.value", "[1,2,3]", '"text"', "factorial(100000)", "x".repeat(501)]) await expect(compileExpression(expression)).rejects.toThrow();
});
