# Verification — slide deck artifacts (2026-11-23)

Worktree: `C:\Users\Owner\.local\share\opencode\worktree\e35993\slide-deck-artifact`
Spec: `docs/superpowers/specs/2026-11-23-slide-deck-artifact-design.md`
Plan: `docs/superpowers/plans/2026-11-23-slide-deck-artifact.md`

## Commands and exact output

### `npx tsc -b`
No output; exit 0. (After installing the declared `hosted/` dependencies; `stripe` was missing in the fresh worktree.)

### `npx vitest run`
```
 Test Files  107 passed (107)
      Tests  680 passed (680)
```

### `npm run verify` (WEB_PORT=5194, RUNTIME_PORT=8221, DATA_PORT=8222, AGENT_PORT=8144)
The command ran `tsc -b && vitest run && playwright test`. Playwright result:
```
  8 failed
  ... tests\e2e\tutor-math.spec.ts ... (and 7 other tutor-dependent specs)
  3 skipped
  46 passed (17.9m)
```
Exit code 1. The full output is in the background shell log `sh_209dcbc7100163UtdWKR8xKtlt` under the OpenCode shell directory.

The new spec passed in that same run:
```
ARTIFACTS: ok=True status=passed   (tests/e2e/artifacts-page.spec.ts)
```

The eight failures were all in pre-existing tutor-dependent specs:
- `canvas-analysis.spec.ts` — canvas analysis payload present when none expected
- `canvas-author-board.spec.ts` — `Cannot read properties of undefined (reading 'id')`
- `direct-vector.spec.ts` — tutor reply did not contain expected vector value
- `document-intelligence.spec.ts` — cited fact text not visible after tutor reply
- `integration.spec.ts` — citation link not visible after tutor reply
- `quickdraw-ai.spec.ts` — QuickDraw AI proposal region not visible
- `tutor-experience.spec.ts` — tutor reply text mismatch
- `tutor-math.spec.ts` — KaTeX renderer not visible after tutor reply

Each failure is an absent or unexpected **tutor response**. This change does not touch `server/agent.ts`, the Tutor graph, prompts, provider selection, canvas analysis, or document intelligence. No live tutor provider was configured in this worktree environment, so these are treated as **environmental / not measured**, not as regressions from the slide-deck work. They are **not claimed as passing**.

### `npm run benchmark:canvas`
Not run. No prompt, model, provider, recognition threshold, or benchmark baseline was changed by this work. Presenton's LLM/image settings are a self-hosted service configuration behind `SlideDeckRenderer`, not a Tutor provider change (ADR `docs/decisions/2026-11-23-slide-deck-reuse.md`). The four canvas gate numbers are therefore unchanged.

### Graph change check
GitNexus has no index registered for this worktree (the shared index is 101 commits behind and cannot resolve the edited symbols). Per the UNKNOWN rule in root `CLAUDE.md`, callers were confirmed by text search before edits and `git diff --stat` was reviewed before each commit. `gitnexus detect_changes` could not be run here; this is a limitation of the environment, not a clean graph result.

## What was verified

- TypeScript build: clean.
- Unit/integration suite: 107 files, 680 tests, all passing — including the new `slide_deck` contract, template manifest, compiler, renderer, validator/repair, service, and HTTP route tests.
- Website artifacts page: Playwright spec passed with DOM assertions for list, collection filter, slide cards, citation navigation, download link, rename, and delete.
- Editable PPTX path: the renderer returns a native Presenton deck path; no image-only export path was introduced.

## Free-model smoke test (OpenCode models)

Stateless generation via `POST /api/experimental/generate/text`, then each reply was parsed with the real `artifactComponentSchema`, compiled with `compileSlideDeck`, and checked with `validateDeckText`:

| Model | Schema | Slides | Template | Citation validation |
|---|---|---|---|---|
| `opencode-go/hy4-flash-free` | pass | 2 | general | pass |
| `opencode-go/beam-free` | pass | 2 | general | pass |

This test found a real bug: `validateDeckText` compared the raw bullet line (`- claim`) against the retrieved excerpt and reported a false citation failure. Fixed by stripping the markdown bullet marker before containment checking; test `slide-deck-validate.test.ts` now passes 8/8 and both models re-tested green. The harness is at `.superpowers/sdd/2026-11-23-slide-deck-artifact/model-smoke.ts` (scratch, gitignored). This does **not** exercise Presenton rendering — it tests the model-facing semantic contract and validation only.

## What was not verified

- Live generation against a running Presenton instance (no self-hosted service or API key in this environment); renderer was tested with an injected fake `fetch`.
- Real rendered-slide visual QA (no LibreOffice/PPTX rendering step in this change); the website viewer renders semantic slide cards.
- The eight tutor-dependent e2e specs above (absent tutor responses in this environment).
- `benchmark:canvas` gates and any learning-outcome claim for generated decks.
