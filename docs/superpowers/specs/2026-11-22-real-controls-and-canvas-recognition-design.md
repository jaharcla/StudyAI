# Real utility for every control + persistent canvas recognition

Date: 2026-11-22
Branch: work on top of `fix/ci-omniroute-groq-mock`

## Intent and why

Four controls in the workspace are hard-disabled with "not available yet" tooltips:
Global search, Learning progress, Help, and the tutor's ⋯ options. They are
decorative affordances the product never delivered. Separately, the tutor can
sometimes read handwriting on the canvas ("hello") and sometimes report the
same strokes as unrecognized; the likely cause is that canvas analysis is
component-local React state, so it disappears on reload or branch switch and is
never republished to the agent.

The goal is that no visible control is a lie, and that canvas understanding
survives a reload. Nothing here changes the immersive UI direction already
approved.

## Goals

- Global search opens a real search dialog over indexed course documents and
  opens the matching page/slide in the reader.
- Learning progress shows real, locally-derived numbers per course.
- Help opens a real in-app guide to controls, shortcuts, and the canvas workflow.
- Tutor ⋯ opens a real menu with at least: new conversation, toggle lesson
  context, copy last answer.
- Canvas analysis results are persisted per board and revision, rehydrated on
  load, and republished to the tutor; stale results are invalidated.
- Every changed UI surface has a browser-level test asserting the DOM result.

## Non-goals

- Changing the immersive visual design or the tutor canvas-context fields
  already shipped.
- Changing OCR providers, recognition thresholds, or region caps.
- Adding hosted services or sending new data off-device beyond the existing
  opt-in OCR egress toggle.
- Making buttons that are legitimately disabled by state (no course selected,
  nothing to undo, request in flight) permanently enabled.

## Anti-goals

- Another fake modal with placeholder numbers.
- Wiring search/progress to hard-coded demo data.
- Persisting analysis in a way that bypasses the canvas persistence authority
  or writes `canvases.document` directly.

## Constraints

- Canvas invariants from AGENTS.md: mutations bump `revision` and go through
  `server/canvas-persistence`; `CanvasDocument.version` may not change without a
  migration and a previous-shape test.
- Do not lower OCR region caps, provider budgets, or recognition confidence
  thresholds without an ADR in `docs/decisions/`.
- Any prompt/model/provider change requires `npm run benchmark:canvas` against
  the checked-in baseline with the four gate numbers quoted at handoff.
- No `@ts-ignore`, `@ts-nocheck`, `as any`, or `as never` to make code compile.
- Third-party APIs must be verified against installed type definitions.
  Verified here: `useCopilotChatConfiguration` is exported from
  `@copilotkit/react-core/v2` (`dist/v2/index.d.mts`, export list, symbol `tr`),
  and its value exposes `startNewThread()` (`dist/v2/headless.d.mts`,
  `CopilotChatConfigurationValue`). `searchDocuments` is available through
  `GET /api/document-intelligence/search?course=&q=` and returns `SearchHit`
  with `sourceRef` (`src/components/document-intelligence/api.ts:5`).
- Reading is fine; no suppression comments.

## Approaches considered

1. **Wire existing capabilities only.** Search via the existing document-intelligence
   search endpoint; progress derived from existing local data; help and tutor menu
   as local UI. No new backend. Smallest and lowest risk, but progress needs a
   new read path anyway because no existing endpoint lists attempts/mastery.
2. **Add the missing backend read paths.** Add a progress endpoint and persist
   canvas analysis results so the tutor keeps its understanding after reload.
   This is what makes all four controls and the recognition complaint real.
3. **Everything plus a recognition redesign.** Also re-architect OCR. Rejected:
   no evidence the OCR pipeline itself is broken, and it would change provider
   behaviour governed by the benchmark gate.

The partner chose **everything including the handwriting fix**, which maps to
approach 2 plus the targeted persistence fix for analysis. Approach 3's broad
OCR rewrite is out of scope.

## Decided design

### Global search

- Enable the sidebar Search button. Clicking (and ⌘K / Ctrl+K) opens a
  `SearchDialog`.
