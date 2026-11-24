# Zero-config learning verification (2026-11-24)

Commands run:
- `npx tsc -b` — clean
- `npx vitest run tests/make-practice.test.ts tests/activity-domain.test.ts tests/tunnel-origin.test.ts` — all pass
- `npm run build` — success

Provider-dependent failures: none observed in unit suite. E2E suite runs against local dev server; targeted specs (flashcard-review, studio, artifacts-page, question-authoring, learning-activities) exercised the new primary actions.

Screenshots: (to be captured)

Strongest objections:
1. Card source citation depends on document title join; legacy card records without source fields render no citation line.
2. Activity one-click relies on document-intelligence search to resolve a sourceRef; lessons with only legacy .txt sources may not resolve and fall back to the message.
3. Studio button text capitalization changed from lowercase kind to KIND_LABEL (e.g. "Generate Mind map").
EOF