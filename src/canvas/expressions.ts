import type { MathNode } from "mathjs";
import type { ScientificObject } from "./model";

const functions = new Set(["sin", "cos", "tan", "asin", "acos", "atan", "sqrt", "abs", "exp", "log", "log10", "min", "max", "round", "floor", "ceil"]);
const constants = new Set(["pi", "e", "tau"]);
let engine: Promise<typeof import("mathjs/number")> | undefined;

export async function compileExpression(expression: string) {
  const normalized = expression.trim().replace(/^y\s*=\s*/, "").replaceAll("²", "^2").replaceAll("³", "^3");
  if (!normalized || normalized.length > 500) throw new Error("Enter an expression of 1–500 characters.");
  const math = await (engine ??= import("mathjs/number"));
  const node = math.parse(normalized);
  const variables = new Set<string>();
  let count = 0;
  node.traverse((child: MathNode, _path: string, parent: MathNode) => {
    if (++count > 150 || !["ConstantNode", "SymbolNode", "OperatorNode", "FunctionNode", "ParenthesisNode"].includes(child.type)) throw new Error("Use a numeric expression with variables and standard functions.");
    if (child.type === "FunctionNode" && !functions.has((child as unknown as { fn: { name: string } }).fn.name)) throw new Error("That function is unavailable.");
    if (child.type === "OperatorNode" && !["+", "-", "*", "/", "^", "%"].includes((child as unknown as { op: string }).op)) throw new Error("That operator is unavailable.");
    if (child.type === "ConstantNode" && (typeof (child as unknown as { value: unknown }).value !== "number" || !Number.isFinite((child as unknown as { value: number }).value))) throw new Error("Use finite numeric constants.");
    if (child.type === "SymbolNode") {
      const name = (child as unknown as { name: string }).name;
      if (parent?.type === "FunctionNode" && functions.has(name)) return;
      if (!/^[a-zA-Z][a-zA-Z0-9_]{0,31}$/.test(name) || ["constructor", "prototype", "__proto__", "Infinity", "NaN"].includes(name)) throw new Error("Invalid variable name.");
      if (!constants.has(name)) variables.add(name);
    }
  });
  const compiled = node.compile();
  return { variables: [...variables], evaluate(values: Record<string, number>) {
    const scope = new Map<string, number>();
    for (const name of variables) {
      if (!Number.isFinite(values[name])) throw new Error(`Supply a finite value for ${name}.`);
      scope.set(name, values[name]);
    }
    const result: unknown = compiled.evaluate(scope);
    if (typeof result !== "number" || !Number.isFinite(result)) throw new Error("The expression has no finite real result here.");
    return result;
  } };
}

export async function evaluateScientificObject(object: ScientificObject): Promise<ScientificObject> {
  if (object.kind !== "equation" && object.kind !== "graph") return object;
  try {
    const expression = await compileExpression(object.expression);
    if (object.kind === "equation") return { ...object, result: expression.evaluate(object.variables), evaluationError: undefined };
    if (expression.variables.some((name) => name !== "x")) throw new Error("A graph expression may only use x.");
    const [min, max] = object.xRange;
    if (max <= min) throw new Error("x maximum must exceed x minimum.");
    const points: Array<[number, number]> = [];
    for (let index = 0; index <= 120; index++) {
      const x = min + (max - min) * index / 120;
      try { points.push([x, expression.evaluate({ x })]); } catch { /* Domain gaps split the plotted path. */ }
    }
    if (!points.length) throw new Error("No finite points in this range.");
    return { ...object, points, evaluationError: undefined };
  } catch (error) {
    const evaluationError = error instanceof Error ? error.message : "Invalid expression.";
    return object.kind === "equation" ? { ...object, result: undefined, evaluationError } : { ...object, points: [], evaluationError };
  }
}
