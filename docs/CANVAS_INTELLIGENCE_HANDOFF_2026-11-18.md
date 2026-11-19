# Canvas Intelligence Handoff — 2026-11-18

Status: implementation checkpoint for a new session. Work is **not committed**; the worktree already contained unrelated user changes, which were preserved.

## 1. Goal

A production-quality Quickdraw canvas intelligence pipeline:

1. The LLM understands the canvas through deterministic evidence, OCR, recognition, and a revision-bound scene graph.
2. The LLM interacts with the canvas only through reviewable, approval-gated proposals.
3. Local-first where possible; cloud providers are explicit and budgeted.
4. Every claim stays source-linked and uncertain until confirmed.

## 2. Current pipeline

```
Quickdraw snapshot + ScientificObject[]
        │
        ├─ deterministic capture / geometry
        ├─ OCR
        │    math ink: one whole-expression crop → LaTeX
        │    diagram: grouped crops → text/labels
        ├─ local CLIP recognition (baseline or few-shot)
        ├─ structure / fusion (LLM)
        └─ evidence bundle + approval gate
                 │
                 └─ derived scene graph (nodes/edges/FTS)
                          │
                          └─ get_canvas_scene / search_canvas_evidence
```

### Provider policy

- Completion chain: `groq → opencode-go → openrouter → gemini` (Gemini only when keyed).
- Math/diagram OCR chain: `gemini → openrouter → groq`.
- OpenCode Go is **explicit-only** for math OCR to avoid burning the allowance.
- Gemini free-tier requests are serialized and limited to 15/minute; retries cover 402/429/500/502/503/504.
- Budgets: OpenCode Go 20/day; OpenRouter 50/day.

## 3. Plan stages and status

| Phase | Status | Summary |
|---|---|---|
| 0 — Measurement gate | **Complete** | `npm run benchmark:canvas`, scoring, baseline, regression guard |
| 1 — OCR → structure → fusion correctness | **Mostly complete** | Math/diagram OCR, math structure with OCR, recognition gating, provider usage/cost |
| 2 — Spatial scene graph | **Complete** | Graph, index, SQLite/FTS, API, tools, recognition candidates, analysis merge, scene context, current-course search, browser e2e |
| 3 — Interaction and learning loop | **Complete** | Teach UI, accept/correct/reject feedback, prototype updates, scientific-object creation proposals, scene tools bound to the tutor |
| 4 — Operations, cost, safety | **Not started** | Persisted budgets, cost UI, disclosure, circuit breaker |
| 5 — Polish and performance | **Not started** | Caching, browser e2e, calibration, performance |

## 4. Completed work

### Phase 0 — Measurement gate

- `scripts/benchmark-canvas.ts` + `npm run benchmark:canvas`.
- Runs all seven prepared boards in deep mode.
- Scores math OCR (`normalizeLatex`, exact match, token F1), PhysAlign concept coverage, hard failures, latency, cost, provider usage.
- Writes `data/canvas-benchmark/latest.json`.
- Compares against `docs/verification/canvas-benchmark-baseline.json`.
- `--update-baseline` records a new floor.
- Refuses baseline updates when a board fails or is partial because a provider failed.
- Single-board debugging: `CANVAS_BENCHMARK_BOARD=PhysAlign npm run benchmark:canvas`.

Scoring logic: `server/canvas-intelligence/benchmark-score.ts`.
Tests: `tests/canvas-benchmark-score.test.ts`.

### Phase 1 — OCR, structure, fusion

