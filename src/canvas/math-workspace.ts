import { compileExpression } from "./expressions";
import type { MathParameter, MathStepOperation, MathWorkspaceState, SerializableMathAst } from "./model";

const symbolName = /^[a-zA-Z][a-zA-Z0-9_]{0,31}$/;

export type MathVerification =
  | { status: "valid"; reason: string; state: MathWorkspaceState }
  | { status: "invalid" | "unknown" | "unsupported"; reason: string };

export async function createMathWorkspaceState(latex: string, expression: string, previous?: MathWorkspaceState, values: Record<string, number> = {}) {
  if (latex.length > 500) throw new Error("Math notation is limited to 500 characters.");
  const normalizedExpression = expression.trim().replace(/^y\s*=\s*/, "").replaceAll("²", "^2").replaceAll("³", "^3");
  const compiled = await compileExpression(normalizedExpression);
  const math = await import("mathjs/number");
  const node = math.parse(normalizedExpression);
  const expressionAst = JSON.parse(JSON.stringify((node as unknown as { toJSON: () => SerializableMathAst }).toJSON())) as SerializableMathAst;
  const parameters: Record<string, MathParameter> = {};
  for (const name of compiled.variables.filter((variable) => variable !== "x")) {
    const previousParameter = previous?.parameters[name];
    const value = values[name] ?? previousParameter?.value ?? 0;
    const min = previousParameter?.min ?? (value < -10 ? value - 10 : -10);
    const max = previousParameter?.max ?? (value > 10 ? value + 10 : 10);
    if (![value, min, max].every(Number.isFinite) || min >= max || value < min || value > max) throw new Error(`Parameter ${name} must stay between ${min} and ${max}.`);
    parameters[name] = {
      value,
      min,
      max,
      step: previousParameter?.step ?? 0.1,
    };
  }
  return {
    expression: normalizedExpression,
    variables: Object.fromEntries(compiled.variables.map((name) => [name, name === "x" ? values.x ?? 0 : parameters[name]?.value ?? values[name] ?? 0])),
    mathWorkspace: {
      schemaVersion: 1 as const,
      latex,
      expressionAst,
      parameters,
      dependencies: previous?.dependencies ?? [],
      assumptions: previous?.assumptions ?? [],
      domainRestrictions: previous?.domainRestrictions ?? [],
      revision: (previous?.revision ?? 0) + 1,
      statement: previous?.statement ?? { left: "", right: "" },
      verifiedSteps: previous?.verifiedSteps ?? [],
    },
  };
}

export function tutorMathWorkspace(state: MathWorkspaceState) {
  return {
    schemaVersion: state.schemaVersion,
    revision: state.revision,
    parameters: Object.fromEntries(Object.entries(state.parameters).slice(0, 20)),
    dependencies: state.dependencies.slice(0, 20),
    assumptions: state.assumptions.slice(0, 20),
    domainRestrictions: state.domainRestrictions.slice(0, 20),
    statement: { left: state.statement.left.slice(0, 500), right: state.statement.right.slice(0, 500) },
    recentVerifiedSteps: state.verifiedSteps.slice(-3),
  };
}

function isKnownNonZero(variable: string, state: MathWorkspaceState) {
  const escaped = variable.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [new RegExp(`^\\s*${escaped}\\s*(?:!=|≠)\\s*0\\s*$`), new RegExp(`^\\s*0\\s*(?:!=|≠)\\s*${escaped}\\s*$`)];
  return [...state.assumptions, ...state.domainRestrictions].some((item) => patterns.some((pattern) => pattern.test(item)));
}

function wrapSide(side: string, operator: string, operand: string) {
  return `(${side}) ${operator} (${operand})`;
}

export async function verifyMathOperation(state: MathWorkspaceState, operation: MathStepOperation): Promise<MathVerification> {
  if (operation.kind === "expand") return { status: "unsupported", reason: "Expansion is not in the supported transformation set." };
  const { left, right } = state.statement;
  if (!left.trim() || !right.trim()) return { status: "invalid", reason: "Enter both sides of the current equation first." };
  try {
    await Promise.all([compileExpression(left), compileExpression(right)]);
  } catch {
    return { status: "invalid", reason: "The current equation contains unsupported or invalid math." };
  }

  let operator: string;
  let operand: string;
  if (operation.kind === "divide-by-variable") {
    if (!symbolName.test(operation.variable)) return { status: "invalid", reason: "Use a single valid variable name as the divisor." };
    if (!isKnownNonZero(operation.variable, state)) return { status: "unknown", reason: `Cannot divide by ${operation.variable} without a preserved nonzero assumption.` };
    operator = "/";
    operand = operation.variable;
  } else {
    if (!Number.isFinite(operation.value)) return { status: "invalid", reason: "The operation needs a finite constant." };
    if ((operation.kind === "divide-constant" || operation.kind === "multiply-constant") && operation.value === 0) return { status: "invalid", reason: "A zero factor can change the solution set." };
    operator = operation.kind === "add-constant" ? "+" : operation.kind === "subtract-constant" ? "-" : operation.kind === "multiply-constant" ? "*" : "/";
    operand = String(operation.value);
  }

  const after = { left: wrapSide(left, operator, operand), right: wrapSide(right, operator, operand) };
  try {
    await Promise.all([compileExpression(after.left), compileExpression(after.right)]);
  } catch {
    return { status: "unsupported", reason: "The transformed statement exceeds the supported expression subset." };
  }
  const step = { operation, before: { ...state.statement }, after, status: "valid" as const, assumptions: [...state.assumptions], domainRestrictions: [...state.domainRestrictions] };
  return {
    status: "valid",
    reason: `Apply ${operation.kind} to both sides; assumptions and domain restrictions are preserved.`,
    state: { ...state, statement: after, revision: state.revision + 1, verifiedSteps: [...state.verifiedSteps, step].slice(-100) },
  };
}
