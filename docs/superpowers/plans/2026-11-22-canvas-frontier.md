# Canvas Frontier (Mind Maps and Coursework Practice) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give students a first-class mind map on the scientific canvas and let the tutor turn retrieved course notes into practice questions that appear on the board only after the user applies them.

**Architecture:** A new additive `mindmap` scientific object follows the `molecule` composite precedent (one document object, one rendering, one scene node, one proposal path). Coursework practice uses a new read-only drafting service that composes existing course document retrieval with the existing tutor model; the model then calls the unchanged `propose_scientific_object` for each draft, so canvas writes stay on the single revision-checked, approval-gated path.

**Tech Stack:** React 19.2.0, TypeScript 5.9.3, Zod 4.2.0, better-sqlite3 12.4.1, Vitest 3.2.4, Playwright 1.56.1, existing CopilotKit/LangGraphJS tutor and `GET /api/document-intelligence/search`.

**Spec:** `docs/superpowers/specs/2026-11-22-canvas-frontier-design.md` — read it first. It records the reuse-versus-build calls this plan implements.

## Global Constraints

- Start only after the in-flight canvas-first UI port and learning-UI completion land. Those touch `src/App.tsx`, `src/canvas/CanvasStudio.tsx`, `src/canvas/SceneGlyph.tsx`, and `src/learning/*`; rebase this work on the merged tree and stage only files named in each task.
- `CanvasDocument.version` stays `1`. New kind is additive; a board without it must still parse.
- All six parts of a new `ScientificObject` kind are required: model type, registry entry, validation rule, evidence mapping, e2e interaction test, benchmark fixture.
- Do not add a second canvas write path, a second rendering surface, or a second board-interpretation authority. Do not use `@xyflow/react`.
- Every generated question must carry at least one citation to a retrieved course excerpt; uncited drafts are rejected, not shown.
- No changes to OCR regions, recognition thresholds, provider budgets, or the canvas benchmark baseline; no new dependency in root `package.json`.
- No `@ts-ignore`, `@ts-nocheck`, `as any`, or `as never`; every UI change gets a Playwright DOM assertion (`data-testid`).
- Run `npx tsc -b && npx vitest run` before each commit; quote `npm run verify` output in the verification record. Run the canvas benchmark only if a canvas prompt/model/provider path is touched; if it is, quote the four gate numbers and never update the baseline without an explicit request.

## Review Focus

1. **Legacy board compatibility** — adding the kind must not break version-1 documents that lack it. Pinned by Task 1's parse test.
2. **Uncited generated question** — a draft whose excerpt is absent from retrieved chunks must never reach the canvas. Pinned by Task 3's rejection test.
3. **Approval-gate bypass** — drafting must not write the board; revision and document stay unchanged until the user applies a proposal. Pinned by Task 3's revision assertion and e2e.
4. **Mind map interaction on a real board** — placement, selection/move, save/reload, and tutor proposal must work through the native canvas history. Pinned by Task 2's Playwright spec.
5. **Evidence integrity for the new kind** — scene node text must include the map title and labels, with only valid source IDs. Pinned by Task 1's scene fixture test.

---

### Task 1: Mind map kind — model, validation, registry, proposal, evidence, fixture

**Files:**
- Modify: `src/canvas/model.ts` (union at line 29, `validateObject` at lines 72–83, `createObject` at line 209)
- Modify: `src/canvas/registry.ts` (palette entry), `src/canvas/tutor.ts:26` (`scientificObjectKinds`)
- Modify: `server/canvas-intelligence/scene/build.ts` (`summaryOf`)
- Create: `tests/fixtures/mindmap-board.json`, `tests/canvas-mindmap-fixture.test.ts`

**Interfaces:**
- Consumes: `CanvasObjectBase`, `parseCanvasDocument`, `createObject`, `buildCanvasSceneGraph`, `ScientificObject`.
- Produces:
  - `export type MindmapNode = { id: string; label: string; x: number; y: number }`
  - `export type MindmapEdge = { from: string; to: string; label?: string }`
  - `ScientificObject` variant `{ kind: "mindmap"; title: string; nodes: MindmapNode[]; edges: MindmapEdge[] }`
  - caps: ≤12 nodes, ≤16 edges, label ≤120 characters, title ≤200, finite node coordinates within ±1000 relative to the object bounds; unique node IDs; edge endpoints exist; no self-edges.

