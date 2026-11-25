# Course Evidence Contract Implementation Plan

> **Implementation note (2026-11-25):** executed natively task by task in this session; no subagents. Three plan details were corrected during execution: commit links use the coordinating thread `https://discord.com/channels/1574451017817399346/1574451617007271966`, the browser selector is `copilot-chat-textarea` (not `tutor-input`), and `studentResponse` is typed as `TutorStudentResponse` so the contract can be attached on the exact-output branch. Four existing `tutor-integration` assertions were updated to include the deterministic notice, not weakened. `npm run verify` finished exit 0: `tsc -b` clean, Vitest 139 files / 876 tests, Playwright 138 passed and 6 skipped.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the course evidence boundary persistent and visible: every tutor answer states how many course sources were checked, and says plainly when course evidence was absent or dropped.

**Architecture:** Freeze the retrieved source refs for one tutor turn into a `TutorEvidenceContract` on the server. Attach it to the rendered answer so the existing chat renderer shows a short notice. No prompt, model, provider, canvas, or retrieval-path change; no new data store.

**Tech Stack:** TypeScript, LangChain `AIMessage`, Vitest, Playwright.

**Spec:** `docs/research/2026-11-24-gap-fill-options.md` (Option A), `docs/decisions/ADR-2026-11-24-course-grounding-rule.md`.

## Global Constraints

- At least 99.9% of the student experience must trace to that student's retrieved course material; generated claims must stay labelled.
- Local-first, BYOK. No hosted dependency for core study data.
- Deterministic tools (Math.js, KaTeX, `formalCharge`, `vectorMagnitude`, physics diagnostics) remain authoritative; the model proposes, never computes.
- Never use `@ts-ignore`, `@ts-nocheck`, `as any`, or `as never` to make code compile.
- UI-visible changes need a Playwright test asserting the actual DOM result.
- Do not report "done" without `npm run verify` and its output quoted.
- This plan does not change a canvas prompt, provider, or recognition threshold; `benchmark:canvas` is not owed.
- Commit messages end with `Discord: https://discord.com/channels/1574451017817399346/1574934131928993925`.

## Review Focus

- Course-specific question with zero matching excerpts: must show `No course evidence · Not in your course material` and no confident course claim — pinned by Task 3's second e2e test.
- Evidence dropped by the context budget (`server/tutor-context.ts:122`): must show the dropped notice, not a silent unlimited answer — pinned by Task 1's `dropped` test.
- Exact-output instruction (`reply exactly …`): must not gain a notice — pinned by Task 1's `shouldAttachEvidenceContract` exact-output test and Task 2's guard.
- Greeting with no course retrieval: must not gain a grounding notice — pinned by Task 1's greeting test.
- Retrieval invoked by the model during the turn (`server/agent.ts:440-443`): its refs must join the frozen set — pinned by Task 1's ref-count test and Task 2's use of `candidateByRef.keys()`.

---

### Task 1: Course evidence contract module

**Files:**
- Create: `server/tutor-evidence-contract.ts`
- Test: `tests/tutor-evidence-contract.test.ts`

**Interfaces:**
- Consumes: `RetrievalResult` from `server/document-intelligence/service.ts:20-22`.
- Produces:
  - `type TutorEvidenceStatus = "grounded" | "no-evidence" | "dropped"`
  - `type TutorEvidenceContract = { version: 1; status: TutorEvidenceStatus; sourceRefs: string[]; sourceCount: number; courseId: string | null }`
  - `buildTutorEvidenceContract(input: { evidence: RetrievalResult | null; dropped: boolean; sourceRefs: Iterable<string> }): TutorEvidenceContract`
  - `groundingNotice(contract: TutorEvidenceContract): string | null`
  - `shouldAttachEvidenceContract(exactOutput: boolean, greeting: boolean, retrievalRequested: boolean, refCount: number): boolean`

- [ ] **Step 1: Write failing tests for the three statuses, ref hygiene, and attachment guard**

