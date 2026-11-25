/**
 * Bounded, deterministic math evaluator. The model proposes a typed operation;
 * this module does all computation locally. No eval, Function, dynamic import,
 * process, filesystem or network access — only BigInt and Math.
 */

export type MathResult =
  | { status: "ok"; operation: string; result: string; method: string; computed: true }
  | { status: "error"; reason: string };

const MAX_EXPRESSION_LENGTH = 200;
const MAX_AST_DEPTH = 64;
const MAX_AST_NODES = 80;
const MAX_EXPONENT = 32;
const MAX_MAGNITUDE = 1_000_000_000_000n;

class BoundedMathError extends Error {}
function fail(reason: string): never {
  throw new BoundedMathError(reason);
}

// Exact rational arithmetic ------------------------------------------------

type Rat = { n: bigint; d: bigint };
const absBig = (v: bigint): bigint => (v < 0n ? -v : v);

function gcd(a: bigint, b: bigint): bigint {
  let x = absBig(a);
  let y = absBig(b);
  while (y !== 0n) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x || 1n;
}

function checkMagnitude(value: Rat): void {
  if (absBig(value.n) > MAX_MAGNITUDE || absBig(value.d) > MAX_MAGNITUDE) {
    fail("Numeric magnitude exceeds limit.");
  }
}

function rat(n: bigint, d: bigint = 1n): Rat {
  if (d === 0n) fail("Division by zero.");
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  const g = gcd(n, d);
  const value = { n: n / g, d: d / g };
  checkMagnitude(value);
  return value;
}

const addR = (a: Rat, b: Rat): Rat => rat(a.n * b.d + b.n * a.d, a.d * b.d);
const subR = (a: Rat, b: Rat): Rat => rat(a.n * b.d - b.n * a.d, a.d * b.d);
const mulR = (a: Rat, b: Rat): Rat => rat(a.n * b.n, a.d * b.d);
const negR = (a: Rat): Rat => rat(-a.n, a.d);
const absR = (a: Rat): Rat => rat(absBig(a.n), a.d);
const ratEqual = (a: Rat, b: Rat): boolean => a.n === b.n && a.d === b.d;

function divR(a: Rat, b: Rat): Rat {
  if (b.n === 0n) fail("Division by zero.");
  return rat(a.n * b.d, a.d * b.n);
}

function powR(base: Rat, exponent: number): Rat {
  if (!Number.isInteger(exponent) || Math.abs(exponent) > MAX_EXPONENT) {
    fail("exponent exceeds maximum magnitude.");
  }
  if (exponent === 0) return rat(1n);
  const sign = exponent < 0 ? -1 : 1;
  let k = Math.abs(exponent);
  let power = base;
  let result = rat(1n);
  while (k > 0) {
    if (k % 2 === 1) result = mulR(result, power);
    power = mulR(power, power);
    k = Math.floor(k / 2);
  }
  return sign < 0 ? divR(rat(1n), result) : result;
}

function parseRational(text: string): Rat {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match) fail("Malformed expression.");
  const fraction = match[2] ?? "";
  const scale = 10n ** BigInt(fraction.length);
  const numerator = BigInt(match[1]) * scale + BigInt(fraction || "0");
  return rat(numerator, scale);
}

function formatRat(value: Rat): string {
  return value.d === 1n ? value.n.toString() : `${value.n}/${value.d}`;
}

// Values: exact rationals first, labelled float fallback otherwise ----------

type Value = { kind: "exact"; value: Rat } | { kind: "approx"; value: number };

const finite = (value: number): Value => {
  if (!Number.isFinite(value)) fail("Numeric magnitude exceeds limit.");
  return { kind: "approx", value };
};
const toNumber = (value: Value): number =>
  value.kind === "exact" ? Number(value.value.n) / Number(value.value.d) : value.value;
const valueString = (value: Value): string =>
  value.kind === "exact" ? formatRat(value.value) : String(value.value);
