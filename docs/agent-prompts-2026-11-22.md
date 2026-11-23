# Concurrent-track agent prompts — 2026-11-22

Companion to `docs/next.md` "Parallelization map". Each prompt is self-contained for a fresh agent running concurrently with the Phase 1 (BYOK) agent. Port quads are pre-assigned; do not change another track's files (the forbidden lists are the conflict surface that was hot on 2026-11-22).

---

## Prompt A — Physics rules engine (Phase 2, logic stage only)

You are implementing the deterministic physics-rules core for StudyAI's Scientific Canvas. Read first, in order: `AGENTS.md` (canvas invariants), `docs/next.md` (status + parallelization map), `docs/decisions/2026-11-22-canvas-deep-latency.md` (gate discipline), `src/canvas/model.ts` (vector/force shapes), `src/canvas/geometry.ts` (arrowGeometry), `src/canvas/spatial/types.ts` + `server/canvas-intelligence/scene/build.ts` (scene nodes/edges you will consume), `docs/CANVAS_INTELLIGENCE_HANDOFF_2026-11-18.md` §2–3.

Build `server/canvas-intelligence/scene/physics-rules.ts`: a pure, deterministic module (no model calls, no UI, no async provider work) that takes the scene-graph output plus the board's scientific objects and returns structured diagnostics:

```ts
export type PhysicsDiagnostic = {
  kind: "normal_force_misaligned" | "friction_not_opposing_motion" | "net_force_mismatch"
      | "missing_force_component" | "incline_angle_mismatch" | "equilibrium_holds" | "underconstrained";
  objectIds: string[];            // existing object/scene ids only — never invent ids
  detail: Record<string, number | string>;  // e.g. { angleOffsetDeg: 34 }
  confidence: 1;                  // deterministic by construction; uncertainty = "underconstrained"
};
export function analyzePhysics(input: /* scene graph + objects + native geometry */): { diagnostics: PhysicsDiagnostic[]; summary: string };
```

Rules (each with its own failing test first — strict TDD, use `node node_modules/vitest/vitest.mjs run <file>`):
1. Normal force perpendicularity against a contact surface (surface = native line/shape edge; tolerance in degrees is a named constant you justify in the ADR).
2. Friction direction: parallel to surface, opposing stated/attached motion or the net parallel component.
3. Net force: vector sum vs a mass·acceleration object or equilibrium claim, within a stated tolerance; uncalibrated vectors (`unitsPerCanvasUnit` absent) yield `underconstrained`, never a fabricated physical verdict.
4. Incline decomposition: θ from the surface line's angle; check mg·sinθ / mg·cosθ component consistency when component vectors exist.

Environment rules (non-negotiable): work in your own git worktree on your own branch from `main`'s current tip; never edit any other worktree; never `npm install` (shared junctioned `node_modules` — `.bin` churns under concurrent npm); typecheck with `node node_modules/typescript/bin/tsc -b`; stage only named paths, commit small, merge to `main` at most daily.

Hard scope limits: do NOT touch `src/canvas/**` (UI), `server/agent.ts`, `src/canvas/model.ts`, `server/canvas-persistence/**`, `server/canvas-intelligence/scene/build.ts` (read it; if it genuinely must change, stop and record why in the ledger instead of editing), any prompt/budget/threshold config, or the benchmark baseline. No new ScientificObject kinds — surfaces are existing native geometry. This is the headless stage; sliders/parameter objects are a later, separately-coordinated UI stage.

Done means: tests RED then GREEN for every rule including the uncalibrated/underconstrained edge cases; tsc 0; full vitest green (`node node_modules/vitest/vitest.mjs run`); a short ADR at `docs/decisions/ADR-2026-11-22-physics-rules.md` recording rule semantics, tolerances, and the diagnostic vocabulary Phase 3 will consume (the `normal_force_misaligned` example in `docs/next.md` is the contract); verification numbers quoted in the commit/PR body. No Playwright needed (nothing user-visible yet); no `benchmark:canvas` (no prompt/model/provider change — say so explicitly in the handoff).

---

## Prompt B — Natural pen UX (Phase 5, input layer only)

You are making StudyAI's canvas feel like pen on paper. Read first: `AGENTS.md`, `docs/next.md`, `docs/STATUS.md`, `src/canvas/CanvasStudio.tsx` (gesture/session code — note the pointer-up/microtask history subtleties documented in `docs/CANVAS_INTERACTION.md`), the installed Quickdraw package under `node_modules/@quickdrawjs/react` (cite its actual exported API with file paths — do not write library APIs from memory; the vendored zip at repo root is a reference copy, the installed package is authority).

Deliver, in this order, each as RED→GREEN:
1. **Pressure + velocity smoothing**: transform raw pointer events into width/opacity that feels natural (e.g. velocity-based taper, pressure curve) at the capture boundary. If the editor owns stroke geometry internally, implement at the documented extension point or via the capture-phase path — verify against the installed package's real event flow, and if a change inside the library is unavoidable, stop and report rather than hacking around revision rules.
2. **Palm rejection** heuristic (pointerType filtering + input-mode awareness) behind a persisted setting toggle, defaulting to not break mouse users.
3. **Gestures**: scratch-out-to-erase and circle-to-select. Any erase/delete/select action must route through the existing object/selection paths so undo/redo and `revision` semantics stay intact — never mutate `canvases.document` directly.
4. **Double-tap convert**: proposes handwriting→LaTeX (reuse the existing OCR path via the analysis pipeline) as an approval-gated proposal only.

