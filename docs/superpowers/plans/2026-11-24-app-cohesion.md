# App Cohesion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the shipped surfaces read and navigate as one app under the current scheme.

**Architecture:** Add one shared surface chrome component for headers and notices, then replace per-surface duplicates in Studio, Artifacts, StudyStage and ConceptGraph. Route all "study" entries through one surface, add cross-links between Studio and Artifacts and a return path from the workspace to the study session. A single browser spec pins the seams.

**Tech Stack:** React 19, TypeScript, existing CSS scheme, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-24-app-cohesion-design.md`

## Global Constraints

- Direction-agnostic: work under `immersive-real.css`; no new theme, no `DESIGN.md`, no provider or paid changes.
- No new dependency, no new authoring authority, no change to grounding or Copilot logic.
- Every visual change needs a Playwright DOM assertion in `tests/e2e/app-cohesion.spec.ts`.
- Preserve existing class names and test ids used by current specs: `studio-back`, `studio-close`, `studio-notice`, `stage-back`, `artifacts-head`, `artifacts-status`, `open-concept-graph`.
- No `@ts-ignore`, no `as any`, no weakened assertions. Commit with the Discord link from the project instructions.
- E2E command for every focused step: load `.env` into the shell, set `WEB_PORT=5601`, `RUNTIME_PORT=8611`, `DATA_PORT=8612`, `AGENT_PORT=8511`, `LANGGRAPH_DEPLOYMENT_URL=http://127.0.0.1:8511`, `TUTOR_PROVIDER=opencode-go`, `CANVAS_OPENCODE_GO_MODEL=hy4-flash-free`, then run `node node_modules/@playwright/test/cli.js test tests/e2e/app-cohesion.spec.ts --retries=0 --reporter=line` from the repo root.

## Review Focus

- Course or lesson change while a surface is open: no stale title, focus or cached context; test in Task 4.
- No course or lesson selected: every surface entry is disabled and no surface can be opened by clicking; test in Task 4.
- Citation from Studio, Artifacts or ConceptGraph: closes that surface and lands in Lecture on the cited source; test in Task 4.
- Dark theme: shared chrome uses the same readable palette as the active scheme; test in Task 4.
- Escape and Back: close returns focus and the study session can be re-entered from the workspace; test in Task 4.

---

### Task 1: Shared surface chrome

**Files:**
- Create: `src/components/SurfaceChrome.tsx`, `src/components/surface-chrome.css`
- Modify: `src/studio/StudioSurface.tsx`, `src/artifacts/ArtifactsPage.tsx`, `src/lab/StudyStage.tsx`, `src/studio/ConceptGraphView.tsx`

**Interfaces:**
- Consumes: existing `close` and `onOpenSource` props in each surface.
- Produces: `SurfaceHeader({ eyebrow, title, subtitle?, backLabel?, onBack?, onClose, closeLabel, backClassName?, closeClassName?, className? })`, `SurfaceNotice({ tone: "info" | "success" | "error" | "loading", text, testId, className? })`.

- [ ] **Step 1: Write the failing browser test for shared chrome**

Add a test to `tests/e2e/app-cohesion.spec.ts` that opens Studio, Artifacts, ConceptGraph and StudyStage in turn and asserts each has one `.surface-header` with an eyebrow, title, a back control and a close control with an accessible name, and one `.surface-notice` with `role="status"` when a notice is visible. Run it and confirm it fails because the components do not exist.

- [ ] **Step 2: Create `SurfaceChrome.tsx` and `surface-chrome.css`**

Implement the two signatures above. The header renders eyebrow, title, optional subtitle, optional back button and a close button. `backClassName` and `closeClassName` are appended so legacy selectors keep working. The notice renders `role="status"`, `aria-live="polite"`, `data-testid={testId}` and a tone class. CSS defines local tokens with active-scheme values and `.dark` overrides for 4.5:1 text.

- [ ] **Step 3: Replace per-surface headers and notices**

In StudioSurface, ArtifactsPage, StudyStage and ConceptGraphView, render `SurfaceHeader` in place of their current header markup, passing `backClassName="studio-back"` / `"stage-back"` where those exist and `closeClassName="studio-close"` where it exists. Render `SurfaceNotice` in place of `.studio-notice` and `.artifacts-status`, keeping their existing test ids and tone classes.

- [ ] **Step 4: Run the focused test and typecheck**

Run: `node node_modules/typescript/bin/tsc -b` and the new spec with the project's e2e command. Expected: no type errors; the shared-chrome test passes; existing studio, artifacts and shell-context specs still pass.

- [ ] **Step 5: Commit**

`git add src/components/SurfaceChrome.tsx src/components/surface-chrome.css src/studio/StudioSurface.tsx src/artifacts/ArtifactsPage.tsx src/lab/StudyStage.tsx src/studio/ConceptGraphView.tsx tests/e2e/app-cohesion.spec.ts` and commit with the Discord link.

