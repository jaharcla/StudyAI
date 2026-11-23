# Plan: an adaptive tutor that composes the board, not one that operates tools on it

Date: 2026-11-22 (rev 3 — rev 2 corrected twelve design faults; rev 3 records your three answers and the concurrent-agent finding)
Status: proposal for approval. Nothing here is built yet. Decisions 1 and 2 are settled; 3 and 4 are open.
Depends on: [ADR-2026-11-22-tutor-retrieval-judgement.md](../../decisions/ADR-2026-11-22-tutor-retrieval-judgement.md)
Supersedes pending decision 3: the `draftPractice` route described in [canvas-frontier design](../../specs/2026-11-22-canvas-frontier-design.md) and [plan](2026-11-22-canvas-frontier.md).
Working-tree constraint (checked 2026-11-22): a second agent holds uncommitted work on `main` in `src/canvas/SceneGlyph.tsx` (+3−1: a `question` object's answer is hidden until a `data-testid="reveal-answer"` toggle) and `src/canvas/CanvasStudio.tsx` (+10−3: flashcard → "Add to review deck" posting to `/study/cards`). Neither touches placement, the teaching scene, or `compileTeachingScene` — verified by diffing for layout keywords — so **Phase 1 does not collide**. Phases 3 and 5 do: Phase 5's answer-hiding is *already being built*, and Phase 3 edits the same `SceneGlyph` switch. See "Concurrent agents" below.

## Thesis

The tutor should hold the *pedagogical* decision and the system should hold the *mechanical* ones. Today that is inverted: the model supplies pixel coordinates and obeys a prose guide about gaps it cannot measure, while the app — which owns the spatial index, the object registry, and the scene graph — contributes validation only after the fact.

Target: one semantic verb whose argument is the learning task, compiled by the system into a correct, collision-free, provenance-carrying board edit in one reviewable transaction. The model decides what the question tests, what grounds it, and what the figure must show. It never decides where the pixels go.

## Rev 2 — what the review changed

Rev 1 fixed the right problem slowly and quietly created new ones. Every item below is now reflected in the phases.

| # | Finding in rev 1 | Change |
|---|---|---|
| 1 | Overlap fix was buried behind a "zero behaviour change" phase 1 | The layout solver is **wired into `compileTeachingScene` in Phase 1**. Behaviour changes immediately, which is the point. |
| 2 | "inside viewport" contradicted "grow the frame outward" | One rule now: in-viewport placement first; if nothing fits, return a **conflict plus a suggestion** and let the student or model choose. Never place silently off-board. |
| 3 | "0 overlaps" was asserted without checking what the index holds | Occupancy is defined as the same scene graph `describeCanvas` reads. Non-stroke QuickDraw records become `native-object` nodes (`server/canvas-intelligence/scene/build.ts:140`), so arrows and text are in it — but bounds accuracy for a labelled arrow is now a **Phase 1 test that can fail**, not an assumption. |
| 4 | Deleting `recommendedToolsForQuery` could hurt weaker models | Deletion moved from Phase 4 to **Phase 6, gated on per-provider measurement**. `agent.ts:333,471` already handles `tool_call_unsupported`, so a model that needs hints and loses them fails loudly rather than quietly — but the rate still gets measured first. |
| 5 | Routing moved into the model rather than disappearing | Rev 1 said this as a principle and then never measured it. Now **"route correctness" is a scored metric** with a stated selection rule. |
| 6 | No call budget, and the real one is `TUTOR_MAX_PROVIDER_CALLS=3` (`server/tutor-provider.ts:34`, enforced `server/agent.ts:283`) | Composite authoring is designed to a **2-call normal path, 3-call worst case**, and a test runs it against the cap. Raising the cap is an explicit ADR decision, not an accident of the retry ladder. |
| 7 | A cited-but-wrong question was the biggest risk and unaddressed | New Phase 5: generated content is **marked unverified**, answers hidden until attempted or checked by an existing checker, and pedagogy is scored separately from grounding. |
| 8 | Canvas invariants absent | Invariants are now explicit gates on every phase, with the four gate numbers named. |
| 9 | Aliases could become real ids | Aliases are **transient by contract**: resolved before validation, never persisted, with a test that none leak into the saved document. |
| 10 | Two metrics were uninformative or overstated | "0 coordinates supplied" dropped as a runtime metric (a schema makes it tautological; it becomes a schema assertion). Empty-board and reuse-board are scored **separately**, and my rev-1 prediction is narrowed to the reuse case. Pedagogy gets a written rubric a second reader can apply. |
| 11 | Dirty tree ignored | Phases 3 and 4 open with a reconciliation step naming the files and their owner. |
| 12 | Frontier absorption undecided | Phase 4 is **blocked on Open decision 3**, with a stated fallback if the answer is "keep it separate". |

## Target behaviour (the acceptance test)

Student, board already containing a hand-drawn incline and a block:

> I'm working on friction from module 1, can you make a question with a diagram on the canvas pertaining to it?

One turn: the tutor searches course material with its own query → reads the board → decides the task calls for one freebody question with a three-force diagram → emits one intent object → the compiler resolves geometry against real occupancy → **one** review dialog: *"adds 1 question and 1 freebody diagram (gravity, normal, friction) in the clear area right of your block sketch, citing Module 1 · p. 4 — generated, not verified"* → apply → one revision bump, persisted.

Two calls, zero coordinates in model output, one approval, and the artifact is labelled as generated rather than as course fact.

## Why today cannot do that

| # | Evidence | What it means |
|---|---|---|
| 1 | `compileTeachingScene` places nodes at `100 + column * (CELL_WIDTH + GAP_X)` (`src/canvas/ai/teaching-scene.ts:40-52`) with no occupancy read; `existingShapeIds` gates only highlights (`:92`) | Overlap is structurally guaranteed **on reuse**. An empty board looks fine, which is why rev 1's blanket prediction was too strong. |
| 2 | `CANVAS_DESIGN_GUIDE` orders the model to "keep at least 60px gaps" and avoid overlap (`src/canvas/ai/scene-tools.ts:7-14`) | Geometry delegated to a model with no coordinate feedback, while `query()`/`nearest()` exist (`src/canvas/spatial/index.ts:6-7`). |
| 3 | `canvasObjectCreateSchema` requires numeric `x`, `y` and `fieldsJson` as a string (`src/canvas/tutor.ts:27-34`) | The "5 variables" are mandatory schema inputs. |
| 4 | 16 registry kinds incl. `force`, `vector`, `graph`, `question` (`tutor.ts:26`) reachable only one at a time; `teachingSceneSchema` emits only `box`/`note` (`teaching-scene.ts:12`) | Two disconnected write vocabularies; "a question with a diagram" is inexpressible in both. |
| 5 | `highlightShape`/`moveShape` resolve ids against the current store and throw `Unknown shape ID` (`src/canvas/ai/canvas-actions.ts:90,108`) | A batch cannot reference its own output, which is *why* composite work degrades into N proposals. |
| 6 | `recommendedToolsForQuery` regex-selects ≤3 names (`server/tutor-retrieval-policy.ts:44-60`, used `server/agent.ts:232`) | A task→tool table — the pattern already removed from retrieval. |
| 7 | Frontier design accepts "one approval per question; acceptable for sets of at most 8" (`docs/superpowers/specs/2026-11-22-canvas-frontier-design.md:43`) | Interaction cost treated as a UI property rather than a transaction-model property. |

## Principles

1. **Judgement to the model, mechanics to the code.** Content, pedagogy, grounding, intent: the model. Geometry, collision, identity, ordering, validation, provenance bookkeeping: the app.
2. **The student's request is not a task key.** No utterance→tool table, no per-intent branches. Note honestly: this removes routing *rules*, not routing *decisions* — the model still picks the brief or a low-level tool, and Phase 6 measures that pick.
3. **Local-first determinism where it can be.** Placement computed, reproducible, testable.
4. **Freedom must be measured.** Every phase carries a number that can regress.
5. **Reuse what is genuinely good; replace what isn't.** Good: scene graph, spatial index, revision-checked persistence, approval gate, object registry, citation-validation machinery. Not good: the fixed grid, mandatory coordinates, the imperative layout guide.
6. **A generated thing is not a course fact.** Grounding and correctness are different claims and are labelled and measured separately.

## Target architecture

**1. `ArtifactBrief` — the intent schema.** `topic` (student's words + the model's own course query); `artifact` (`question` | `problem-set` | `figure` | `worked-example` | `deck`, each with prompt, parts, what the figure must *show*, concepts tested); `placement` (all optional, intent only: `near`/`below`/`beside` a node or "a clear area" — **no coordinates in this schema**); `sourceRefs` validated server-side against chunks that were actually returned, never copied from model output. Replaces the model-facing role of `teachingSceneSchema` and authoring via `propose_scientific_object`.

**2. Layout planner.** `planLayout(requests, occupancy, viewport) → placements | { conflict, suggestion }`. Occupancy = the scene graph `describeCanvas` reads, with padding for stroke bounds. Preference order: (a) near the anchor, (b) reading order left→right then top→down, (c) first free band inside the viewport. If nothing fits: **return the conflict and the best out-of-view suggestion; do not place**. Replaces `100 + column * 240`. The guide stops being instructions to obey and becomes a statement of what the system guarantees.

**3. In-batch identity.** Transient aliases (`#block`) resolved by the compiler once created ids exist, so highlight/label/connect can target same-batch output. Contract: aliases are **never written into the document**, never collide with store ids, and are stripped before validation. This is what makes a composite artifact one transaction.

**4. Figure compiler.** Semantic figure descriptions compile onto the existing registry (`force`, `vector`, `graph`, `anatomy`, `equation`, `question`) with QuickDraw primitives where primitives are right, positioned by the planner. Delivers the promise `server/agent.ts:158` already makes in prose ("the app computes bounded layout positions").

**5. ProposalBundle + verification status.** One reviewable transaction with a plain-language diff, apply/reject and per-item exclusion; every generated object carries a generated-and-unverified marker, and a `question` object's answer is hidden until attempted or graded by an existing checker. Approval gate preserved; only granularity changes.

**6. Capability presentation (later).** Once measured per provider, the model gets live facts — bound tools, `describeCanvas` summary, free-space note — and `recommendedToolsForQuery` is deleted. Phase 6.

## Keep / extend / replace / delete

- **Keep:** scene graph, spatial index, `server/canvas-persistence`, approval gate, `canvas-reasoning`, registry and its six-part kind rule, citation validation.
- **Extend:** action batch (transient aliases); registry→figure mapping; `describeCanvas` free-space note; evidence to carry `sourceRefs` on board content.
- **Replace:** fixed grid → planner; mandatory `x`/`y` + `fieldsJson` string → brief (coordinates stay on the demoted low-level tool); imperative guide → guarantees.
- **Delete (Phase 6 only):** `recommendedToolsForQuery`. **Superseded (pending decision 3):** `draftPractice`.

## Binding invariants — checked every phase

- Every canvas mutation bumps `revision` and persists via `server/canvas-persistence`. **No direct `canvases.document` writes.** A bundle applies as **one revision** and either commits fully or not at all — no partial artifact.
- `CanvasDocument.version` changes only with a `parseCanvasDocument` migration + a test loading the previous shape. Prefer adding no version bump.
- A new scientific-object kind requires all six: model type, registry entry, validation rule, evidence mapping, e2e interaction test, benchmark fixture. Half a kind is not a kind.
- No lowering of OCR region caps, provider budgets, or confidence thresholds without an ADR.
- Any change to a prompt, model or provider requires `npm run benchmark:canvas` against `docs/verification/canvas-benchmark-baseline.json`, **quoting the four gate numbers** (hard failures; math exact count, floor baseline − 1; math mean F1, floor baseline − 0.1; PhysAlign coverage, floor baseline − 0.15 — thresholds per `scripts/benchmark-canvas.ts:199-202`). Baseline is currently 0 / 4 / 0.91 / 0.75. `--update-baseline` only on explicit request.
- `gitnexus impact` before editing `compileTeachingScene`, `canvasActionSchema`, `proposeCanvasObject`, `teachingSceneSchema`, `agent.ts` graph node; `detect_changes` before any commit.
- UI-visible behaviour needs Playwright asserting the DOM. No `@ts-ignore`/`as any`. `npm run verify` quoted in each phase handoff, with environment-caused failures named rather than hidden.
- Before `/canvas-verify` passes, no claim of canvas completion.

## Phases

**Phase 0 — ADR (no code).** Records: one verb vs tool menu; app-owned layout; **one approval per artifact (decided)**; transient aliases; the 2/3-call budget; generated-vs-verified labelling; the coordinate-tool ruling (decision 2, below); what is deleted and what triggers revisit. Still needs decision 3 to schedule Phase 4.

**Phase 1 — stop the overlap. Ships a behaviour fix. ✅ Done 2026-11-22, evidence: [canvas-layout-planning](../../verification/2026-11-22-canvas-layout-planning.md).** Build `planLayout`, wire it into `compileTeachingScene`, keep the guide as documentation.
Tests: property test — no returned rect intersects existing occupancy, 60 px separation holds, identical inputs give identical placements; **a crowded board returns a conflict with a suggestion and places nothing**; occupancy cases scored on empty board and on a reused board separately; labelled arrow and a text box are treated as occupied (this is where finding 3 can fail and must be allowed to); e2e: draw a scene twice, assert the second does not intersect the first. Gate: `tsc -b`, unit + e2e, `benchmark:canvas` if a prompt moves.
Impact: fixes the bug students actually hit, without waiting for the new schema.

**Phase 2 — in-batch references. ✅ Done 2026-11-22, evidence: [canvas-batch-references](../../verification/2026-11-22-canvas-batch-references.md).** Batch-level id resolution so an action can reference a shape an earlier action in the same batch creates; validator accepts it in both propose and approve; the `existingShapeIds` highlight workaround removed.
**Design changed during implementation, for the simpler option:** no `#alias` syntax was needed. `createShape` already carries an explicit id, so the planner-validating fix was to thread the batch's own created ids through validation in order — no new namespace, therefore no possibility of an alias leaking into the document. Forward references stay illegal because the batch applies in order, and `updateShape` on a not-yet-committed shape is refused rather than guessed.
Tests: create three shapes and highlight one, applied as one transaction; unknown id rejected; forward reference rejected; update-on-batch-id refused with a reason; **a batch that fails partway leaves the board exactly as it was**.
**Bug found while testing this:** `Store.transact` commits its diff in a `finally`, so it groups changes but does *not* roll them back — a throwing action used to strand half an artifact on the board. `approveCanvasProposal` now snapshots the (immutable) records and restores them, emitted as a `remote` diff so it adds no undo step.

**Phase 3 — figures in the real vocabulary.** *Opens on the reconciled state of `SceneGlyph.tsx` — see "Concurrent agents"; its `objectTitle`/kind switch is being edited by another agent right now.* Compiler from semantic figure to registry kinds, positioned by the planner. Any new kind goes through the six-part rule.
Tests: "a freebody diagram" yields labelled force objects, not rectangles; golden board per figure type through the browser.

**Phase 4 — the brief.** One authoring tool over `ArtifactBrief`, with validated `sourceRefs`. `recommendedToolsForQuery` **stays** (Phase 6 deletes it).
Rule now decided (my call on decision 2): **creating content goes through the planner; adjusting existing content may take coordinates.** `propose_scientific_object` keeps `x`/`y` for the "nudge that label 20 px left" case, and the brief exposes none. A coordinate can therefore move something the student already has, but can never place new content into a space the planner did not clear. Both branches get measured against the same corpus (Phase 6), because the risk of this split is that "adjust" becomes a loophole for authoring around the planner.
Blocked on Open decision 3: if `draftPractice` is not being absorbed, this phase ships alongside it and the duplication is recorded in the ADR rather than silently forked.
Tests: the acceptance transcript e2e; **budget test at `TUTOR_MAX_PROVIDER_CALLS=3`** asserting the normal path uses 2 calls and the repair path fits inside 3 and reports `provider_call_limit` honestly when it does not; board revision unchanged before approval; one dialog.

**Phase 5 — generated content is labelled as generated.** Unverified marker on authored objects; `question` answers hidden until attempt or wired to an existing checker; provenance rendered in the review dialog and the applied object.
**Partly being built already, by the second agent:** `SceneGlyph.tsx` currently hides a `question` object's answer behind a `reveal-answer` toggle and `CanvasStudio.tsx` registers a flashcard into the review deck. Phase 5 therefore *audits and extends* rather than implements — the answer is hidden until **revealed**, not until **attempted**, and a reveal button is not a check. Decide whether reveal-on-tap is acceptable pedagogy or must gate on an attempt/checker, and keep the existing `data-testid="reveal-answer"` contract working rather than renaming it.
Tests: e2e that the marker and hidden answer render in the DOM; a unit test that a cited-but-unsupported claim cannot be presented as course fact.
This phase is what keeps the design from becoming a confident-wrong-answer machine.

**Phase 6 — bundles and capability presentation.** Single apply/reject with diff preview and per-item exclusion; measure per provider, then delete `recommendedToolsForQuery`.
Tests: apply-all, reject-all, exclude-one; route-correctness measured before and after deletion on both Groq and local Ollama, and deletion proceeds only if local does not regress.
Coordinate A/B, per your "test both": the same corpus run twice, once with the coordinate-adjust path available to the model and once withheld, comparing spatial legality, pedagogy and call budget. Stated in advance so it can be wrong: withholding it costs nothing on composition and loses the "nudge that label" case, so the split rule holds; if legality instead *drops* when the path is available, the loophole worry was real and the path gets narrowed further.

**Phase 7 — composition measurement.** Run the corpus against the built system **and** against today's tools for comparison; numbers into the ADR verification file. This is also where I find out whether the brief is too prescriptive, the main way this design fails.

**Phase 8 — earn the right to stop asking.** Per your note that approval should largely go away as quality rises, the review dialog is built from the start so it can be *downgraded*, not rebuilt. Risk-tiered auto-apply, decided by measurement rather than by feel:
- **Auto-applicable once the numbers support it:** additive only — a new artifact placed by the planner into cleared free space, touching no existing student content, with validated grounding, and fully reversible by one undo.
- **Always approved, no matter how good it gets:** anything that deletes, moves, resizes or overwrites content the student made; anything that changes `CanvasDocument.version`; anything that touches another board.
Gate: a tier may only flip after Phase 7's legality is deterministic-clean across repeats and the pedagogy rubric clears a threshold fixed in the Phase 0 ADR *before* we see the numbers. Undo is a precondition, not a consolation.

## Approval trajectory

Rev 2 still treats the review dialog as permanent. Your answer — one approval per artifact, and eventually probably none — is the better target, and it changes what the review UI is for. Its job stops being "catch the model's mistakes" and becomes "show the student what changed, and make it one keystroke to undo." That also means the artifact must be reversible as a *unit*: one revision bump, one undo step, so removing the dialog does not remove the escape hatch. The risk-tier split above is how this plan keeps that from becoming an unprincipled "trust it now" switch.

## Concurrent agents

Decision 1 is settled: **one approval per artifact, whole artifact, per-item exclusion available.** Decision 2 is mine and I've made it in Phase 4, with the A/B in Phase 6 to check it. Decision 3 (absorb `draftPractice`?) stays open and still blocks Phase 4.

One live coordination issue, since a second agent is working in this tree:
- Its uncommitted diff is `SceneGlyph.tsx` (+3−1, answer reveal for `question` objects) and `CanvasStudio.tsx` (+10−3, flashcard → review deck via `POST /study/cards`). **No overlap with Phases 1, 2, 4, 5** — it touches neither placement nor the teaching-scene compiler, verified by diffing for layout symbols.
- It **does** collide with Phase 3, which extends the same `SceneGlyph` kind switch. And Phase 5's premise — hide the answer until *attempted* — is partly pre-empted by their hide-until-revealed toggle, which is weaker pedagogy.
- My own retrieval and context changes are uncommitted in the same tree, so the risk is mutual clobbering on any `git checkout`/`stash`/`commit -a`, not just file overlap.

Recommendation, your call: let it finish and commit its two files, then I rebase Phases 3 and 5 onto whatever landed and treat its reveal toggle as the floor I have to beat, not something to overwrite. If it is mid-flight and unclear, the cheaper option is that I work in a fresh worktree off `main` and merge later — Phases 1 and 2 are the ones I can start today, and neither touches their files.

## The measurement

`tests/fixtures/canvas-authoring-tasks.ts`: composite requests, each with its **starting board state** (empty and populated variants), the course document that should ground it, and expectations.

| Metric | Target | How measured |
|---|---|---|
| Task completion | requested artifact appears | object kinds + prompt text in the applied document |
| Spatial legality | no overlaps, ≥60 px separation, nothing placed silently off-board | scene-graph occupancy + `overlaps` edges — deterministic, no model |
| Grounding | every `sourceRef` matches a retrieved chunk | server-side validation, mirrors the read-side check |
| **Pedagogy** | figure shows what was asked; question answerable and correct | **written rubric, scored by a second reader or an independent grader** — not by me |
| Route correctness | brief chosen for composition, low-level tool for single edits | labelled task set, rate over repeats |
| Verification labelling | generated content visibly marked unverified; answers not exposed early | DOM assertions |
| Interaction cost | 1 approval per composite artifact | proposals raised |
| Call budget | ≤2 normal, ≤3 worst case | invocations against the `agent.ts:283` cap |

Schema assertion, not a runtime metric: the brief contains no coordinate field. Rev 1 scored "0 coordinates supplied by the model" at runtime, which a schema already guarantees.

Honest prediction, narrowed: today's tools will fail **spatial legality on the reused-board cases** and **interaction cost** on every composite task. Empty-board cases may pass legality, and claiming otherwise would be posturing.

## Anti-goals

- **An agent that fiddles.** No 30-step loop nudging shapes; placement is one deterministic pass and the model is not in the geometry loop.
- **A 40-tool menu with auto-selection.** One verb plus demoted low-level tools.
- **`if task == friction then …`.** Friction is content the model reads, not a branch.
- **Autonomy without a quality record.** The gate is temporary by intent; what must not be temporary is the measurement that earns its removal. Removing review because it is annoying, while the pedagogy rate is unknown, is the failure this design has to refuse.
- **Confidently placing over the student's work** — the planner's conflict path is the only exit when space is tight, and it cannot be bypassed because it is the only route to coordinates.
- **Treating a citation as correctness.** This is rev 1's blind spot, now Phase 5.

## Risks

1. **One-shot composition may be worse than incremental.** Parts structure allows one-part-first; schema repair retry (the pattern at `canvas-reasoning/service.ts:77-83`); per-item exclusion.
2. **The brief becomes a second interpretation authority**, which the canvas rules forbid. It owns *authoring* only; whole-board interpretation stays in `scene/`, direct manipulation in `canvas-analysis/`; Phase 0 says so.
3. **Layout legality ≠ layout taste.** No overlap is provable; tidiness is not. Taste lives in the pedagogy rubric and is allowed to fail visibly.
4. **The call budget is genuinely tight.** 3 calls with a repair ladder can be exhausted by search + brief + repair. Mitigation is honest failure reporting and a deliberate ADR decision, not a silent cap raise.
5. **Deleting the routing hint could degrade local models.** Deferred to Phase 6 behind measurement for exactly this reason.
6. **Changing frontier behaviour may break tests that encode today's shape** (`recommendedToolsForQuery`'s test file, frontier's question-drafting coverage). Those are current behaviour, not requirements; Phase 0 lists what gets replaced.
7. **Editing alongside uncommitted work.** Phases 3 and 4 start by reconciling `SceneGlyph.tsx`/`CanvasStudio.tsx` ownership.

## Non-goals

Freehand stroke generation, image rendering, handwriting in generated content, an autonomous multi-turn planner, batch approval across unrelated pre-existing objects, embeddings, and any change to region caps, budgets or confidence thresholds without an ADR.

## Decisions

**1. Approval granularity — settled.** One approval per artifact, the whole artifact, with per-item exclusion available inside that single dialog. Your reasoning is the design's: a composite request is one thing, and approving five fragments of it feels wrong to the person who asked for one.

**2. Coordinates for adjustment — mine, made.** Creating content routes through the planner and the brief exposes no coordinates at all; `propose_scientific_object` keeps `x`/`y` for adjusting something that already exists. So a coordinate can nudge the student's own label but cannot place new work into space the planner did not clear. Phase 6 runs the A/B rather than trusting my reasoning, and my stated bet is that the split rule survives and the loophole worry does not.

**3. Absorb `draftPractice` into the brief? — open, and it blocks Phase 4.** I recommend absorb: "make me questions from module 1" is this brief's headline case, and two routes to the same artifact is exactly the duplicate-authority mistake the reuse policy warns about. `server/practice-generation/` does not exist yet, so nothing is pulled out from under anyone.

**4. New, created by the concurrent-agent finding — open.** Is the other agent's hide-until-*revealed* answer acceptable Phase 5 pedagogy, or must the answer gate on an actual attempt or checker? Their toggle is a floor I can build on; answering "revealed is enough" makes Phase 5 mostly labelling and provenance instead.