const valueMethod = (value: Value): string =>
  value.kind === "exact" ? "exact rational arithmetic" : "numeric approximation (float fallback)";

function perfectSquare(value: bigint): bigint | null {
  if (value < 0n) return null;
  const root = BigInt(Math.floor(Math.sqrt(Number(value))));
  return root * root === value ? root : null;
}

const FUNCTIONS = new Set(["sqrt", "abs", "sin", "cos", "tan", "log", "ln", "exp"]);
const CONSTANTS: Record<string, number> = { pi: Math.PI, e: Math.E, tau: Math.PI * 2 };

function callFunction(name: string, argument: Value): Value {
  switch (name) {
    case "sqrt": {
      if (argument.kind === "exact") {
        const n = perfectSquare(argument.value.n);
        const d = perfectSquare(argument.value.d);
        if (n !== null && d !== null) return { kind: "exact", value: rat(n, d) };
      }
      return finite(Math.sqrt(toNumber(argument)));
    }
    case "abs":
      return argument.kind === "exact"
        ? { kind: "exact", value: absR(argument.value) }
        : finite(Math.abs(argument.value));
    case "sin":
      return finite(Math.sin(toNumber(argument)));
    case "cos":
      return finite(Math.cos(toNumber(argument)));
    case "tan":
      return finite(Math.tan(toNumber(argument)));
    case "log":
      return finite(Math.log10(toNumber(argument)));
    case "ln":
      return finite(Math.log(toNumber(argument)));
    case "exp":
      return finite(Math.exp(toNumber(argument)));
    default:
      return fail(`Unsupported function: ${name}.`);
  }
}

// Tokenizer and recursive-descent parser ------------------------------------

type Token = { kind: "number" | "name" | "op"; value: string };

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const char = source[i];
    if (/\s/.test(char)) {
      i += 1;
      continue;
    }
    if (/[0-9]/.test(char)) {
      let end = i;
      while (end < source.length && /[0-9]/.test(source[end])) end += 1;
      if (source[end] === ".") {
        end += 1;
        while (end < source.length && /[0-9]/.test(source[end])) end += 1;
      }
      tokens.push({ kind: "number", value: source.slice(i, end) });
      i = end;
      continue;
    }
    if (/[A-Za-z_]/.test(char)) {
      let end = i;
      while (end < source.length && /[A-Za-z0-9_]/.test(source[end])) end += 1;
      tokens.push({ kind: "name", value: source.slice(i, end) });
      i = end;
      continue;
    }
    if ("+-*/^(),=".includes(char)) {
      tokens.push({ kind: "op", value: char });
      i += 1;
      continue;
    }
    fail("Malformed expression.");
  }
  return tokens;
}

type BinaryOp = "+" | "-" | "*" | "/" | "^";
type Node =
  | { kind: "number"; value: Rat }
  | { kind: "float"; value: number }
  | { kind: "var"; name: string }
  | { kind: "binary"; op: BinaryOp; left: Node; right: Node }
  | { kind: "neg"; value: Node }
  | { kind: "call"; name: string; argument: Node };

class Parser {
  private position = 0;
  private nodes = 0;

  constructor(private readonly tokens: Token[]) {}

  private peek(): Token | undefined {
    return this.tokens[this.position];
  }

  private take(): Token {
    const token = this.tokens[this.position];
    if (!token) fail("Malformed expression.");
    this.position += 1;
    return token;
  }

  private expect(value: string): void {
    const token = this.take();
    if (token.kind !== "op" || token.value !== value) fail("Malformed expression.");
  }

  private node<T extends Node>(node: T): T {
    this.nodes += 1;
    if (this.nodes > MAX_AST_NODES) fail("Expression exceeds maximum node count.");
    return node;
  }

  get done(): boolean {
    return this.position === this.tokens.length;
  }

  parse(depth: number): Node {
    if (depth > MAX_AST_DEPTH) fail("Expression exceeds maximum depth.");
    return this.parseAdd(depth + 1);
  }

