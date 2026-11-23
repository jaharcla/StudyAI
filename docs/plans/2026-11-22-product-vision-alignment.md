# StudyAI — Product Vision and Identity Alignment Plan

> **Canonical Vision:** [docs/VISION.md](../VISION.md)  
> **Coordination Ground Truth:** [docs/next.md](../next.md) (`a74bcb8`)  
> **Engineering Invariants:** [AGENTS.md](../../AGENTS.md)  
> **Status:** Baselined against `a74bcb8`. Approved to execute starting with Phase 2 (Physics Solver & Scene Authority).

---

## 1. Shipped / Already Built (Do Not Rebuild)

- [x] **Mindmap scientific object kind** (`4b9eb75`, `6fadf78`): Model variant (`mindmap`), validation, registry tool, scene evidence (`summaryOf`), `SceneGlyph` rendering, browser spec `tests/e2e/canvas-mindmap.spec.ts`, fixture `tests/fixtures/mindmap-board.json`, ADR.
- [x] **Canvas Reliability Phase 5** (`7c29d78`, `fcbc3a1`, `d380c9c`): Spatial-grid recall, diagram `F/N` stacked fraction parsing (PhysAlign 1.000), `CANVAS_OCR_TIMEOUT_MS` cloud timeout.
- [x] **Tutor Retrieval Judgement** (`022b4ec`, ADR): Canvas regex veto removed, model relevance active, grounding benchmark harness in `scripts/benchmark-canvas-grounding.ts`.
- [x] **Learning UI + Studio Scaffold** (`5eb8922`, `5ab5abb`, `94820b3`): FSRS flashcards, question authoring, Studio surface (`server/studio/`, `src/studio/`), and credits/settings union.

---

## 2. Active Roadmap & Execution Sequence

```
Phase 2: Scientific Canvas Physics Mechanics & Interactive FBD (Pillar 3)   <-- CURRENT FOCUS
       │
       ▼
Phase 3: Deep Bidirectional Canvas-Tutor Scene Intelligence (Pillars 3 & 4)
       │  (Extends author_board with mandatory-citation & one-approval constraint)
       ▼
Phase 4: Closed-Loop Misconception Mastery (Pillars 2 & 4)
       │  (Canvas misconception tag -> LearningService BKT update)
       ▼
Phase 1: In-App BYOK Provider Settings (Pillar 1)
       │
       ▼
Phase 5: Digital Pen UX & Fluid Unified Workspace (Pillars 1, 2, 5)
```

---

## Phase 2: Scientific Canvas Physics Mechanics & Interactive FBD (Pillar 3)

**Goal:** Implement the vision's core scientific differentiator: free-body diagrams (FBD), inclined planes, force equilibrium, and physical law evaluation directly within the single scene authority (`server/canvas-intelligence/scene/`).

### Tasks:
- [x] **Task 2.1: Deterministic Physics Relationship Solver**
  - **Files:** `server/canvas-intelligence/scene/physics-rules.ts`, `server/canvas-intelligence/scene/build.ts`
  - **Description:** Implement a rule-based physics mechanics analyzer that evaluates:
    1. Inclined plane geometry: detect incline surface/angle $\theta$.
    2. Force perpendicularity check: verify normal force $\vec{N} \perp \vec{u}_{surface}$ within angular tolerance.
    3. Force parallelism check: verify friction $\vec{f} \parallel \vec{u}_{surface}$ opposing intended/actual motion.
    4. Force balance / Newton's 2nd Law: calculate $\sum \vec{F}_x$ and $\sum \vec{F}_y$ (or component decomposition $F_g = mg$, $N = mg\cos\theta$, $f_k \le \mu N$).
    5. Returns structured diagnostic claims (e.g. `{ valid: false, code: "normal_not_perpendicular", angleOffsetDeg: 35, expectedDeg: 90, surfaceId: "incline-1" }`).
  - **Tests:** `tests/canvas-physics-rules.test.ts` asserting exact rule evaluation on valid and invalid FBD fixtures. (5 passed)

- [x] **Task 2.2: Physics Scene Evidence Integration**
  - **Files:** `server/canvas-intelligence/scene/build.ts`, `server/canvas-intelligence/scene/service.ts`
  - **Description:** Wire the physics rule outputs into the scene graph build so `get_canvas_scene` and `search_canvas_evidence` include deterministic physics diagnostics alongside spatial relations, keeping a single interpretation authority.
  - **Verification:** Unit test asserting scene graph serialization contains physics rule diagnostics without altering `CanvasDocument` shape. (11 passed in `tests/canvas-scene.test.ts`)