- Whole-expression crop for pure-ink math boards: `groupCanvasInkStrokesForOCR` in `src/canvas/ocr-regions.ts`; used by client capture and server validation.
- Configurable OCR cap: `CANVAS_OCR_MAX_REGIONS` (default 3, max 8), `VITE_CANVAS_OCR_MAX_REGIONS`.
- LaTeX math OCR profile with Google AI Studio Gemini primary.
- Diagram OCR profile for mixed boards (PhysAlign).
- Math OCR fallback chain with per-provider budgets.
- Math structure now runs after OCR and receives a bounded OCR summary.
- `STRUCTURE_INK_SYSTEM_PROMPT` for pure-ink boards.
- Recognition is gated to the deterministic baseline on math boards; CLIP remains for diagrams.
- CLIP default labels include math notation (sum, integral, fraction, partial derivative, nabla, etc.).
- Provider usage/cost recording: `provider-usage.ts`.
- OpenRouter serialization and retry; Gemini 15/minute limiter.
- Groq completion cap raised to 8192.
- Fixed: Groq OCR was passed an Ollama model name, causing 404s and accidental OpenCode use.
- Fixed: missing model object `kind` now defaults to `unknown` instead of failing the analysis.

### Phase 2 — Spatial scene graph

**Shared contracts**
- `src/canvas/spatial/types.ts`: strict Zod schemas for nodes, edges, graphs, refs, bounds, points.
- `src/canvas/spatial/identity.ts`: deterministic hashes and edge IDs.
- `src/canvas/spatial/index.ts`: linear fallback + uniform grid, overflow handling, rect and nearest queries.

**Server**
- `server/canvas-intelligence/scene/build.ts`: strokes, groups, native objects, scientific objects; `contains`, `overlaps`, `near`, directional, explicit relations; recognition candidates; OCR/model evidence merge; deterministic caps.
- `server/canvas-intelligence/scene/store.ts`: SQLite graph store + FTS5 node-text index + exact-revision search.
- `server/canvas-intelligence/scene/service.ts`: revision/scope checks, async build, optional analysis validation, recognition.
- `server/canvas-intelligence/scene/http.ts`: build and query endpoints.
- Registered in `server/api.ts` before generic canvas routes.

**Client/tutor**
- `src/canvas/ai/scene-tools.ts`: `get_canvas_scene`, `search_canvas_evidence`, bounded slices, scene cache.
- `src/canvas/ai/scene-context.ts`: ≤6,000-character scene summary.
- `src/canvas/ai/canvas-bridge.ts`: publishes scene summary in agent context and adds both read-only tools.
- `propose_canvas_action` remains the only mutation path; approval unchanged.

**Live verification**
- PhysAlign board: 76 nodes, 187 edges, 25 ms build, deterministic repeat.
- Node kinds: 52 strokes, 3 groups, 14 native objects, 1 scientific object, 6 recognition candidates.
- Edge kinds include `contains` 52, `recognizes` 6, `near` 33, `overlaps` 42.
- FTS query `"spring"` returned the persisted question/statement nodes.

## 5. Verification evidence

- `npm test`: **289 passed** (279 at the first checkpoint, 284 after Phase 2).
- `npm run build`: **passed**.
- `npx tsc -b`: **passed**.
- `npx playwright test tests/e2e/canvas-scene-intelligence.spec.ts`: **passed** (5.8 s).
- `npx playwright test tests/e2e/canvas-recognition-review.spec.ts`: **passed** (6.5 s).
- Live benchmark with Gemini free tier (first checkpoint, unchanged):
  - 4/6 math boards exact.
  - Math average token F1 **0.91**.
  - PhysAlign concept coverage **0.75**.
  - **0** hard failures.
  - Average latency ~16.6 s.
  - Provider cost **$0** (free tier).
  - OpenCode Go usage **0**; OpenRouter usage **0**.
- Baseline: `docs/verification/canvas-benchmark-baseline.json`.

## 6. What is left

### Phase 2 residuals (completed in the 2026-11-18 continuation)

1. **Current-course multi-board search** — complete.
   - `searchCurrentCourseCanvasScene` resolves current revisions in SQL by joining FTS rows to `canvas_scene_graphs` and `canvases`, keeping only rows where `canvases.revision = canvas_scene_graphs.revision`. Old revisions stay indexable by exact hash but never surface in course search.
   - `POST /api/courses/:courseId/canvas-scene/query` returns `hits[]` grouped per board with `boardId`, `revisionHash`, `revision`, node, and up to 8 incident edges (40 total).
   - `search_canvas_evidence` takes optional `boardId` and `lessonId`: `boardId` present → this board's current revision; omitted → current course, optionally narrowed to one lesson.

