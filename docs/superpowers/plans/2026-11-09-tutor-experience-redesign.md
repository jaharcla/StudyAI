# Tutor Experience Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Make Tutor replies concise and natural, use course sources only when relevant, and keep internal canvas/retrieval details out of normal answers.

**Architecture:** Keep the current Groq, LangGraph, CopilotKit, retrieval, and canvas-tool paths. Add deterministic retrieval intent, a typed answer-and-citations presentation result, and a semantic canvas projection for ordinary questions while preserving raw metadata for requested edits/debugging.

**Tech Stack:** TypeScript, LangGraph, Zod, React, CopilotKit 1.85.0, Vitest, Playwright. No dependency changes.

**Spec:** `docs/decisions/ADR-2026-11-09-tutor-response-presentation.md`; user-provided Tutor Experience & Response Architecture Redesign brief.

## Global Constraints

- Keep Groq as the active provider and preserve configured call, token, queue, and cost bounds.
- Preserve course scoping, navigable citations, canvas proposal approval, scientific tools, activities, and conversation context.
- Exact-output requests must return only the requested string; greetings and canvas descriptions must not trigger course retrieval.
- Keep raw canvas IDs, coordinates, retrieval scores, and diagnostics available in developer tooling.
- Preserve existing user data, mainline integration, and all other worktrees.

## Review Focus

- Exact-output instruction with available course documents: must not retrieve, cite, or add text.
- Canvas label/arrow context with nearby shapes: must describe observations without IDs or coordinates and state uncertainty for unsupported meaning.
- Explicit canvas edit or metadata request: must retain exact identifiers and existing approval flow.
- Academic follow-up with source grounding: must retrieve only within the active course and expose only validated citations used by the answer.
- Missing/stale canvas evidence or malformed model citation: must not invent an interpretation or expose raw tool output.

---

### Task 1: Retrieval intent and typed student response

**Files:** Create `server/tutor-retrieval-policy.ts`, `server/tutor-presentation.ts`; modify `server/agent.ts`; test `tests/tutor-retrieval-policy.test.ts` and `tests/tutor-integration.test.ts`.

**Interfaces:** `server/tutor-retrieval-policy.ts` exports `shouldRetrieveCourseDocuments(query: string): boolean` and `requestsCanvasMetadata(query: string): boolean`. `server/tutor-presentation.ts` exports `TutorStudentResponse` (`answer: string`, validated `citations` array), `presentTutorResponse(answer, candidates): TutorStudentResponse`, and `renderTutorResponse(response): string`.

- [x] Add tests for greeting, exact-output, canvas-description, casual chat, and source-grounded academic queries.
- [x] Add tests for canonical, invented, and unused citations.
- [x] Run `npm test -- --maxWorkers=1 tests/tutor-retrieval-policy.test.ts tests/tutor-integration.test.ts`; expected: new tests fail because the policy and typed presenter do not exist yet.
- [x] Implement the policy before initial retrieval/tool registration; remove candidate-source and context-diagnostic appendices; keep prompt rules concise and direct.
- [x] Run the focused command again; expected: all policy and integration tests pass.

### Task 2: Semantic canvas projection

**Files:** Modify `server/tutor-presentation.ts` and `server/agent.ts`; test `tests/tutor-presentation.test.ts` and `tests/tutor-integration.test.ts`.

**Interfaces:** Consumes `requestsCanvasMetadata(query)` from Task 1. Exports `projectTutorContexts(contexts, includeRawCanvasMetadata): ContextItem[]`; ordinary contexts contain semantic observations without internal IDs, coordinates, bounds, or source references.

- [x] Test an arrow and nearby `50 m` label, unsupported interpretations, freehand uncertainty, and explicit metadata requests.
- [x] Run `npm test -- --maxWorkers=1 tests/tutor-presentation.test.ts tests/tutor-integration.test.ts`; expected: new projection tests fail before implementation.
- [x] Project context for ordinary requests while preserving full raw context for edit/metadata requests; keep observed evidence distinct from uncertain interpretations.
- [x] Run the focused command again; expected: all projection and Tutor integration tests pass.

### Task 3: Conversational UI and rendered regressions

**Files:** Modify `src/App.tsx`, `src/overrides.css`; test a focused file under `tests/e2e/`.

- [x] Remove the redundant “Search course sources” block and use student-facing welcome copy tied to the lesson/canvas.
- [x] Group tool work for progressive disclosure, keep actionable canvas proposals visible, and expose the existing inspector only in development.
- [x] Style the existing message view and citations for readable width, typography, and clear speaker separation.
- [x] Preserve responsive canvas/document coexistence and actionable canvas proposals.
- [x] Add rendered browser checks for exact output, greeting, canvas description, relevant citation navigation, and proposal visibility.
- [x] Run targeted Playwright specs; expected: new assertions pass against the rendered app.

### Task 4: Full verification

**Files:** No additional changes unless a regression is found.

- [x] Run `npm test -- --maxWorkers=1`.
- [x] Run `npm run build`.
- [x] Run focused Playwright flows with synthetic test data; use at most a small bounded Groq smoke set when the configured key is available.
- [x] Review `git diff` and confirm no unrelated worktree, database, or user file was changed.