```ts
import { describe, expect, it } from "vitest";
import { buildTutorEvidenceContract, groundingNotice, shouldAttachEvidenceContract } from "../server/tutor-evidence-contract.js";

const evidence = {
  status: "evidence" as const,
  message: "Candidate excerpts found; verify each excerpt before using it as an answer.",
  courseId: "course-1",
  results: [],
};

describe("buildTutorEvidenceContract", () => {
  it("freezes sorted unique refs from the retrieved set", () => {
    const contract = buildTutorEvidenceContract({ evidence, dropped: false, sourceRefs: ["b", "a", "b"] });
    expect(contract).toEqual({ version: 1, status: "grounded", sourceRefs: ["a", "b"], sourceCount: 2, courseId: "course-1" });
  });
  it("reports no evidence when retrieval found nothing", () => {
    const contract = buildTutorEvidenceContract({ evidence: null, dropped: false, sourceRefs: [] });
    expect(contract.status).toBe("no-evidence");
    expect(contract.sourceCount).toBe(0);
  });
  it("reports dropped evidence even when a prefetch existed", () => {
    const contract = buildTutorEvidenceContract({ evidence, dropped: true, sourceRefs: ["a"] });
    expect(contract.status).toBe("dropped");
  });
});

describe("groundingNotice", () => {
  it("gives exact notices", () => {
    expect(groundingNotice({ version: 1, status: "grounded", sourceRefs: ["a", "b"], sourceCount: 2, courseId: "c" })).toBe("Course evidence · 2 sources checked");
    expect(groundingNotice({ version: 1, status: "no-evidence", sourceRefs: [], sourceCount: 0, courseId: "c" })).toBe("No course evidence · Not in your course material");
    expect(groundingNotice({ version: 1, status: "dropped", sourceRefs: [], sourceCount: 0, courseId: "c" })).toBe("No course evidence · Course excerpts were dropped to fit context. Ask again to retry.");
  });
});

describe("shouldAttachEvidenceContract", () => {
  it("omits notices for exact output and greetings", () => {
    expect(shouldAttachEvidenceContract(true, false, true, 3)).toBe(false);
    expect(shouldAttachEvidenceContract(false, true, false, 0)).toBe(false);
  });
  it("attaches when prefetched or tool-retrieved refs exist", () => {
    expect(shouldAttachEvidenceContract(false, false, true, 0)).toBe(true);
    expect(shouldAttachEvidenceContract(false, false, false, 1)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to see it fail**

Run: `npx vitest run tests/tutor-evidence-contract.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `server/tutor-evidence-contract.ts`**

`dropped` wins over `evidence.status`; otherwise `evidence?.status === "evidence" ? "grounded" : "no-evidence"`. Deduplicate and sort `sourceRefs`; `sourceCount = sourceRefs.length`; `courseId = evidence?.courseId ?? null`. `groundingNotice` returns the three exact strings above, never a string for an unknown status. `shouldAttachEvidenceContract` returns `false` when `exactOutput` or `greeting`, otherwise `retrievalRequested || refCount > 0`.

- [ ] **Step 4: Run the test to see it pass**

Run: `npx vitest run tests/tutor-evidence-contract.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/tutor-evidence-contract.ts tests/tutor-evidence-contract.test.ts
git commit -m "feat: add course evidence contract for tutor turns

Discord: https://discord.com/channels/1574451017817399346/1574934131928993925"
```

### Task 2: Attach the contract to the rendered tutor answer

**Files:**
- Modify: `server/tutor-presentation.ts:13` (`TutorStudentResponse`), `server/tutor-presentation.ts:160` (`renderTutorResponse`)
- Modify: `server/agent.ts:484-519`
- Modify: `server/tutor-retrieval-policy.ts:101` (export `greetingOnly`)
- Test: `tests/tutor-presentation.test.ts`

**Interfaces:**
- Consumes: `TutorEvidenceContract`, `groundingNotice` from Task 1.
- Produces: `TutorStudentResponse.evidence?: TutorEvidenceContract`; `renderTutorResponse(response)` returns the notice on its own first paragraph followed by a blank line when `response.evidence` is set.

- [ ] **Step 1: Write failing tests in `tests/tutor-presentation.test.ts`**

```ts
it("renders the grounding notice before the answer", () => {
  const out = renderTutorResponse({
    answer: "The slope is $0.9$.",
    citations: [],
    rejectedCitationCount: 0,
    evidence: { version: 1, status: "grounded", sourceRefs: ["a", "b"], sourceCount: 2, courseId: "c" },
  });
  expect(out.startsWith("Course evidence · 2 sources checked\n\n")).toBe(true);
  expect(out).toContain("The slope is $0.9$.");
});

it("does not render a notice when the contract is absent", () => {
  const out = renderTutorResponse({ answer: "Hello.", citations: [], rejectedCitationCount: 0 });
  expect(out).toBe("Hello.");
});
```