2. **Browser e2e** — complete: `tests/e2e/canvas-scene-intelligence.spec.ts`.
   - Draws a Lewis structure, lets autosave persist it, reloads, and asserts the bridge rebuilds the scene for the persisted revision.
   - Searches board and course evidence, checks stale-hash `409` and cross-course `404`, and confirms the board document/revision are unchanged with no proposal region.

3. **Analysis merge fixture** — complete: `tests/canvas-scene.test.ts` builds a full `CanvasAnalysisResult` via `createCanvasAnalysisResult` and asserts OCR/model evidence becomes unconfirmed `ocr-item` / `model-observation` nodes with `derived-from` edges.

Phase 2 is complete.

### Phase 3 — Interaction and learning loop (completed in the 2026-11-18 continuation)

- “Teach this drawing” panel on the canvas: select freehand strokes, label them, and the server renders the group with the recognizer's own rasterizer before embedding it. `POST /api/canvases/:boardId/recognition/teach`.
- Accept/correct/dismiss controls for recognition candidates in the same panel. Decisions persist in `canvas_recognition_feedback` (latest wins per board + stroke group); accept and correct teach a prototype, dismiss suppresses the group. `POST /api/canvases/:boardId/recognition/feedback`.
- Scene builds now load taught prototypes (previously only deep analysis did) and apply feedback: confirmed labels use `origin: "user"` / `verificationStatus: "confirmed"`, corrections add a confirmed user label, dismissals remove the candidate.
- `propose_scientific_object` adds approval-gated creation of validated scientific objects; it reuses `createObject` + `parseCanvasDocument` and rechecks scope/revision on apply.
- `server/agent.ts` now exposes `get_canvas_scene`, `search_canvas_evidence`, and `propose_scientific_object` to the model and instructs it to cite at most three exact canvas source refs.
- Bound by `ADR-2026-11-18-canvas-recognition-feedback.md`.

### Phase 4 — Operations, cost, safety

- Persist provider budgets/usage in SQLite (currently in-memory, resets on restart).
- Per-analysis cost/latency display.
- Provider disclosure and opt-out for image egress.
- Circuit breaker and backoff metrics.
- Structured logs without raw images or secrets.

### Phase 5 — Polish and performance

- Cache scene graphs by revision; warm CLIP; lazy-load heavy modules.
- Calibrate abstain thresholds.
- Browser e2e for math, diagram, custom classes.
- Performance targets: p95 deep <15 s, cached <3 s.

## 7. Known issues and risks

- **Gemini free tier** is 15 RPM / 500 RPD and can return 503 under load. Retries are implemented; occasional partial runs remain possible.
- **OpenRouter account has 0 credits**; it is not a reliable primary. Gemini is primary when keyed.
- **Nested logistic OCR** scores 0.625 F1 due to handwritten μ/σ ambiguity; exact for 4/6 math boards.
- **PhysAlign OCR** reads `F/N` as `A E / N`; concept coverage 0.75, below the 0.8 target. Deep analysis still captures wall, spring, O/A, axes, graph.
- **OpenCode Go** vision math OCR is slow and weak; keep it explicit-only.
- **GitNexus index is stale**; impact results were confirmed with text search where needed.
- **Supabase MCP** was unauthorized (`Unauthorized`); no Supabase data was read or written, and it is not in the runtime path.
- Worktree is dirty with pre-existing user changes; nothing was committed.

## 8. File map

### Recognition
- `server/canvas-intelligence/recognition/types.ts`
- `recognition/render.ts`
- `recognition/baseline.ts`
- `recognition/clip.ts`
- `recognition/index.ts`
- `recognition/store.ts`

### Providers
- `server/canvas-intelligence/providers.ts`
- `provider-budget.ts`
- `provider-usage.ts`
- `openai-compatible.ts`
- `groq.ts`

