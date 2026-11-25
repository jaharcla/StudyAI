# Bounded Typed Math Evaluator Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Let the Tutor propose a strictly typed JSON math operation and have StudyAI compute it with a small, trusted, deterministic evaluator. No model-generated code, Pyodide, Monty or new dependency.

**Spec:** `docs/superpowers/specs/2026-11-25-bounded-math-evaluator-design.md`

**Architecture:** A pure TypeScript evaluator in the client-shared math module; a Zod schema for the operation envelope; a local data-API route that validates and calls the evaluator; a CopilotKit frontend tool registered from the Tutor rail that calls the route and hands the result to App state; a small result card labelled "Calculated by StudyAI". The model only proposes inputs; all computation happens in our code.

## Global Constraints

- `DESIGN.md` is the UI source of truth; this is a cohesion pass, not a redesign.
- No new dependency, paid service, key, subscription or `.env` change. Zod 4.6.6 is already installed.
- Student material remains the only source of course facts. A computed result is labelled as a calculation and never gets a citation chip.
- TDD: failing test first, watch it fail, implement, watch it pass, commit. Never weaken a test.
- One worktree and branch per worker; no merge before `tsc -b`, Vitest and targeted Playwright pass.
- At most two workers, one Playwright suite at a time, pause below 1 GB free RAM. No subagents.
- Preserve `tests/e2e/journey-uninterrupted.spec.ts`.

## Review Focus

- Unsupported operation, unknown field, unsupported function, oversized expression, division by zero and overflow all return explicit typed errors, never guesses.
- `check_equivalence` returns `unknown` when it cannot prove equivalence; it never claims `true` on a numeric hunch.
- The result card says "Calculated by StudyAI" and shows no citation.
- A malformed or failed API call never renders a calculation.

---

### Task 1: Pure deterministic evaluator

**Files:**
- Create: `src/math/evaluator.ts`
- Test: `tests/math-evaluator.test.ts`

**Interfaces:**
- `evaluateMath(input: unknown): MathResult` where `MathResult = { status: "ok"; operation: string; result: string; method: string; computed: true } | { status: "error"; reason: string }`.
- Operations: `solve` (linear equation in one variable), `simplify` (arithmetic expression), `check_equivalence` (two expressions; `true | false | unknown`), `unit_convert` (fixed unit table).
- Allowlisted grammar: numbers, fractions, named constants, `+ - * / ^`, parentheses, `sqrt abs sin cos tan log ln exp`. No identifiers except the solve variable.
- Bounds: expression length, AST depth, node count, exponent magnitude, numeric magnitude.

- [ ] **Step 1:** Write failing tests for each operation, exact rational results, normalization, equivalence including `unknown`, the unit table, and every bound and error case.
- [ ] **Step 2:** Run `npx vitest run tests/math-evaluator.test.ts`, watch it fail.
- [ ] **Step 3:** Implement a parser to AST plus allowlisted evaluator. No `eval`, `Function`, dynamic import, process, file or network access. Exact rationals first; any float fallback must be labelled in `method`.
- [ ] **Step 4:** Watch tests pass, run `npx tsc -b`, commit with Discord link and critique URL.

### Task 2: Local API route

**Files:**
- Modify: `server/api.ts`
- Test: `tests/math-api.test.ts`

**Contract:** `POST /api/math/evaluate` accepts one JSON envelope, validates it with a shared Zod schema, calls `evaluateMath`, and returns `200` for both `ok` and typed `error` results. Malformed JSON returns `400`. No provider call, no network egress, no persistence.

- [ ] **Step 1:** Write failing tests using the existing local-API test harness: valid operations, malformed JSON, unknown operation, unknown field, oversized input, and an expression that triggers an evaluator error.
- [ ] **Step 2:** Watch them fail.
- [ ] **Step 3:** Add the route; reuse the existing `json`/`body` helpers. Watch tests pass.
- [ ] **Step 4:** Run `npx tsc -b`, commit with critique URL.

### Task 3: Tutor tool and result card

**Files:**
- Create: `src/tutor/MathEvaluationTool.tsx`, `src/tutor/MathResultCard.tsx`, `tests/e2e/math-evaluator.spec.ts`
- Modify: `src/App.tsx` (register tool, hold last result, render card)

**DOM contract:** `math-result`, `math-result-label`, `math-result-value`, `math-result-error`.

- [ ] **Step 1:** Write a failing Playwright test that stubs `/api/math/evaluate`, calls the tool through the DEV window hook (as `LibraryArtifactTool` does), and asserts the card shows "Calculated by StudyAI", the result value, and no citation chip.
- [ ] **Step 2:** Watch it fail.
- [ ] **Step 3:** Implement the Zod-shaped frontend tool, the App state handoff and the card. Add an error-state case.
- [ ] **Step 4:** Watch tests pass, run `npx tsc -b` and targeted suites, commit with critique URL.

### Task 4: Regression gate

- [ ] Run targeted suites, `npm run verify` and `tests/e2e/journey-uninterrupted.spec.ts`.
- [ ] Write exact commands and outputs to `docs/verification/2026-11-25-bounded-math-evaluator.md`; commit with Discord link and critique URL.
- [ ] Do not merge if any gate fails.
