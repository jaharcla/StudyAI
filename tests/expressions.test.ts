import { expect, it } from "vitest";
import { compileExpression, evaluateScientificObject, evaluateScientificObjects } from "../src/canvas/expressions";
import { createObject } from "../src/canvas/model";
import { createMathWorkspaceState } from "../src/canvas/math-workspace";

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

it("re-samples a linked graph with the current MathLive parameter value", async () => {
  const { expression, mathWorkspace } = await createMathWorkspaceState("x^{2}+a", "x^2+a");
  mathWorkspace.parameters.a.value = 4;
  const equation = { ...createObject("equation", 0, 0), expression, mathWorkspace };
  const graph = { ...createObject("graph", 0, 0), sourceEquationId: equation.id, xRange: [-10, 10] as [number, number] };
  if (equation.kind !== "equation" || graph.kind !== "graph") throw Error();
  const [, evaluated] = await evaluateScientificObjects([equation, graph]);
  expect(evaluated).toMatchObject({ points: expect.arrayContaining([[0, 4]]) });
});

it("rejects executable, assignment, accessor and unbounded expression syntax", async () => {
  for (const expression of ['import("x")', 'evaluate("2+2")', "a=2", "x.value", "[1,2,3]", '"text"', "factorial(100000)", "x".repeat(501)]) await expect(compileExpression(expression)).rejects.toThrow();
});
