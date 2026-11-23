# Plan: StudyAI Studio implementation

- [x] Establish baseline on branch `work/studyai-studio` (38b77bc): tsc clean; 451 pass / 1 pre-existing canvas-analysis-producer failure
- [x] Identify conflict: `main` holds a partial uncommitted copy of the new UI; full new UI + FSRS flashcards are committed on `work/learning-ui-newui`
- [x] Write design + ADR (FTS5 retained, xyflow reused, no provider change)
- [x] Carry over the one-line test fix from `main` (`initializeCanvasAnalysisStorage`) — baseline failure now passes
- [x] Server: schema + contracts + grounding + generation service + HTTP handler + api.ts wiring
- [x] Server unit tests: grounding bounds, provenance filter, artifact persistence, import into LearningService (19 pass)
- [x] Client: StudioSurface + MindMapView (xyflow) + StudyGuideView + PracticeView + CSS
- [x] Wire "Studio" into the immersive new UI in `src/App.tsx`
- [x] Playwright spec asserting rendered DOM for mind map, guide, practice import (1 passed)
- [x] Verify: `tsc` clean; vitest 458 pass / 0 fail; `npm run build` passes; targeted Playwright passed
- [x] Handoff: `docs/STUDIO_HANDOFF.md` records verified vs unverified; no commit (no authorization)