  private parseAdd(depth: number): Node {
    if (depth > MAX_AST_DEPTH) fail("Expression exceeds maximum depth.");
    let left = this.parseMul(depth + 1);
    while (this.peek()?.kind === "op" && (this.peek()?.value === "+" || this.peek()?.value === "-")) {
      const op = this.take().value as "+" | "-";
      const right = this.parseMul(depth + 1);
      left = this.node({ kind: "binary", op, left, right });
    }
    return left;
  }

  private parseMul(depth: number): Node {
    if (depth > MAX_AST_DEPTH) fail("Expression exceeds maximum depth.");
    let left = this.parseUnary(depth + 1);
    while (true) {
      const token = this.peek();
      let op: BinaryOp;
      if (token?.kind === "op" && (token.value === "*" || token.value === "/")) {
        op = this.take().value as BinaryOp;
      } else if (token?.kind === "number" || token?.kind === "name" || (token?.kind === "op" && token.value === "(")) {
        // Implicit multiplication: 2x, 2(x+1), x(y+1).
        op = "*";
      } else {
        break;
      }
      const right = this.parseUnary(depth + 1);
      left = this.node({ kind: "binary", op, left, right });
    }
    return left;
  }

  private parseUnary(depth: number): Node {
    if (depth > MAX_AST_DEPTH) fail("Expression exceeds maximum depth.");
    const token = this.peek();
    if (token?.kind === "op" && (token.value === "+" || token.value === "-")) {
      this.take();
      const value = this.parseUnary(depth + 1);
      return token.value === "-" ? this.node({ kind: "neg", value }) : value;
    }
    return this.parsePower(depth + 1);
  }

  private parsePower(depth: number): Node {
    if (depth > MAX_AST_DEPTH) fail("Expression exceeds maximum depth.");
    const left = this.parsePrimary(depth + 1);
    if (this.peek()?.kind === "op" && this.peek()?.value === "^") {
      this.take();
      const right = this.parseUnary(depth + 1);
      if (right.kind === "number") {
        const exponent = Number(right.value.n) / Number(right.value.d);
        if (!Number.isInteger(exponent) || Math.abs(exponent) > MAX_EXPONENT) {
          fail("exponent exceeds maximum magnitude.");
        }
      }
      return this.node({ kind: "binary", op: "^", left, right });
    }
    return left;
  }

  private parsePrimary(depth: number): Node {
    if (depth > MAX_AST_DEPTH) fail("Expression exceeds maximum depth.");
    const token = this.take();
    if (token.kind === "number") return this.node({ kind: "number", value: parseRational(token.value) });
    if (token.kind === "op" && token.value === "(") {
      const inner = this.parse(depth + 1);
      this.expect(")");
      return inner;
    }
    if (token.kind === "name") {
      if (this.peek()?.kind === "op" && this.peek()?.value === "(") {
        if (!FUNCTIONS.has(token.value)) fail(`Unsupported function: ${token.value}.`);
        this.take();
        const argument = this.parse(depth + 1);
        this.expect(")");
        return this.node({ kind: "call", name: token.value, argument });
      }
      if (Object.prototype.hasOwnProperty.call(CONSTANTS, token.value)) {
        return this.node({ kind: "float", value: CONSTANTS[token.value] });
      }
      return this.node({ kind: "var", name: token.value });
    }
    return fail("Malformed expression.");
  }
}

function parseExpression(source: unknown): Node {
  if (typeof source !== "string" || source.length === 0) fail("Expression must be a non-empty string.");
  if (source.length > MAX_EXPRESSION_LENGTH) fail("Expression exceeds maximum length.");
  const parser = new Parser(tokenize(source));
  const node = parser.parse(0);
  if (!parser.done) fail("Malformed expression.");
  return node;
}

function collectVars(node: Node): Set<string> {
  const vars = new Set<string>();
  const visit = (current: Node): void => {
    switch (current.kind) {
      case "var":
        vars.add(current.name);
        break;
      case "neg":
        visit(current.value);
        break;
      case "call":
        visit(current.argument);
        break;
      case "binary":
        visit(current.left);
        visit(current.right);
        break;
      default:
        break;
    }
  };
  visit(node);
  return vars;
}

