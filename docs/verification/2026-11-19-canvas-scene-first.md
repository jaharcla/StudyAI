# Verification: scene-first canvas tutoring

Date: 2026-11-19

## Verified in this change

| Check | Command | Result |
|---|---|---|
| TypeScript | `npx tsc -b` | clean |
| Scene serialization | `npx vitest run tests/canvas-scene-context.test.ts` | 3 passed |
| Bridge context | `npx vitest run tests/canvas-ai-bridge.test.ts` | 14 passed |
| Ink tool client | `npx vitest run tests/canvas-scene-tools.test.ts` | 4 passed |
| Ink merge + server read | `npx vitest run tests/canvas-scene-ink.test.ts tests/canvas-scene.test.ts` | 11 passed |
| OCR policy | `npx vitest run tests/canvas-analysis-producer.test.ts tests/canvas-intelligence.test.ts` | 34 passed |
| Tutor tool binding | `npx vitest run tests/tutor-integration.test.ts tests/tutor-presentation.test.ts` | 38 passed |
| Claim scorer | `npx vitest run tests/tutor-claims-score.test.ts` | 3 passed |
| Fixture dry run | `npx tsx scripts/benchmark-tutor-claims.ts --dry-run` | 20 questions, 7 boards |

## Not verified

- **Live A/B claim run.** The harness is committed, but the two arms were not executed in this change because they require the dev server and 40 tutor calls with provider budget. No claim-score, citation-rate, or latency numbers are claimed.
- **Full `npm run verify` exit.** Vitest reported 313/314 passing. `tests/learning.test.ts` timed out at 5000 ms under full-suite load and passed 4/4 when re-run alone; this is unrelated to canvas and is treated as a flaky timeout.
- **Playwright UI path.** Cancelled by the user before completion. Not a failure, and not evidence of passing. `npx playwright test --list` resolves 32 tests across 21 files.
- **Visual board rendering.** Not part of this change; the tutor remains text-only.
- **Handwriting accuracy.** The system reports ambiguity rather than guaranteeing transcription.

## Known limits

- OCR still depends on the configured provider chain; with image egress disabled and no local provider, the tool returns a warning and no text.
- The scene builder continues to run baseline recognition for structural evidence; OCR is the on-demand escalation.
- `read_canvas_ink` returns at most eight groups and four OCR items per group, with 2 KB per text item.
- The legacy analysis path and the on-demand path share evidence rules but not one node-creation function; both emit unconfirmed nodes with `recognizes` edges.