- [ ] **Step 1: Write failing model/validation tests** in `tests/canvas-mindmap-fixture.test.ts`

```ts
it("round-trips a mind map and still parses a version-1 board without one", () => {
  const board = JSON.parse(readFileSync("tests/fixtures/mindmap-board.json", "utf8"));
  const parsed = parseCanvasDocument(board);
  const map = parsed.objects.find((object) => object.kind === "mindmap")!;
  expect(map.nodes.map((node) => node.label)).toEqual(expect.arrayContaining(["Photosynthesis", "Light reaction", "Calvin cycle"]));
  expect(parseCanvasDocument({ version: 1, snapshot: { document: { store: {} } }, objects: [] }).objects).toEqual([]);
});

it("rejects malformed mind maps", () => {
  expect(() => parseCanvasDocument({ version: 1, snapshot: { document: { store: {} } }, objects: [{ ...valid, edges: [{ from: "a", to: "missing" }] }] })).toThrow();
});
```

Use `createObject("mindmap", 0, 0)` for `valid`; add a case for 13 nodes to pin the cap.

- [ ] **Step 2: Run it and confirm failure**

Run: `npx vitest run tests/canvas-mindmap-fixture.test.ts`
Expected: FAIL — unknown kind and missing fixture.

- [ ] **Step 3: Implement the kind**

Add the variant and exported node/edge types in `src/canvas/model.ts`; add `mindmap` to the `kinds` list (line 75), a `mindmap: ["title"]` entry in `textFields`, and a dedicated validation branch implementing the caps above; add the `createObject` case with a three-node starter; add the palette tool (`group: "Learning"`) in `src/canvas/registry.ts`; add `"mindmap"` to `scientificObjectKinds` in `src/canvas/tutor.ts:26`.

- [ ] **Step 4: Add evidence mapping and assert it**

Update `summaryOf` in `server/canvas-intelligence/scene/build.ts` so a `mindmap` node's `text` includes the title and node labels. Extend the fixture test to build a scene graph from the parsed board and assert exactly one `scientific-object` node whose `recordType` is `mindmap` and whose `text` contains the labels.

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run tests/canvas-mindmap-fixture.test.ts && npx tsc -b --pretty false`
Expected: all tests PASS, typecheck exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/canvas/model.ts src/canvas/registry.ts src/canvas/tutor.ts server/canvas-intelligence/scene/build.ts tests/fixtures/mindmap-board.json tests/canvas-mindmap-fixture.test.ts
git commit -m "feat(canvas): add mindmap scientific object kind"
```

---

### Task 2: Mind map rendering and browser interaction

**Files:**
- Modify: `src/canvas/SceneGlyph.tsx` (kind switch and `objectTitle`), `src/canvas/ScientificLayer.tsx` (placement/move path only), and the canonical text returned by `read_design_guide` if it enumerates object kinds
- Test: `tests/e2e/canvas-mindmap.spec.ts`

**Interfaces:**
- Consumes: the `mindmap` variant from Task 1; existing selection/move/history in `ScientificLayer.tsx`.
- Produces: an SVG glyph with `data-testid="mindmap-root"` and one `data-testid="mindmap-node-${id}"` per node; edges drawn from the object's own node coordinates.

- [ ] **Step 1: Write the failing browser test** in `tests/e2e/canvas-mindmap.spec.ts`

Use the existing e2e helpers (board setup, palette activation, save/reload). Assert in order: palette tool labeled "Mind map" activates a mode; a click places one object; `mindmap-root` and all three starter nodes are visible; dragging the object moves the glyph; after save and reload the three labels persist; applying a `propose_scientific_object` proposal with `kind: "mindmap"` and a `fieldsJson` containing `title`, `nodes`, `edges` renders the proposed labels after the user approves. Assert the board document revision changes only on apply.