function evaluateNode(node: Node): Value {
  switch (node.kind) {
    case "number":
      return { kind: "exact", value: node.value };
    case "float":
      return finite(node.value);
    case "var":
      return fail(`Unsupported identifier: ${node.name}.`);
    case "neg": {
      const value = evaluateNode(node.value);
      return value.kind === "exact"
        ? { kind: "exact", value: negR(value.value) }
        : finite(-value.value);
    }
    case "call":
      return callFunction(node.name, evaluateNode(node.argument));
    case "binary": {
      const left = evaluateNode(node.left);
      const right = evaluateNode(node.right);
      if (node.op === "^") {
        if (left.kind === "exact" && right.kind === "exact" && right.value.d === 1n) {
          return { kind: "exact", value: powR(left.value, Number(right.value.n)) };
        }
        const exponent = toNumber(right);
        if (!Number.isInteger(exponent) || Math.abs(exponent) > MAX_EXPONENT) {
          fail("exponent exceeds maximum magnitude.");
        }
        return finite(Math.pow(toNumber(left), exponent));
      }
      if (left.kind === "exact" && right.kind === "exact") {
        const a = left.value;
        const b = right.value;
        switch (node.op) {
          case "+":
            return { kind: "exact", value: addR(a, b) };
          case "-":
            return { kind: "exact", value: subR(a, b) };
          case "*":
            return { kind: "exact", value: mulR(a, b) };
          case "/":
            return { kind: "exact", value: divR(a, b) };
          default:
            return fail("Malformed expression.");
        }
      }
      const a = toNumber(left);
      const b = toNumber(right);
      switch (node.op) {
        case "+":
          return finite(a + b);
        case "-":
          return finite(a - b);
        case "*":
          return finite(a * b);
        case "/":
          if (b === 0) fail("Division by zero.");
          return finite(a / b);
        default:
          return fail("Malformed expression.");
      }
    }
    default:
      return fail("Malformed expression.");
  }
}

// Symbolic linear form: a*variable + b, or null when not provably linear ----

type LinearForm = { a: Rat; b: Rat };

function linearForm(node: Node, variable: string): LinearForm | null {
  switch (node.kind) {
    case "number":
      return { a: rat(0n), b: node.value };
    case "float":
      return null;
    case "var":
      return node.name === variable ? { a: rat(1n), b: rat(0n) } : null;
    case "neg": {
      const inner = linearForm(node.value, variable);
      return inner ? { a: negR(inner.a), b: negR(inner.b) } : null;
    }
    case "call":
      return null;
    case "binary": {
      if (node.op === "^") {
        if (node.right.kind !== "number" || node.right.value.d !== 1n) return null;
        const exponent = node.right.value.n;
        if (exponent === 0n) return { a: rat(0n), b: rat(1n) };
        if (exponent === 1n) return linearForm(node.left, variable);
        return null;
      }
      const left = linearForm(node.left, variable);
      const right = linearForm(node.right, variable);
      if (!left || !right) return null;
      if (node.op === "+") return { a: addR(left.a, right.a), b: addR(left.b, right.b) };
      if (node.op === "-") return { a: subR(left.a, right.a), b: subR(left.b, right.b) };
      if (node.op === "*") {
        if (left.a.n === 0n) return { a: mulR(left.b, right.a), b: mulR(left.b, right.b) };
        if (right.a.n === 0n) return { a: mulR(right.b, left.a), b: mulR(right.b, left.b) };
        return null;
      }
      if (node.op === "/") {
        if (right.a.n !== 0n || right.b.n === 0n) return null;
        return { a: divR(left.a, right.b), b: divR(left.b, right.b) };
      }
      return null;
    }
    default:
      return null;
  }
}

// Fixed unit table ----------------------------------------------------------