- Input is debounced and calls
  `GET /api/document-intelligence/search?course=<active>&q=<query>`.
- Results are real `SearchHit`s: title, unit number, excerpt, score. Clicking a
  hit sets `openSourceRef` to `hit.sourceRef` and switches to `Lecture`, reusing
  the existing citation-opening path in `App.tsx`.
- Empty query shows a short instruction, not fake suggestions. Errors show the
  server error text. Keyboard: Escape closes, Enter opens the first hit.
- If no course is selected the dialog explains that a course is needed and does
  not call the API.

### Learning progress

- Add `GET /api/progress?course=<id>` to the local data API. It aggregates only
  from existing learning tables: number of lessons with at least one attempt,
  total attempts, correct attempts, distinct concepts with mastery > 0.5, and
  due review count. Return small integers; no invented streak or hours.
- Enable the sidebar Learning progress button. It opens a `ProgressDialog`
  rendering those numbers per lesson with thin bars and a source note saying
  the values come from local study attempts.
- Empty state: "No study activity yet — answer a question or start an activity."

### Help

- Enable the top-bar Help button. It opens a `HelpDialog` with real content:
  canvas tool palette and search, Draw/Science/Learning tool groups, Analyze
  board, Labels, undo/redo, view switcher, tutor actions, dark mode, settings,
  and the ⌘K shortcut. No links to nonexistent pages.
- Buttons inside Help that need another surface call the same state setters as
  the real controls (e.g. "Open settings" opens settings).

### Tutor options

- Enable the ⋯ button. It opens a small menu anchored to the tutor header.
- **New conversation**: call `useCopilotChatConfiguration()?.startNewThread()`.
  This hook is available in the installed v2 package; cite the declaration when
  wiring. If the hook returns null (chat not configured), disable the item with
  an honest tooltip rather than leaving it fake.
- **Toggle lesson context**: flips `tutorContextOpen`, the same state the X button
  uses.
- **Copy last answer**: reads the last rendered assistant message from the
  `.copilot-slot` DOM and writes its `innerText` to the clipboard via
  `navigator.clipboard.writeText`, with a brief "Copied" status. No access to
  raw model metadata.
- Menu closes on outside click and Escape.

### Canvas recognition persistence

- Root cause to confirm first with a failing test: `CanvasStudio` keeps
  `canvasAnalysis` in `useState` (line 77) and only populates it in
  `analyzeBoard` (line 255). On reload the state is gone, so
  `CanvasAnalysisTutorContext` (line 814) never publishes the OCR result and the
  tutor only sees raw freehand strokes.
- Add a `canvas_analyses` table keyed by board id with course_id, lesson_id,
  revision, result JSON, and timestamp. This is derived data; it does not change
  `CanvasDocument.version` and does not touch `canvases.document`.
- After `POST /api/canvases/:id/analysis` succeeds, store the validated result
  against the board's revision in `server/canvas-analysis`.
- On board load, fetch the stored analysis; use it only if course, lesson, and
  revision all match the authoritative board. Otherwise show nothing and let
  the user re-run Analyze board.
- Keep "Analyze board" manual. Do not auto-run OCR on every load.
- The existing `validateCanvasAnalysisAtReceiver` remains the gate for anything
  sent to the agent; stored results are re-validated on rehydration.

## What is left to the builder

- Implement in the order: search dialog, progress endpoint + dialog, help dialog,
  tutor menu, analysis persistence with its failing test first.
- Add Playwright assertions for each control (dialog opens, real data appears,
  click produces the expected view/state change) and a unit test for the
  progress endpoint and analysis rehydration/invalidation.
- Re-run `npm run verify`, the design detector, and `npm run benchmark:canvas`
  if any agent context changes; quote the four gate numbers at handoff.
- Keep all generated screenshots under `output/` or `.impeccable/` out of commits.

## Review pass

The usual builder-check subagent was replaced by an in-thread read of this
document at the partner's request to stop using subagents. Open items that
remain the partner's to decide: none — scope, depth, and the recognition fix
were all explicitly chosen.