- [ ] **Step 2: Run it and confirm failure**

Run: `npx playwright test tests/e2e/canvas-mindmap.spec.ts`
Expected: FAIL — no mind map tool or glyph.

- [ ] **Step 3: Implement rendering**

Add the `mindmap` case to `SceneGlyph.tsx`: draw edges first, then rounded node boxes using the `teaching-scene.ts:40-43` cell constants as the layout baseline, with labels from Task 1's node data; add `mindmap` to `objectTitle`. Keep `ScientificLayer`'s existing whole-object move/preview path — no per-node gesture in v1. Add the design-guide note only if the guide's text lists object kinds.

- [ ] **Step 4: Run the browser test and typecheck**

Run: `npx playwright test tests/e2e/canvas-mindmap.spec.ts && npx tsc -b --pretty false`
Expected: all browser cases PASS, typecheck exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/canvas/SceneGlyph.tsx src/canvas/ScientificLayer.tsx tests/e2e/canvas-mindmap.spec.ts
git commit -m "feat(canvas): render and interact with mind maps"
```

---

### Task 3: SUPERSEDED — not executed in this plan

**Ruling (partner decision, 2026-11-22):** coursework practice generation belongs to the concurrent agent's `author_board` compound-verb design (`docs/superpowers/plans/2026-11-22-adaptive-canvas-authoring.md`), which the partner adopted for this territory over this plan's `draft_practice_from_course` route. Tasks 1–2 (mind map) are unaffected and still execute here; Task 4 proceeds for the mindmap scope only. The interfaces described below (QuestionDraft, draftPractice, `POST /api/courses/:courseId/practice/draft`, `draft_practice_from_course`) are **not built by this plan** and are kept here solely to document what the successor design must cover: cited drafts (excerpt must exist in retrieved chunks), count 1–8 validated not clamped, no canvas write outside the existing approval gate, one approval per question.

**Files:**
- Create: `server/practice-generation/types.ts`, `server/practice-generation/service.ts`, `server/practice-generation/http.ts`, `src/canvas/ai/practice-draft-schema.ts`, `tests/practice-generation.test.ts`, `tests/e2e/canvas-practice-generation.spec.ts`
- Modify: `server/api.ts`, `server/agent.ts` (read-only tool binding at the lines 141–158 pattern), `src/canvas/CanvasStudio.tsx` (register the CopilotKit action alongside the existing canvas actions)

**Interfaces:**
- Consumes: `RetrievalResult`/chunk shape from `server/tutor-retrieval-policy.ts`; existing `GET /api/document-intelligence/search`; `propose_scientific_object` and `canvasObjectCreateSchema` from `src/canvas/tutor.ts:27`.
- Produces:
  - `QuestionDraft = { prompt: string; answer?: string; conceptId?: string; citations: Array<{ documentId: string; chunkId: string; excerpt: string }> }`
  - `draftPractice(input: { courseId: string; lessonId: string; conceptId?: string; count?: number; retrieve: (query: string) => Promise<RetrievalResult>; generate: (prompt: string) => Promise<unknown> }): Promise<{ drafts: QuestionDraft[]; warnings: string[] }>`
  - `POST /api/courses/:courseId/practice/draft` → `{ drafts, warnings }`, read-only
  - tutor tool `draft_practice_from_course`, read-only, schema from `src/canvas/ai/practice-draft-schema.ts`

- [ ] **Step 1: Write failing service tests** in `tests/practice-generation.test.ts`

With an injected `retrieve` returning a known chunk and an injected `generate` returning one good draft and one draft citing an excerpt absent from that chunk: assert the good draft survives with its citation, the uncited draft is rejected with a warning, `count` above 8 is rejected with a validation error (not silently clamped), and `draftPractice` makes zero calls to any canvas write function (inject a spy).

- [ ] **Step 2: Run it and confirm failure**

Run: `npx vitest run tests/practice-generation.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the service and endpoint**