const LINEAR_UNITS: Record<string, Rat> = {
  m: rat(1n),
  km: rat(1000n),
  cm: rat(1n, 100n),
  mm: rat(1n, 1000n),
  in: rat(127n, 5000n),
  ft: rat(381n, 1250n),
  yd: rat(1143n, 1250n),
  mi: rat(201168n, 125n),
  kg: rat(1n),
  g: rat(1n, 1000n),
  mg: rat(1n, 1_000_000n),
  lb: rat(45_359_237n, 100_000_000n),
  oz: rat(45_359_237n, 1_600_000_000n),
  s: rat(1n),
  ms: rat(1n, 1000n),
  min: rat(60n),
  h: rat(3600n),
  d: rat(86_400n),
};
const TEMPERATURE_UNITS = new Set(["c", "f", "k"]);
const CELSIUS_OFFSET = rat(5463n, 20n); // 273.15 K
const FAHRENHEIT_OFFSET = rat(45_967n, 100n); // 459.67 F

function toKelvin(unit: string, value: Rat): Rat {
  if (unit === "k") return value;
  if (unit === "c") return addR(value, CELSIUS_OFFSET);
  if (unit === "f") return mulR(addR(value, FAHRENHEIT_OFFSET), rat(5n, 9n));
  return fail(`Unsupported unit: ${unit}.`);
}

function fromKelvin(unit: string, kelvin: Rat): Rat {
  if (unit === "k") return kelvin;
  if (unit === "c") return subR(kelvin, CELSIUS_OFFSET);
  if (unit === "f") return subR(mulR(kelvin, rat(9n, 5n)), FAHRENHEIT_OFFSET);
  return fail(`Unsupported unit: ${unit}.`);
}

function convertUnit(value: Rat, from: string, to: string): Rat {
  const source = from.toLowerCase();
  const target = to.toLowerCase();
  if (TEMPERATURE_UNITS.has(source) || TEMPERATURE_UNITS.has(target)) {
    if (!TEMPERATURE_UNITS.has(source) || !TEMPERATURE_UNITS.has(target)) {
      fail("Unsupported conversion between temperature and other units.");
    }
    return fromKelvin(target, toKelvin(source, value));
  }
  const sourceFactor = LINEAR_UNITS[source];
  const targetFactor = LINEAR_UNITS[target];
  if (!sourceFactor) fail(`Unsupported unit: ${from}.`);
  if (!targetFactor) fail(`Unsupported unit: ${to}.`);
  return divR(mulR(value, sourceFactor), targetFactor);
}

// Operations ----------------------------------------------------------------

const OPERATIONS = new Set(["solve", "simplify", "check_equivalence", "unit_convert"]);
const ARGUMENT_FIELDS: Record<string, string[]> = {
  solve: ["expression", "variable"],
  simplify: ["expression"],
  check_equivalence: ["left", "right"],
  unit_convert: ["value", "from", "to"],
};

type Args = Record<string, unknown>;
type OperationResult = { result: string; method: string };

function requireString(args: Args, key: string): string {
  const value = args[key];
  if (typeof value !== "string") fail(`Missing required string field: ${key}.`);
  return value;
}

function runSimplify(args: Args): OperationResult {
  const value = evaluateNode(parseExpression(requireString(args, "expression")));
  return { result: valueString(value), method: valueMethod(value) };
}

