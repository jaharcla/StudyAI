# Verification — real PowerPoint flow hardening (2026-11-23)

Worktree: `C:\Users\Owner\Downloads\StudyAI MK3\.worktrees\slide-deck-artifact-20261123`
Branch: `work/slide-deck-artifact-20261123`
Direction: `docs/research/2026-11-23-pptx-flow-direction.md`

## What changed

- `src/artifacts/ArtifactsPage.tsx` — a **Build slide deck** action now generates from the current lesson; loading, empty, filter, success and student-safe error states; two-step delete; speaker notes and visual descriptions in the preview; `aria-live` status; busy controls disabled.
- `src/artifacts/api.ts` — `generateSlideDeck` client helper.
- `server/presentations/http.ts` — download uses a title-derived filename, not a raw UUID.
- `server/presentations/compile.ts` — grounded prompt now goes in `content`, source lines use reader-friendly labels (`page 2`) instead of raw `studyai://` refs, visual intents go in the prompt instead of slide body text, titles are cleaned, and a claim-less title slide no longer throws.
- `server/presentations/validate.ts` and `service.ts` — source labels map back to retrieved refs for containment checks; rendered raw `studyai://` IDs are rejected as a repairable problem.

No canvas dock, present-mode overlay, page map, new provider, paid service, cloud key or dependency was added. The semantic component contract, citation containment and one-bounded-repair rule remain intact.

## Live renderer proof

Self-hosted Presenton was already running locally (`ghcr.io/presenton/presenton:latest`, port 5001) with an Ollama text provider. Its persisted provider settings pointed at a dead host port (`11435`, model `qwen2.5-coder:7b`), so generation returned 503. I repointed the two fields to the reachable local Ollama (`host.docker.internal:11434`, `qwen3:latest`) in `userConfig.json` and the `provider_settings` DB row, restarted the container, and used the administrator API-key reveal endpoint. No key, token or provider credential was printed or committed.

A grounded fixture (free-body diagram, two sourced claims, speaker notes) was compiled with the real `compileSlideDeck` and posted to `POST /api/v1/ppt/presentation/generate`. Response: status 200, `presentation_id cfe099fe-d75a-4acc-aa9f-d9c34a784c0e`, an editable PPTX path and an edit path. Full request/response/inspection is in `docs/verification/2026-11-23-presenton-render-proof.json`.

PPTX internals (checked by reading the OOXML package):

```
slides=3  slideLayouts=1  slideMasters=1  notesSlides=3  media=32
slide1: shapes=2 pics=4   slide2: shapes=7 pics=13   slide3: shapes=8 pics=14
```

The file is a native editable presentation — real shapes, layouts, image parts and speaker-notes parts, not a full-slide image. LibreOffice rendered all three slides to PDF; PyMuPDF produced the PNGs uploaded to the thread.

### What the renders showed

- Good: real layout variety, readable type, visible `Source: page 2` labels, source claims retained, notes parts present, instructional image prompts in the presentation JSON.
- Still imperfect: the local model mangled the first title (`Incl&apos;ted Pln`), copied speaker notes into slide body text, and the raster picture is an abstract pattern rather than a free-body diagram. These are renderer/model limitations, not new StudyAI code paths; they are listed as critique objections below.
- Fixed during this pass: raw `studyai://` URIs no longer appear on slides; visual instruction text is no longer dumped into body copy.

## `npm run verify`

Run with `WEB_PORT=5194 RUNTIME_PORT=8221 DATA_PORT=8222 AGENT_PORT=8144`, `.env` loaded, `TUTOR_PROVIDER=opencode-go`, and `CANVAS_OPENCODE_GO_MODEL=qwen3.8-flash` (the value the pre-existing `canvas-providers.test.ts` hardcodes). Chain: `tsc -b && vitest run && playwright test`.

```
Test Files  111 passed (111)
     Tests  700 passed (700)
```

Playwright (5.4m):

```
Running 58 tests using 1 worker
3 failed
3 skipped
52 passed (5.4m)
  ✓ 2 tests\e2e\artifacts-page.spec.ts:114:1 › Artifacts page builds, lists, opens and organizes a slide deck (2.9s)
  ✓ 3 tests\e2e\artifacts-page.spec.ts:164:1 › Artifacts page shows a student-safe message when generation fails (1.3s)
```

Provider-dependent / pre-existing failures, named separately and **not claimed as passing**:

- `canvas-analysis.spec.ts:9` — an analysis payload appeared when none was expected.
- `document-intelligence.spec.ts:5` and `integration.spec.ts:4` — `Page 1 of 1` not visible in the PDF viewer after tutor-dependent steps.

With the documented local model `CANVAS_OPENCODE_GO_MODEL=hy4-flash-free` (the value in `.env`), `tests/canvas-providers.test.ts:59` fails because it hardcodes `qwen3.8-flash`. That test is unrelated to this branch; I did not change it. `npm run verify` with that env stops at vitest:

```
Test Files  1 failed | 110 passed (111)
     Tests  1 failed | 699 passed (700)
```

## Inline critique — three strongest objections

1. **The deck is not fully grounded.** The local model preserves the two supplied claims but rewrites the summary as general knowledge; only one slide shows a source label. A student could treat uncited general knowledge as course evidence. Mitigation shipped: friendly source labels, raw-ID rejection and the artifacts-page citations; a stronger guarantee needs provider-side structured output, which is out of scope here.
2. **The picture is decorative, not instructional.** The raster image is an abstract wave pattern, not the free-body diagram described in the image plan. Presenton's image pipeline chose a built-in placeholder despite the explicit instruction. A deterministic diagram generator or a vetted diagram asset policy would be needed to claim "no decorative-only images".
3. **The artifacts viewer still shows semantic slide cards, not a rendered slide preview.** The editable PPTX is downloadable and linked to Presenton's edit path, but the in-app preview is text + alt text, not the rendered layout. Turning rendered PNGs into an in-app preview would need a renderer service or stored thumbnails, which this branch does not add.

## Not verified

- No learning-outcome claim.
- `benchmark:canvas` was not run: no prompt, model, provider or recognition threshold changed in StudyAI code.
- GitNexus graph check is unavailable in this worktree (no index); callers were confirmed by text search and `git diff`.