Validate `generate` output with a strict Zod schema in `server/practice-generation/types.ts` (no `as any`). Validate `count` in 1–8 (default 4), rejecting values above 8; cap each excerpt at 400 characters. Keep every citation's `chunkId` and `documentId` from the retrieved chunks; never copy an ID from model output. Register the route in `server/api.ts`; the handler must not import canvas persistence.

- [ ] **Step 4: Bind the read-only tutor tool**

Add `draft_practice_from_course` following the `sameCanvasScope && state.copilotkit.actions?.some(...)` pattern in `server/agent.ts`, register the action in `src/canvas/CanvasStudio.tsx`, and instruct the tutor in its tool description to call `propose_scientific_object` once per accepted draft so every question is applied explicitly. No new approval UI and no new canvas write path.

- [ ] **Step 5: Write and run the browser test** in `tests/e2e/canvas-practice-generation.spec.ts`

With document retrieval and generation mocked at the HTTP boundary: ask the tutor for practice questions from the active lesson; assert drafts with visible citations are returned, the board document and revision are unchanged before approval, and after applying one proposal a `question` object with the drafted prompt appears on the canvas (`data-testid`). Then run: `npx playwright test tests/e2e/canvas-practice-generation.spec.ts && npx tsc -b --pretty false`
Expected: PASS, typecheck exits 0.

- [ ] **Step 6: Commit**

```bash
git add server/practice-generation/ server/api.ts server/agent.ts src/canvas/ai/practice-draft-schema.ts src/canvas/CanvasStudio.tsx tests/practice-generation.test.ts tests/e2e/canvas-practice-generation.spec.ts
git commit -m "feat(tutor): draft cited practice questions from course notes"
```

---

### Task 4: Reuse ADR, full verification, status update (mindmap scope)

**Files:**
- Create: `docs/decisions/ADR-2026-11-22-coursework-practice-and-mindmap.md`, `docs/verification/2026-11-22-canvas-frontier.md`
- Modify: `docs/STATUS.md`

**Interfaces:**
- Consumes: test output from Tasks 1–3, the spec's approach comparison.
- Produces: a concise ADR recording alternatives (xyflow surface, batch write tool), exact reused versions/licenses (Zod 4.2.0, React 19.2.0, in-repo retrieval and proposal code), limits (whole-object editing, 8-question cap, one approval per question), and verification evidence.

- [ ] **Step 1: Write the ADR**

Include the reuse-versus-build decision, alternatives rejected, limits, and what would trigger a revisit (per-node editing demand, batch approval demand, paginated retrieval).

- [ ] **Step 2: Run full verification**

Run: `npm run verify`
Expected: tsc, Vitest, Playwright all pass; quote output. No canvas prompt/model/provider path changed, so no `benchmark:canvas` run is required; state that explicitly in the verification doc. If any such path did change, run `npm run benchmark:canvas` and quote all four gate numbers without updating the baseline.

- [ ] **Step 3: Update status and commit**

Refresh `docs/STATUS.md` with the two new capabilities and their limits (no per-node drag, no batch approval, citations are evidence not proof). Write `docs/verification/2026-11-22-canvas-frontier.md` with quoted commands and results.

```bash
git add docs/decisions/ADR-2026-11-22-coursework-practice-and-mindmap.md docs/verification/2026-11-22-canvas-frontier.md docs/STATUS.md
git commit -m "docs(canvas): record frontier verification and limits"
```

---

## Verification Summary

| Check | Command | Pass condition |
| --- | --- | --- |
| Mind map model/fixture | `npx vitest run tests/canvas-mindmap-fixture.test.ts` | legacy board parses; caps and refs enforced; scene node carries labels |
| Mind map e2e | `npx playwright test tests/e2e/canvas-mindmap.spec.ts` | place, move, save/reload, apply tutor proposal |
| Practice service | `npx vitest run tests/practice-generation.test.ts` | uncited draft rejected; no canvas writes |
| Practice e2e | `npx playwright test tests/e2e/canvas-practice-generation.spec.ts` | citations visible; revision unchanged until approval |
| Full verify | `npm run verify` | tsc, Vitest, Playwright pass, output quoted |