Environment: your own worktree + branch from current `main`; port quad `WEB_PORT=5333 RUNTIME_PORT=8263 DATA_PORT=8264 AGENT_PORT=8183` with `LANGGRAPH_DEPLOYMENT_URL=http://127.0.0.1:8183` in YOUR worktree's copied `.env` (never commit `.env`); run Playwright via `node node_modules/@playwright/test/cli.js test …` (never `npx`/`npm install`); stage named paths only.

Scope bans (conflict surface): no `src/App.tsx` layout restructuring (3-pane fluidity is a later stage — pen only), no settings-modal edits (Phase 1 agent owns that region), no `server/agent.ts`, no `src/canvas/model.ts` kinds, no `src/canvas/ai/teaching-scene.ts` or `canvas-actions.ts` (author_board agent owns those), no `SceneGlyph.tsx` changes without a coordination note, no provider/budget changes.

Every behavior needs a Playwright DOM test using synthetic pointer events with `pointerType`/pressure attributes (`page.dispatchEvent` or CDP-backed input): smoothing changes geometry observably vs raw input; scratch-out removes the stroke (assert via DOM after save, and undo restores it in one step); circle-select selects only enclosed objects and does not erase; double-tap produces a visible approval-gated proposal (region "Tutor canvas proposal" pattern) whose rejection leaves the document and `revision` unchanged. A real-stylus manual checklist goes in `docs/verification/2026-11-22-pen-ux.md` — do not claim hardware behavior you could not test.

Done: tsc 0, vitest green, your new e2e specs green twice (record both runs), handoff quotes exact outputs, daily small merges to `main`.

---

## Prompt C — author_board compound authoring (absorbs Phase 3.3)

You are executing `docs/superpowers/plans/2026-11-22-adaptive-canvas-authoring.md` (rev 3 — verify whether revs exist; the plan is the spec; its "Open decisions" 3 and 4 were answered by the partner on 2026-11-22: practice generation was consolidated INTO this design, and the canvas-frontier `draftPractice` route is superseded — its constraints are binding inputs: cited excerpts must exist in retrieved chunks, count validated 1–8, output labelled generated-not-verified, answers hidden until attempted/checked, no canvas write outside the existing approval gate, one approval transaction, 2 tool calls normal / 3 worst case against the enforced cap (`TUTOR_MAX_PROVIDER_CALLS ?? 3` at `server/tutor-provider.ts:34`) — raising that cap needs its own ADR).

Read first: the plan above, `docs/next.md`, `AGENTS.md` canvas invariants, `docs/superpowers/specs/2026-11-22-canvas-course-grounding-design.md` + ADR (`judgement belongs to the model, containment to the code`), `src/canvas/ai/teaching-scene.ts`, `src/canvas/ai/canvas-actions.ts`, `server/agent.ts` tool-binding patterns (lines ~141–158), `src/canvas/spatial/index.ts` + `scene/build.ts` (occupancy source of truth), `tests/fixtures/canvas-course-grounding.ts`. Also note the concurrent-agent scope table in the plan's "Concurrent agents" section — the reveal toggle and review-deck already shipped in the merge at `main`; check before rebuilding (mindmap kind: shipped, use it as an authorable output target).

Build per its phases in order (layout solver wired into `compileTeachingScene` first, then the single semantic authoring verb, then metrics), TDD throughout, respecting: `shapeBounds`/real-text-bounds occupancy (their occupancy commits are in `main`), in-viewport-first placement with conflict+suggest fallback, transient aliases never persisted (test that none leak into the saved document), the four gate numbers quoted whenever a prompt/tool-description/tool-schema changes (`npm run benchmark:canvas`, twice if results vary, never `--update-baseline` without an explicit request), `node .gitnexus/run.cjs detect-changes --scope all --repo .` before commits.

Environment: your own worktree + branch; port quad `WEB_PORT=5343 RUNTIME_PORT=8273 DATA_PORT=8274 AGENT_PORT=8193` with `LANGGRAPH_DEPLOYMENT_URL=http://127.0.0.1:8193` in your `.env` copy; no `npm install`; direct-node test commands; named-path staging.

Scope: you own `server/agent.ts` authoring bindings, `src/canvas/ai/teaching-scene.ts`, `src/canvas/ai/canvas-actions.ts`, `src/canvas/tutor.ts` proposal schemas. You do NOT touch: physics rules module (parallel agent), settings/providers (Phase 1), pen input paths (Phase 5), `CanvasDocument` version, budgets/caps, other agents' worktrees. Acceptance: the plan's one-turn friction-incline scenario, proven by a Playwright spec with a mocked model turn (schema-shaped tool output), asserting one review transaction, one revision bump on apply, citations rendered, generated label visible, and unchanged document on decline.

---

## Explicitly NOT concurrent right now

Phase 2's UI stage (needs `CanvasStudio.tsx`/`SceneGlyph.tsx` quiet), Phase 3 beyond what C absorbs (needs A's vocabulary + C's verb), Phase 4.2 misconception loop (needs A+B+C taxonomy), 3-pane split-view (Phase 1 touches the same shell), mindmap per-node editing (same triangle). Re-read `docs/next.md` before starting any of these — it is updated on merge.
