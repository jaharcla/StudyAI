# Verification — Tutor depth (2026-11-24)

Branch: `work/tutor-depth-20261124` (base `d066d90`). Dev server on 5707/8723/8724/8617 with `TUTOR_PROVIDER=opencode-go`, `CANVAS_OPENCODE_GO_MODEL=hy4-flash-free`.

## What changed

1. `619e5a8` — a Tutor/Studio citation click now fetches the exact chunk from `/api/document-intelligence/source`, shows it in a highlighted "Cited passage" block, and highlights it in the page text. A missing or stale chunk gets a plain "no longer available" message. [Critique](https://critique.work/v/9fcf11e8676f194835c2f917e711ee21)
2. `5450f27` — a canvas citation click (`science:`/`quickdraw:`) switches to Canvas, selects the referenced object by its human name, highlights it and pans to it with a 200 ms animated camera move. Deleted/stale refs report "no longer on this board" instead of a dead link. [Critique](https://critique.work/v/be8a183b486dfd97833abf011ae912df)
3. This commit — `make_library_artifact` front-end tool: chat requests to "quiz me", "make cards" or "make slides" generate a real, course-grounded artifact in the shared Library. Rate limits and provider failures return an honest message and leave course material unchanged. Coach stays folded into Tutor; no second dock.

## Verification

- `npx tsc -b`: exit 0.
- `npx vitest run tests/canvas-citation.test.ts tests/tutor-presentation.test.ts tests/canvas-tutor.test.ts tests/tutor-retrieval-policy.test.ts`: 4 files, 45 tests passed.
- `npm run benchmark:canvas` (with root `.env` loaded): exit 0 — 0 hard failures, 4/6 math exact, F1 0.951, PhysAlign structure coverage 0.75. The first run without `.env` failed on provider credits (OpenRouter exhausted, math OCR partial); that was an environment failure, not a code regression.
- Targeted Playwright, all 6 passed (`--retries=0`): `citation-highlight.spec.ts` 2/2, `tutor-canvas-citation.spec.ts` 2/2, `tutor-library-artifact.spec.ts` 2/2.
- Ordered screenshots: `test-results/shots/tutor-citation-highlight.png`, `tutor-canvas-citation-focus.png`, `tutor-library-quiz.png`.

## Three strongest objections

1. The canvas-citation e2e injects the exact link markup the Tutor emits instead of waiting for a free-tier model to emit it; the parsing and rendering path is exercised, but the model's decision to cite a board object is not end-to-end measured.
2. The library-artifact e2e drives a dev-only handler seam with intercepted generation responses. It proves the app lands a real artifact and reports failure honestly, but not that the live model reliably picks the tool for every phrasing.
3. Streaming is CopilotKit's own chat stream; no new "grounding" progress indicator was added. "Visible progress" today is streamed answer text, not an explicit status step.

## Not verified

- Live "quiz me / make cards / make slides" phrasing against the Hy4 model (tool routing is unit-tested, not model-evaluated).
- Full `npm run verify`: left to the coordinator after merge to avoid overlapping with the other worker's Playwright run.