### Task 2: One study entry

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `prepareCoachTarget` from the existing Coach wiring.
- Produces: one study entry through `setMode("study")`; no `studyOpen` state.

- [ ] **Step 1: Write the failing browser test**

In `tests/e2e/app-cohesion.spec.ts`, assert the topbar `Study` button and the lesson-header `Study this lesson` button both open the same `study-stage` dialog, and that the dialog's lesson title matches the active lesson. Run it and confirm the lesson-header path fails.

- [ ] **Step 2: Route both entries to StudyStage**

In `src/App.tsx`, remove the `studyOpen` state, its Escape branch, its render branch, and change the lesson-header button to `setMode("study")`. Keep `StudyPanel` imported for `StudyStage`.

- [ ] **Step 3: Run the focused test and typecheck**

Run the new spec and `tsc -b`. Expected: both entries open `.study-stage`; no type errors.

- [ ] **Step 4: Commit**

Commit `src/App.tsx` and `tests/e2e/app-cohesion.spec.ts` with the Discord link.

### Task 3: Cross-links and return paths

**Files:**
- Modify: `src/App.tsx`, `src/studio/StudioSurface.tsx`, `src/artifacts/ArtifactsPage.tsx`

**Interfaces:**
- Consumes: `setMode` in App, `close` in both surfaces.
- Produces: `StudioSurface.onOpenDecks: () => void`, `ArtifactsPage.onOpenStudio: () => void`, and a workspace chip `Back to study session` shown when `studyReturn` is true.

- [ ] **Step 1: Write the failing browser tests**

In `tests/e2e/app-cohesion.spec.ts`, assert `studio-open-decks` opens the artifacts dialog and `artifacts-open-studio` opens Studio; assert that after `StudyStage` sends the student to Activities, the workspace shows a `Back to study session` chip that reopens the same study dialog. Confirm the assertions fail first.

- [ ] **Step 2: Add the cross-links**

Add `onOpenDecks` to StudioSurface props and a secondary header button with `data-testid="studio-open-decks"` that calls it. Add `onOpenStudio` to ArtifactsPage props and a secondary header button with `data-testid="artifacts-open-studio"` that calls it. In App.tsx pass `setMode("artifacts")` and `setMode("studio")` respectively.

- [ ] **Step 3: Add the study return path**

In `src/App.tsx`, add `studyReturn` state. Set it when StudyStage opens Activities or Sources. Render a `Back to study session` chip in the workspace toolbar while it is true; the chip clears it and sets `mode` to `study`. Clear it on course or lesson change.

- [ ] **Step 4: Normalise provenance labels**

In `src/studio/MindMapView.tsx`, `src/studio/StudyGuideView.tsx`, `src/studio/InfographicView.tsx`, `src/artifacts/ArtifactsPage.tsx` and `src/studio/ConceptGraphView.tsx`, apply the shared `surface-provenance` class from `src/components/surface-chrome.css` to the existing citation chip and generated-label elements. Do not change their text or links.

- [ ] **Step 5: Run the focused tests**

Run the new spec plus `tests/e2e/study-stage-modes.spec.ts`. Expected: cross-links and return chip work; provenance chips share one class; mode buttons still open their surfaces.

- [ ] **Step 6: Commit**

Commit `src/App.tsx`, `src/studio/StudioSurface.tsx`, `src/artifacts/ArtifactsPage.tsx`, the four provenance files, `src/components/surface-chrome.css` and the spec with the Discord link.

### Task 4: Full browser gate and critique

**Files:**
- Modify: `tests/e2e/app-cohesion.spec.ts`
- Create: `docs/verification/2026-11-24-app-cohesion.md`

**Interfaces:**
- Consumes: all three tasks' surfaces and test ids.
- Produces: the final verification record and critique URLs.

- [ ] **Step 1: Add the Review Focus tests**

Add five tests to `app-cohesion.spec.ts`: course/lesson change closes stale surfaces; disabled entries with no lesson; citation from each of Studio, Artifacts and ConceptGraph lands in Lecture on the cited source; light and dark chrome both clear 4.5:1; Escape and the return chip restore the study session.

- [ ] **Step 2: Run the full suite**

Run `npm run verify`. Quote pass, fail, flaky and skipped counts. Name any provider-dependent failures separately. Do not weaken assertions or skip specs to make the run green.

- [ ] **Step 3: Capture screenshots and critique**

Capture light and dark screenshots of all four surfaces, upload them in the worker thread, and generate one critique URL per commit with `bunx critique --commit <hash> --web "<title>"`. Record the counts and the three strongest objections in `docs/verification/2026-11-24-app-cohesion.md`.

- [ ] **Step 4: Commit**

Commit the spec and verification record with the Discord link.
