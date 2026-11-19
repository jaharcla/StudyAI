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
| Full unit suite | `npx vitest run` | 318 passed (47 files) |
| Fixture dry run | `npx tsx scripts/benchmark-tutor-claims.ts --dry-run` | 20 questions, 7 boards |
| Context comparison | `npx tsx scripts/compare-canvas-contexts.ts --board <id>` | A/B/C written; energy board A=3144 B=2524 C=2707 bytes |

## Not verified

- **Live A/B claim run.** The harness is committed, but the two arms were not executed in this change because they require the dev server and 40 tutor calls with provider budget. No claim-score, citation-rate, or latency numbers are claimed.
- **Full `npm run verify` exit.** The unit suite passes 318/318; Playwright was cancelled by the user and was not re-run.
- **Playwright UI path.** Cancelled by the user before completion. Not a failure, and not evidence of passing. `npx playwright test --list` resolves 32 tests across 21 files.
- **Visual board rendering.** Not part of this change; the tutor remains text-only.
- **Handwriting accuracy.** The system reports ambiguity rather than guaranteeing transcription.

## Post-implementation user test

An energy-level board (levels n=4,3,2,1; arrows a/b/c) produced “no numerical values” answers. Root cause: the tutor context collapsed every arrow to `{kind:"arrow", direction:"down"}` and dropped the endpoints, so a, b, and c were indistinguishable and their level transitions were absent. Fixed generically: arrows and lines now expose `labels`, `startAttached`, `endAttached`, and `unattached`, where an attachment is a geometric target (`line` with its nearest label, `text`, `geo`, or scientific object) plus distance and confidence. No energy-level rule remains in the code or prompt. Verified against the saved Board 2: a attaches 4→2, b 2→1, c 4→3. The tutor is instructed to treat attachments as geometry, not meaning, and to ask one short question when a port is unattached or has alternatives.

## Known limits

- OCR still depends on the configured provider chain; with image egress disabled and no local provider, the tool returns a warning and no text.
- The scene builder continues to run baseline recognition for structural evidence; OCR is the on-demand escalation.
- `read_canvas_ink` returns at most eight groups and four OCR items per group, with 2 KB per text item.
- The legacy analysis path and the on-demand path share evidence rules but not one node-creation function; both emit unconfirmed nodes with `recognizes` edges.
- Clarifications are conversational for now. User-confirmed connection feedback and board notes are not persisted; add them only if repeated clarifications justify the store. The tutor may ask one short question when an attachment is missing or ambiguous.
