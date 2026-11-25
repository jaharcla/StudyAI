# Bounded Typed Math Evaluator — design (2026-11-25)

## Intent

Replace the rejected Pyodide/MCP approach with the rule the project already follows: **the model proposes, never computes**. The Tutor may propose a strictly typed JSON operation. A small, trusted, deterministic evaluator owned by StudyAI computes the result. No model-generated code executes, and no third-party sandbox is added.

This is the user-approved answer to the Pyodide question. It is a design only; implementation needs a separate plan and approval.

## Goals

1. Four operations: `solve`, `simplify`, `check_equivalence`, `unit_convert`.
2. A strict JSON schema each operation must satisfy; anything else is rejected before evaluation.
3. A deterministic, stateless evaluator with allowlisted grammar, bounded input and explicit errors.
4. Results are labelled as tool computations, never as course material or citations.
5. Reuse the existing local data API and CopilotKit frontend-tool pattern; no new runtime or provider.

## Non-goals and anti-goals

- No Pyodide, Deno, Pydantic Monty, Sym-MCP, mcp-run-python, or any model-generated Python/JavaScript.
- No `eval`, `Function`, dynamic import, shell execution or arbitrary expression language.
- No external API, key, paid service, model weights or dependency.
- No free-text grading, proof generation or answer-key invention.
- No claim that a computed result came from the student's material.

## Approach

**Proposal schema.** The model emits one JSON object with `operation`, `arguments` and `reason` (short, student-facing). `solve` and `simplify` take a bounded expression string plus optional variable; `check_equivalence` takes two bounded expressions; `unit_convert` takes a numeric value, a source unit and a target unit from an allowlist. Unknown fields or operations are rejected.

**Evaluator.** A TypeScript module in the local data API parses the expression into an AST with an allowlisted grammar: numbers, fractions, named constants, `+ - * / ^`, parentheses, and a small set of named functions (`sqrt`, `abs`, `sin`, `cos`, `tan`, `log`, `ln`, `exp`). Evaluation uses exact rational arithmetic where possible and a clearly labelled numeric fallback. `check_equivalence` compares normalized forms; where that is not possible it returns `unknown`, never `true`. `unit_convert` uses a fixed conversion table. Every output includes the operation, the normalized inputs, the result, a `method` label and a `computed: true` marker.

**Bounds.** Maximum expression length, AST depth, node count, exponent magnitude, numeric magnitude and conversions per request. On any breach the tool returns a typed error with a reason; it never partially evaluates. Evaluation is synchronous and pure, with no filesystem, network or process access.

**Tutor wiring.** A frontend tool exposes the schema to the Tutor through the existing CopilotKit pattern and calls a local API route. The Tutor's final answer may quote the result, but must label it as a calculation. The UI renders the result with a plain "Calculated by StudyAI" label and no citation chip, because no document produced it.

**Grounding rule preserved.** Student material remains the only source of facts. Calculations derived from material values are explicitly derived, never treated as source text. If the model needs a course-specific value it must retrieve a passage first; the evaluator never supplies missing facts.

## Why this over the alternatives

- Pyodide is a Python runtime, not a sandbox: generated Python can execute arbitrary JavaScript in the host runtime.
- Pydantic retired `mcp-run-python` for exactly that reason and recommends Monty, which is still a new dependency and restricted Python.
- A symbolic algebra service duplicates authorities, needs a worker pool and costs ~1.5 GB at default settings.
- A typed, allowlisted evaluator gives deterministic verification for the common homework cases without introducing untrusted code or new infrastructure.

## Verification

- Unit tests per operation, normalization, equivalence, unit table and every bound.
- Invalid JSON, unknown operation, unsupported function, division by zero and overflow return typed errors, never guesses.
- One Playwright DOM assertion for the rendered "Calculated by StudyAI" result and one for an error state.
- `tsc -b`, Vitest and targeted Playwright before merge; full `npm run verify` before final handoff.

## Constraints

- `DESIGN.md` is the UI source of truth.
- Local-first, BYOK, no new dependency, key, service or `.env` change without approval.
- No merge before the gates pass. Pause new work below 1 GB free RAM.
- Preserve `tests/e2e/journey-uninterrupted.spec.ts`.