- [ ] **Step 2: Run the test to see it fail**

Run: `npx vitest run tests/tutor-presentation.test.ts`
Expected: FAIL, `evidence` is not part of `TutorStudentResponse` and no notice is rendered.

- [ ] **Step 3: Add the field and notice rendering**

Add `evidence?: TutorEvidenceContract` to `server/tutor-presentation.ts:13`. In `renderTutorResponse` (line 160), compute `const notice = response.evidence ? groundingNotice(response.evidence) : null;` and return `notice ? `${notice}\n\n${rendered}` : rendered` where `rendered` is the existing function body. Do not alter math sanitisation or citation rendering.

- [ ] **Step 4: Wire the contract in `server/agent.ts`**

After `studentResponse` is built at line 491 and before the metadata at line 502, set the contract through the guard from Task 1. Use `isExactOutputRequest(query)` and `greetingOnly(query)` (export `greetingOnly` from `server/tutor-retrieval-policy.ts:101` in this task):

```ts
if (shouldAttachEvidenceContract(isExactOutputRequest(query), greetingOnly(query), retrievalRequested, candidateByRef.size)) {
  studentResponse.evidence = buildTutorEvidenceContract({
    evidence,
    dropped: Boolean(budgeted.courseEvidenceDropped),
    sourceRefs: candidateByRef.keys(),
  });
}
```

Add `evidence: studentResponse.evidence ?? null` under `responseMetadata.studyai.retrieval` at line 505-510. Do not change the system prompt or any tool description.

- [ ] **Step 5: Run the tests to see them pass**

Run: `npx vitest run tests/tutor-presentation.test.ts tests/tutor-integration.test.ts`
Expected: PASS; no existing citation or exact-output assertion changes.

- [ ] **Step 6: Commit**

```bash
git add server/tutor-presentation.ts server/agent.ts server/tutor-retrieval-policy.ts tests/tutor-presentation.test.ts
git commit -m "feat: show course evidence status in tutor answers

Discord: https://discord.com/channels/1574451017817399346/1574934131928993925"
```

### Task 3: Browser-level proof at the student surface

**Files:**
- Create: `tests/e2e/tutor-grounding-notice.spec.ts`

**Interfaces:**
- Consumes: the rendered notice from Task 2, plus the existing tutor chat setup in `tests/e2e/tutor-experience.spec.ts` and document import helper in `tests/e2e/document-intelligence.spec.ts`.
- Produces: two Playwright tests asserting DOM text inside `.copilot-assistant-message-content`.

- [ ] **Step 1: Write the failing e2e tests**

```ts
test("tutor answer shows the checked source count", async ({ page }) => {
  // reuse tutor-experience.spec.ts setup: create course, import one fixture document, open tutor
  await page.getByTestId("tutor-input").fill("According to my course notes, what is the slope?");
  await page.getByTestId("tutor-input").press("Enter");
  await expect(page.locator(".copilot-assistant-message-content")).toContainText("Course evidence ·");
});

test("tutor answer says when the course has no evidence", async ({ page }) => {
  // same setup
  await page.getByTestId("tutor-input").fill("qzxv synthetic nonmatching phrase about quantumzeptol");
  await page.getByTestId("tutor-input").press("Enter");
  await expect(page.locator(".copilot-assistant-message-content")).toContainText("No course evidence · Not in your course material");
});
```

Use the exact selectors already used by `tests/e2e/tutor-experience.spec.ts` if `tutor-input` differs; do not invent a new testid without adding it in the same task.

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx playwright test tests/e2e/tutor-grounding-notice.spec.ts`
Expected: FAIL, notice absent.

- [ ] **Step 3: Confirm they pass with the Task 2 change**

Run: `npx playwright test tests/e2e/tutor-grounding-notice.spec.ts`
Expected: PASS, two tests.

- [ ] **Step 4: Run full verification and commit**

Run: `npm run verify`
Expected: `tsc -b`, `vitest run`, and `playwright test` all complete without failures. Quote the output in the handoff.

```bash
git add tests/e2e/tutor-grounding-notice.spec.ts
git commit -m "test: assert course evidence notice in tutor DOM

Discord: https://discord.com/channels/1574451017817399346/1574934131928993925"
```
