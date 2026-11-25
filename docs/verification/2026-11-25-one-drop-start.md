# One-drop start — verification verdict (2026-11-25)

Branch: `work/one-drop-start-20261125`.
Commits: `e9b734c` (context helper), `d3f70d2` (intake), `8082251` (grounded landing), `34927ec` (progressive surfaces), `30c1049` (top-bar regression fix).

Environment: this worktree's `.env` uses the default ports `WEB_PORT=5183`, `RUNTIME_PORT=8210`, `DATA_PORT=8211`, `AGENT_PORT=8133`. Task 4's local runs used isolated `WEB_PORT=5195`, `RUNTIME_PORT=8330`, `DATA_PORT=8331`, `AGENT_PORT=8253` because other sessions held 5193/8310/8311/8233.

## Targeted suites (Task 5, step 1)

Command:

```bash
npx playwright test tests/e2e/one-drop-intake.spec.ts tests/e2e/one-drop-landing.spec.ts tests/e2e/progressive-surfaces.spec.ts --workers=1
```

Output: `Running 8 tests using 1 worker`, `8 passed (27.5s)`. All three one-drop specs passed.

## Full gate (Task 5, step 2)

First run command:

```bash
npm run verify
```

First run: `VERIFY_EXIT=1`. `tsc -b` clean; Vitest 146 files / 918 tests passed; Playwright `147 passed`, `2 failed`, `4 flaky`, `6 skipped` in `19.0m`.

- **Failure caused by this change:** `app-cohesion.spec.ts:259` "top bar has four destinations and Cards lives inside Study" — `.immersive-actions button` had 5 buttons because the `surface-next` chip was placed inside the four-destination group. Fixed in `30c1049` by moving the chip outside that group; targeted rerun of that test plus both progressive-surface tests: `3 passed (34.1s)`, `tsc -b` exit 0.
- **Transient failure:** `canvas-analysis.spec.ts:192` timed out waiting for a provider response on all three attempts. It passed in the final full gate without a code change.

Final run command:

```bash
npm run verify
```

Final run: `VERIFY_FINAL_EXIT=0`.

- `tsc -b`: no errors.
- Vitest (`npm test`): `Test Files 146 passed (146)`, `Tests 918 passed (918)`, duration `35.74s`.
- Playwright: `151 passed`, `2 flaky` (both passed on retry), `6 skipped`, duration `14.8m`. Flaky specs: `canvas-physics-fbd.spec.ts:9` (slider drag timing) and `canvas-visual-remediation.spec.ts:321` (seed board read during setup).
- The one-drop and app-cohesion destinations tests are in the passing set.

## Uninterrupted journey (Task 5, step 3)

Command:

```bash
npx playwright test tests/e2e/journey-uninterrupted.spec.ts --workers=1
```

Output: `Running 1 test using 1 worker`, `1 passed (3.6m)`, `JOURNEY_EXIT=0`. Test timeout was the configured `1_200_000` ms; wall time `3.2m`.

All 13 ordered screenshots were produced under `test-results/journey-uninterrupted-*`:

`journey-01-j1-home.png`, `journey-02-j1-continue.png`, `journey-03-j2-citation.png`, `journey-04-j2-refusal.png`, `journey-05-j3-studio.png`, `journey-06-j5-questions.png`, `journey-07-j5-graded.png`, `journey-08-j5-provider-down.png`, `journey-09-j4-canvas.png`, `journey-10-j6-today-strip.png`, `journey-11-j6-today.png`, `journey-12-j7-dark.png`, `journey-13-j7-phone.png`.

## Remaining gaps

- Two pre-existing flaky Playwright specs still need retries; the full gate passes because Playwright retries them. No change was made to those specs.
- The design spec asks for a measured first-drop-to-first-answer time in the real browser; this plan's Task 5 does not include that measurement, so it is not reported here. No estimate is substituted for it.
- The journey uses the configured free model and the single injected practice-progress 503. A paid provider was not exercised in this gate.