- [x] **Task 2.3: Interactive Parametric Sliders on Physics Objects**
  - **Files:** `src/canvas/model.ts`, `src/canvas/SceneGlyph.tsx`, `src/canvas/ScientificLayer.tsx`, `src/canvas/CanvasStudio.tsx`
  - **Description:** Add interactive parameters (incline angle $\theta$, mass $m$, friction $\mu$) to physics composite objects that update connected vector lengths and readouts in real time while respecting `CanvasDocument.revision` on persist.
  - **Verification:** Playwright spec asserting parameter slider DOM updates and vector geometry recalculation. (1 passed in `tests/e2e/canvas-physics-fbd.spec.ts`)

---

## Phase 3: Deep Bidirectional Canvas-Tutor Scene Intelligence (Pillars 3 & 4)

**Goal:** Enable the Tutor to comprehend physics/math errors, propose visual annotations/corrections, and author coursework practice problems directly via `author_board`.

### Tasks:
- [ ] **Task 3.1: Physics Diagnostics in Tutor Prompt Context**
  - **Files:** `server/tutor-canvas-context.ts`, `server/tutor-presentation.ts`
  - **Description:** Format physics relationship diagnostics into human-readable, grounded context for the Tutor model so it explains errors (e.g. why normal force must be perpendicular) without hallucination.
  - **Verification:** `tests/tutor-canvas-context.test.ts` passing with physics diagnostic payloads.

- [ ] **Task 3.2: Tutor Visual Corrections & Ghost Proposals**
  - **Files:** `src/canvas/tutor.ts`, `src/canvas/ScientificLayer.tsx`
  - **Description:** Tutor proposes corrective objects (ghost vectors/labels) with an approval gate button that increments `revision` when applied.
  - **Verification:** Playwright test verifying proposal display and approval flow.

- [ ] **Task 3.3: Extend `author_board` for Coursework Practice on Canvas**
  - **Files:** `server/canvas-reasoning/service.ts`, `src/canvas/ai/canvas-actions.ts`
  - **Description:** Extend `author_board` compound-verb tool (respecting the concurrent design): mandatory citations to retrieved chunks, 1–8 validated questions, unverified label, answers hidden until student checks, single revision-checked approval transaction.
  - **Verification:** Unit & Playwright tests asserting citation presence, single approval gate, and hidden-answer reveal.

---

## Phase 4: Closed-Loop Misconception Mastery (Pillars 2 & 4)

**Goal:** Feed canvas errors directly into the student's Bayesian Knowledge Tracing (BKT) profile and spaced repetition queue.

### Tasks:
- [ ] **Task 4.1: Misconception-to-BKT Loop**
  - **Files:** `server/learning/service.ts`, `server/canvas-analysis/receiver.ts`
  - **Description:** When the physics solver or tutor identifies a verified conceptual error on canvas, map the error code to a learning concept ID and update the BKT mastery score via `LearningService`.
  - **Verification:** `tests/learning.test.ts` verifying mastery adjustment from canvas events.

---

## Phase 5: In-App BYOK & Fluid Multi-Modal Workspace (Pillars 1, 5)

**Goal:** User-facing BYOK settings modal and natural digital pen experience.

### Tasks:
- [ ] **Task 5.1: Unified In-App BYOK Provider Settings**
  - **Files:** `src/components/SettingsDialog.tsx`, `src/App.tsx`
  - **Description:** In-app key configuration for OpenAI, Anthropic, Gemini, Groq, DeepSeek, and Ollama.
  - **Verification:** Playwright spec for key persistence.

- [ ] **Task 5.2: Digital Pen Feel & Gestures**
  - **Files:** `src/canvas/CanvasStudio.tsx`
  - **Description:** Pressure sensitivity, smoothing, and scratch-to-erase gestures.
  - **Verification:** Playwright interaction spec.

---

## Verification Discipline & Baseline Invariants

1. Single mutation authority: `server/canvas-persistence`.
2. Single scene authority: `server/canvas-intelligence/scene/`.
3. Single direct-manipulation authority: `server/canvas-analysis/`.
4. Baseline: 543 unit tests passing, 43/45 browser tests passing (the two known citation flakes excluded).
5. Run `npx tsc -b && npx vitest run` at every step.
