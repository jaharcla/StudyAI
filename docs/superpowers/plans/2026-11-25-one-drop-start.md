# One-drop start, progressive surfaces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a student drop course files once and land in a grounded Tutor interaction, with every later surface kept simple.

**Architecture:** Add a course-less intake surface that infers course and lesson names from filenames, creates both through the existing API, and uploads files through the existing `uploadOne` helper. On completion it selects the new course and lesson and opens the Tutor with one prepared, source-grounded question the student sends in one click. The rest of the app keeps its current state model; the top bar de-emphasises destinations that have no work yet.

**Tech Stack:** React/TypeScript, Vite, CopilotKit v2, existing document-intelligence API, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-25-one-drop-start-design.md`

## Global Constraints

- `DESIGN.md` at repo root is the UI source of truth; this is a cohesion pass, not a redesign.
- At least 99.9% of student-facing substance comes from student-provided material. Never invent citations, confidence numbers, answers or canvas targets.
- Local-first and BYOK. No new dependency, paid service, API key, subscription or `.env` change. No provider/model routing change.
- Every UI-visible change gets a Playwright DOM assertion and honest loading / empty / error / retry states. Never weaken a test.
- No subagents; native thread workers only. At most two workers plus the coordinator, one Playwright suite at a time, pause new work below 1 GB free RAM.
- One worktree and branch per worker; no merge before `tsc -b`, Vitest and targeted Playwright pass.
- Preserve the existing uninterrupted J1–J7 journey proof at `tests/e2e/journey-uninterrupted.spec.ts`.

## Review Focus

- **Empty drop:** no files chosen or dropped must leave no course, no lesson and an honest empty state — test in Task 2.
- **Bad input:** an unsupported extension or a file over 20 MB must show an inline error with retry and create no orphan course — test in Task 2.
- **Upload failure:** a failed document-service call must show an error, never a false "indexed" state — test in Task 2.
- **Unsupported question:** a question with no retrieved evidence must produce an explicit abstention, never an invented answer or citation — test in Task 3.
- **Interrupted intake:** navigating or reloading during indexing must not duplicate the course, leave a permanent loading state or create multiple lessons — tests in Tasks 3 and 4.

---

### Task 1: Filename-derived course context helper

**Files:**
- Create: `src/onboarding/context.ts`
- Test: `tests/onboarding-context.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `inferCourseContext(files: readonly File[]): { courseTitle: string; lessonTitle: string }`, deterministic from file names only.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { inferCourseContext } from "../src/onboarding/context.js";

const file = (name: string) => ({ name }) as File;

