export type LinearSystem = {
  equations: string[];
  variables: string[];
  solution: Record<string, number>;
  steps: string[];
  checks: string[];
};

type Parsed = { coefficients: Map<string, number>; constant: number };

function parseSide(side: string): Parsed {
  const coefficients = new Map<string, number>();
  let constant = 0;
  const compact = side.replace(/\s+/g, "").replace(/\*/g, "");
  const tokens = compact.match(/[+-]?[^+-]+/g) ?? [];
  for (const token of tokens) {
    const sign = token.startsWith("-") ? -1 : 1;
    const body = token.replace(/^[+-]/, "");
    const variableMatch = /^(\d*)([a-zA-Z])$/.exec(body);
    if (variableMatch) {
      const name = variableMatch[2];
      const factor = variableMatch[1] ? Number(variableMatch[1]) : 1;
      coefficients.set(name, (coefficients.get(name) ?? 0) + sign * factor);
      continue;
    }
    if (/^\d+$/.test(body)) {
      constant += sign * Number(body);
      continue;
    }
    throw new Error(`Unsupported equation term: ${token}`);
  }
  return { coefficients, constant };
}

function parseEquation(equation: string, variables: string[]): { row: number[]; rhs: number } {
  const [left, right] = equation.split("=");
  if (!left || !right) throw new Error(`Invalid equation: ${equation}`);
  const lhs = parseSide(left);
  const rhs = parseSide(right);
  const row = variables.map((name) => (lhs.coefficients.get(name) ?? 0) - (rhs.coefficients.get(name) ?? 0));
  return { row, rhs: rhs.constant - lhs.constant };
}

function solveSystem(equations: string[], variables: string[]): Record<string, number> {
  const system = equations.map((equation) => parseEquation(equation, variables));
  const n = variables.length;
  if (system.length !== n) throw new Error("A square system is required.");

  const matrix = system.map(({ row, rhs }) => [...row, rhs]);
  for (let column = 0; column < n; column++) {
    let pivot = column;
    while (pivot < n && matrix[pivot][column] === 0) pivot++;
    if (pivot === n) throw new Error("The system is inconsistent or underdetermined.");
    [matrix[column], matrix[pivot]] = [matrix[pivot], matrix[column]];
    const divisor = matrix[column][column];
    matrix[column] = matrix[column].map((value) => value / divisor);
    for (let row = 0; row < n; row++) {
      if (row === column) continue;
      const factor = matrix[row][column];
      if (factor === 0) continue;
      matrix[row] = matrix[row].map((value, index) => value - factor * matrix[column][index]);
    }
  }
  const solution: Record<string, number> = {};
  variables.forEach((name, index) => {
    const value = matrix[index][n];
    solution[name] = Math.abs(value - Math.round(value)) < 1e-9 ? Math.round(value) : Number(value.toFixed(6));
  });
  return solution;
}

function substituted(expression: string, values: Record<string, number>): string {
  return expression
    .replace(/(\d)([a-zA-Z])/g, "$1*$2")
    .replace(/[a-zA-Z]/g, (name) => String(values[name] ?? 0));
}

function substitutionSteps(equations: string[], variables: string[], solution: Record<string, number>): string[] {
  const [first, second] = equations;
  if (!first || !second || variables.length !== 2) return [];
  const parsedFirst = parseEquation(first, variables);
  const [a, b] = parsedFirst.row;
  if (b === 0 || parsedFirst.rhs % b !== 0) return [];
  const isolate = variables[1];
  const other = variables[0];
  const constant = parsedFirst.rhs / b;
  const coefficient = a / b;
  const expression = coefficient === 1 ? `${constant} - ${other}` : coefficient === -1 ? `${other} - ${constant}` : `(${parsedFirst.rhs} - ${a}${other})/${b}`;
  const steps = [
    `Isolate ${isolate}: ${isolate} = ${expression}`,
    `Substitute into the other equation: ${second.replace(new RegExp(isolate, "g"), `(${expression})`)}`,
    `Solve: ${other} = ${solution[other]}`,
    `Back-substitute: ${isolate} = ${solution[isolate]}`,
  ];
  return steps;
}

/** Deterministic linear-system solver plus human-readable steps and verification. */
export function explainSolution(equations: string[], variablesInput?: string[]): LinearSystem {
  const variables = variablesInput ?? [...new Set(equations.join(" ").match(/[a-zA-Z]/g) ?? [])].sort();
  if (!variables.length) throw new Error("No variables found.");
  const solution = solveSystem(equations, variables);
  const steps = substitutionSteps(equations, variables, solution);
  if (!steps.length) {
    for (const equation of equations) steps.push(`Solve the system: ${equation}`);
    for (const name of variables) steps.push(`${name} = ${solution[name]}`);
  }
  const checks = equations.map((equation) => {
    const [left, right] = equation.split("=");
    return `${substituted(left, solution).trim()} = ${substituted(right, solution).trim()}`.replace(/\s+/g, " ");
  });
  for (const equation of equations) {
    const { row, rhs } = parseEquation(equation, variables);
    const total = row.reduce((sum, coefficient, index) => sum + coefficient * solution[variables[index]], 0);
    if (Math.abs(total - rhs) > 1e-9) throw new Error("The system is inconsistent.");
  }
  return { equations, variables, solution, steps, checks };
}