### Scene
- `src/canvas/spatial/types.ts`
- `src/canvas/spatial/identity.ts`
- `src/canvas/spatial/index.ts`
- `server/canvas-intelligence/scene/build.ts`
- `scene/store.ts`
- `scene/service.ts`
- `scene/http.ts`
- `src/canvas/ai/scene-tools.ts`
- `src/canvas/ai/scene-context.ts`
- `src/canvas/ai/canvas-bridge.ts`

### OCR/benchmark
- `src/canvas/ocr-regions.ts`
- `src/canvas/ocr-capture.ts`
- `server/canvas-intelligence/benchmark-score.ts`
- `scripts/benchmark-canvas.ts`
- `docs/verification/canvas-benchmark-baseline.json`

### Decisions
- `docs/decisions/ADR-2026-11-18-node-canvas-recognition.md`
- `docs/decisions/ADR-2026-11-18-canvas-provider-chain.md`
- `docs/decisions/ADR-2026-11-18-math-ink-ocr.md`
- `docs/decisions/ADR-2026-11-18-spatial-canvas-scene.md`
- `docs/decisions/ADR-2026-11-18-canvas-recognition-feedback.md`

### Tests
- `tests/canvas-recognition.test.ts`
- `tests/canvas-providers.test.ts`
- `tests/canvas-benchmark-score.test.ts`
- `tests/canvas-ocr-selection.test.ts`
- `tests/canvas-scene.test.ts`
- `tests/canvas-scene-tools.test.ts`
- `tests/canvas-scene-context.test.ts`
- `tests/e2e/canvas-scene-intelligence.spec.ts`
- `tests/canvas-recognition-feedback.test.ts`
- `tests/e2e/canvas-recognition-review.spec.ts`

## 9. Commands

```powershell
npm test
npm run build
npx tsc -b --pretty false
npm run benchmark:canvas
npm run benchmark:canvas -- --update-baseline
$env:CANVAS_BENCHMARK_BOARD="PhysAlign"; npm run benchmark:canvas
```

Benchmark datasets live under `data/canvas-dataset-benchmark/` (ignored). The seven prepared boards are the source of truth for the current evaluation.

## 10. Environment notes

Set in `.env` (never commit values):

- `GROQ_API_KEY`
- `OPENCODE_GO_API_KEY`
- `OPENCODE_GO_SESSION`
- `OPENROUTER_API_KEY`
- `GOOGLE_AI_API_KEY`
- `CANVAS_PROVIDER_CHAIN=groq,opencode-go,openrouter,gemini`
- `CANVAS_INFERENCE_PROVIDER=auto`
- `CANVAS_OCR_PROVIDER=auto`
- `CANVAS_MATH_OCR_PROVIDER=` (empty → automatic chain)
- `CANVAS_GEMINI_MODEL=gemini-3.1-flash-lite`
- `CANVAS_OPENCODE_GO_MAX_REQUESTS_PER_DAY=20`
- `CANVAS_OPENROUTER_MAX_REQUESTS_PER_DAY=50`
- `CANVAS_GEMINI_MAX_REQUESTS_PER_MINUTE=15`
- `CANVAS_GROQ_MAX_COMPLETION_TOKENS=8192`
- `CANVAS_OCR_MAX_REGIONS=6`
- `CANVAS_SCENE_RECOGNITION=baseline`

Do not print or commit key values.

## 11. First steps for the next session

1. Run `npm test` and `npm run build` to confirm the checkpoint.
2. Run `npm run benchmark:canvas` and confirm the baseline.
3. Phases 2 and 3 are complete (current-course search, scene e2e, analysis fixture, teach/feedback loop, object-creation proposals).
4. Start Phase 4: persisted budgets/usage, per-analysis cost/latency display, provider disclosure/opt-out, circuit breaker metrics, structured logs.
5. Keep the approval gate and `CanvasAnalysisResult` as the single consumer envelope.

Suggested first prompt for the new session:

> Read `docs/CANVAS_INTELLIGENCE_HANDOFF_2026-11-18.md`, verify the checkpoint, then implement Phase 4 operations, cost, and safety. Do not commit unrelated worktree changes.