describe("inferCourseContext", () => {
  it("uses a shared KIN-style prefix as the course and the unit as the lesson", () => {
    expect(inferCourseContext([file("1.1 Right Triangles KIN 120.pdf"), file("1.2 Oblique Triangles KIN 120.pdf")]))
      .toEqual({ courseTitle: "KIN 120", lessonTitle: "Unit 1: Right Triangles" });
  });
  it("falls back to a single file title when there is no shared course token", () => {
    expect(inferCourseContext([file("Photosynthesis notes.pdf")]))
      .toEqual({ courseTitle: "Photosynthesis notes", lessonTitle: "Introduction" });
  });
  it("returns honest empty strings for an empty drop", () => {
    expect(inferCourseContext([])).toEqual({ courseTitle: "", lessonTitle: "" });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/onboarding-context.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `inferCourseContext`**

One pure function in `src/onboarding/context.ts`. Extract a shared trailing course token from file names, derive the lesson from the first file's leading unit/number, and fall back to the single file title. Return empty strings for no files. Do not call any model or network.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/onboarding-context.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/onboarding/context.ts tests/onboarding-context.test.ts
git commit -m "feat: infer course and lesson names from dropped files"
```

---

### Task 2: One-drop intake surface

**Files:**
- Create: `src/onboarding/OneDropSurface.tsx`
- Modify: `src/components/document-intelligence/api.ts` (re-export `uploadOne` unchanged if needed)
- Test: `tests/e2e/one-drop-intake.spec.ts`

**Interfaces:**
- Consumes: `inferCourseContext` from Task 1; `uploadOne`, `DOCUMENT_API`, `requestJson` from the document-intelligence API.
- Produces: `OneDropSurface({ onReady }: { onReady: (context: { courseId: string; lessonId: string; courseTitle: string; lessonTitle: string }) => void })`, plus `data-testid` values `one-drop-zone`, `one-drop-input`, `one-drop-progress`, `one-drop-error`, `one-drop-retry`, `one-drop-ready`.

- [ ] **Step 1: Write the failing Playwright test**

```ts
import { test, expect } from "@playwright/test";

test("one drop creates a course and lesson and reports progress", async ({ page }) => {
  await page.goto("/");
  const zone = page.getByTestId("one-drop-zone");
  await expect(zone).toBeVisible();
  await page.getByTestId("one-drop-input").setInputFiles({
    name: "1.1 Right Triangles KIN 120.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Right triangle trigonometry defines sine as opposite over hypotenuse."),
  });
  await expect(page.getByTestId("one-drop-progress")).toContainText(/index/i);
  await expect(page.getByTestId("one-drop-ready")).toBeVisible();
});
```

Add two more tests in the same spec: an unsupported `.exe` file shows `one-drop-error` and no `one-drop-ready`; a stub `POST /api/course-intake` failure shows `one-drop-error` and `one-drop-retry`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx playwright test tests/e2e/one-drop-intake.spec.ts --workers=1`
Expected: FAIL, `one-drop-zone` not found.

- [ ] **Step 3: Implement `OneDropSurface`**

Use the existing `HomeSurface` drop-zone markup and CSS as the pattern. Validate extension and 20 MB limit before any API call. Create the course then the lesson through the same endpoints `App.tsx` uses, then call `uploadOne` for each file. Track `idle | creating | uploading | indexing | ready | error` with visible progress and a retry that does not duplicate a course already created. Call `onReady` only after every file reports `indexed`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx playwright test tests/e2e/one-drop-intake.spec.ts --workers=1`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/onboarding/OneDropSurface.tsx src/components/document-intelligence/api.ts tests/e2e/one-drop-intake.spec.ts
git commit -m "feat: one-drop course and lesson intake"
```

---

### Task 3: Land in a grounded Tutor question

**Files:**
- Modify: `src/App.tsx`
- Create: `src/onboarding/PreparedQuestion.tsx`
- Test: `tests/e2e/one-drop-landing.spec.ts`

**Interfaces:**
- Consumes: `OneDropSurface.onReady` from Task 2; existing `coach.prompts`, `requestJson`, `CourseSummaryPoint`.
- Produces: `PreparedQuestion({ question, onSend }: { question: string; onSend: (text: string) => void })` with `data-testid="prepared-question"` and `prepared-question-send`; a `tutorQuestion` state in `App.tsx`.

- [ ] **Step 1: Write the failing Playwright test**

```ts
import { test, expect } from "@playwright/test";

test("intake lands in one grounded question the student sends", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("one-drop-input").setInputFiles({
    name: "1.1 Right Triangles KIN 120.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Right triangle trigonometry defines sine as opposite over hypotenuse."),
  });
  await expect(page.getByTestId("prepared-question")).toContainText("KIN 120");
  await page.getByTestId("prepared-question-send").click();
  await expect(page.getByTestId("tutor-provider-status")).toBeVisible();
});
```

Add a second test that stubs retrieval to return no passages and asserts an explicit abstention with no citation chip.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx playwright test tests/e2e/one-drop-landing.spec.ts --workers=1`
Expected: FAIL, `prepared-question` not found.

- [ ] **Step 3: Implement the landing**

In `App.tsx`, render `OneDropSurface` when there is no course with indexed sources. On `onReady`, select the new course and lesson, close intake, and set `tutorQuestion` from the first real source title and passage. Render `PreparedQuestion` in the tutor panel and open the tutor. Sending calls the installed CopilotKit v2 chat append method for the active session; do not auto-send. When no supported passage exists, render the honest abstention text and no send button.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx playwright test tests/e2e/one-drop-landing.spec.ts --workers=1`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/onboarding/PreparedQuestion.tsx tests/e2e/one-drop-landing.spec.ts
git commit -m "feat: land one-drop students in a grounded tutor question"
```

---

### Task 4: Progressive reveal of later surfaces

**Files:**
- Modify: `src/App.tsx`, `src/components/surface-chrome.css`
- Test: `tests/e2e/progressive-surfaces.spec.ts`

**Interfaces:**
- Consumes: existing `mode` state and top-bar buttons in `App.tsx`.
- Produces: `data-testid="surface-next"` on the one currently available next step; Study, Studio and Concepts carry `data-deemphasised="true"` until a reviewed answer, artifact or concept exists.

- [ ] **Step 1: Write the failing Playwright test**

```ts
import { test, expect } from "@playwright/test";

test("later surfaces are de-emphasised until there is work in them", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("surface-next")).toBeVisible();
  await expect(page.getByTestId("open-studio")).toHaveAttribute("data-deemphasised", "true");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx playwright test tests/e2e/progressive-surfaces.spec.ts --workers=1`
Expected: FAIL, `surface-next` not found.

- [ ] **Step 3: Implement progressive reveal**

Keep all four destinations mounted and clickable. Add `data-deemphasised` from existing signals (reviewed question count, artifact count, concept count) and one `surface-next` chip that points at the first destination with real work. Follow `DESIGN.md` section 3.2; do not remove navigation.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx playwright test tests/e2e/progressive-surfaces.spec.ts --workers=1`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/components/surface-chrome.css tests/e2e/progressive-surfaces.spec.ts
git commit -m "feat: reveal later study surfaces progressively"
```

---

### Task 5: Full regression gate

**Files:** none beyond verification notes in `docs/verification/2026-11-25-one-drop-start.md`.

- [ ] **Step 1: Run targeted suites**

Run: `npx playwright test tests/e2e/one-drop-intake.spec.ts tests/e2e/one-drop-landing.spec.ts tests/e2e/progressive-surfaces.spec.ts --workers=1`
Expected: all pass.

- [ ] **Step 2: Run the full gate**

Run: `npm run verify`
Expected: exit 0, `tsc -b` clean, Vitest and Playwright pass with only the two known pre-existing flaky specs.

- [ ] **Step 3: Run the uninterrupted journey**

Run: `npx playwright test tests/e2e/journey-uninterrupted.spec.ts --workers=1`
Expected: pass with 13 ordered screenshots.

- [ ] **Step 4: Record and commit the verdict**

Write the exact commands, outputs and remaining gaps to `docs/verification/2026-11-25-one-drop-start.md` and commit with the Discord link.