function runSolve(args: Args): OperationResult {
  const equation = requireString(args, "expression");
  const parts = equation.split("=");
  if (parts.length !== 2) fail("Malformed equation.");
  const leftNode = parseExpression(parts[0]);
  const rightNode = parseExpression(parts[1]);
  const vars = [...new Set([...collectVars(leftNode), ...collectVars(rightNode)])];
  const requested = args.variable;
  if (requested !== undefined && typeof requested !== "string") fail("variable must be a string.");
  const variable = typeof requested === "string" && requested ? requested : vars[0];
  if (!variable) fail("Equation must contain a variable.");
  if (vars.some((name) => name !== variable)) {
    fail(`Unsupported identifier: ${vars.find((name) => name !== variable)}.`);
  }
  const left = linearForm(leftNode, variable);
  const right = linearForm(rightNode, variable);
  if (!left || !right) fail("Equation is non-linear.");
  const coefficient = subR(left.a, right.a);
  const constant = subR(right.b, left.b);
  if (coefficient.n === 0n) {
    if (constant.n === 0n) fail("Equation has infinitely many solutions.");
    fail("Equation has no solution.");
  }
  const solution = divR(constant, coefficient);
  return {
    result: `${variable} = ${formatRat(solution)}`,
    method: "linear equation, exact rational arithmetic",
  };
}

function runEquivalence(args: Args): OperationResult {
  const leftNode = parseExpression(requireString(args, "left"));
  const rightNode = parseExpression(requireString(args, "right"));
  const vars = [...new Set([...collectVars(leftNode), ...collectVars(rightNode)])];
  if (vars.length === 0) {
    const left = evaluateNode(leftNode);
    const right = evaluateNode(rightNode);
    if (left.kind === "exact" && right.kind === "exact") {
      return {
        result: ratEqual(left.value, right.value) ? "true" : "false",
        method: "exact rational comparison",
      };
    }
    return { result: "unknown", method: "float comparison is not proof of equivalence" };
  }
  if (vars.length === 1) {
    const left = linearForm(leftNode, vars[0]);
    const right = linearForm(rightNode, vars[0]);
    if (left && right) {
      return {
        result: ratEqual(left.a, right.a) && ratEqual(left.b, right.b) ? "true" : "false",
        method: "canonical linear form comparison",
      };
    }
  }
  return { result: "unknown", method: "symbolic equivalence could not be proven" };
}

function runUnitConvert(args: Args): OperationResult {
  const value = parseRational(String(requireStringOrNumber(args, "value")));
  const from = requireString(args, "from");
  const to = requireString(args, "to");
  return { result: formatRat(convertUnit(value, from, to)), method: "fixed unit conversion table" };
}

function requireStringOrNumber(args: Args, key: string): string | number {
  const value = args[key];
  if (typeof value !== "string" && typeof value !== "number") {
    fail(`Missing required field: ${key}.`);
  }
  if (typeof value === "number" && !Number.isFinite(value)) fail("Numeric magnitude exceeds limit.");
  return value;
}

function compute(input: unknown): MathResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("Input must be an object.");
  const envelope = input as Record<string, unknown>;
  for (const key of Object.keys(envelope)) {
    if (key !== "operation" && key !== "arguments" && key !== "reason") fail(`Unknown field: ${key}.`);
  }
  if (typeof envelope.reason !== "undefined" && typeof envelope.reason !== "string") {
    fail("reason must be a string.");
  }
  const operation = envelope.operation;
  if (typeof operation !== "string" || operation.length === 0) fail("Missing required field: operation.");
  if (!OPERATIONS.has(operation)) fail(`Unsupported operation: ${operation}.`);
  const args = envelope.arguments;
  if (!args || typeof args !== "object" || Array.isArray(args)) fail("Arguments must be an object.");
  const fields = ARGUMENT_FIELDS[operation];
  for (const key of Object.keys(args)) {
    if (!fields.includes(key)) fail(`Unknown field: ${key}.`);
  }
  const record = args as Args;
  let outcome: OperationResult;
  switch (operation) {
    case "simplify":
      outcome = runSimplify(record);
      break;
    case "solve":
      outcome = runSolve(record);
      break;
    case "check_equivalence":
      outcome = runEquivalence(record);
      break;
    default:
      outcome = runUnitConvert(record);
      break;
  }
  return { status: "ok", operation, result: outcome.result, method: outcome.method, computed: true };
}

export function evaluateMath(input: unknown): MathResult {
  try {
    return compute(input);
  } catch (error) {
    return { status: "error", reason: error instanceof Error ? error.message : "Invalid request." };
  }
}
