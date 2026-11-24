# Bring Artifacts into the app's light colorway

## What the user reported
"why is the artifact page a full other colourway" — the Artifacts modal is dark navy while Studio, Study, Canvas and the rest of the app are light cream.

## Cause
`src/artifacts/artifacts.css` hardcodes dark values: overlay `rgba(8,12,24,.72)`, surface `#151a2b`, surface-2 `#1d2340`, border `#2b3350`, text `#eef1f8 muted #c2c9dd`, link `#8ab4ff`. Compare `src/studio/studio.css` and the shared chrome for the light `immersive-real` scheme already on main.

## Goal
Make the Artifacts modal read as part of the same light app: same surface/background, borders, text, muted text, buttons, focus rings and slide cards as the other surfaces. Keep contrast and focus-visible accessibility. This is cohesion under the current scheme, **not** a new visual direction: no `DESIGN.md`, no theme choice, no new palette invention.

## Boundaries
- Work only in this worktree; commit to `work/artifacts-light-theme-20261124` with the Discord link. Do not push or merge to main.
- Do not change artifact generation logic, providers, grounding or data flow. CSS/component styling only, plus a browser assertion if you add one.
- No subagents of any kind, including reviewer subagents. No Groq models. No paid services.

## Verification
- Targeted artifacts/cohesion e2e specs, `tsc -b`, Vitest. Capture before/after screenshots and upload them to your thread in order.
- Quote `npm run verify`, name provider-dependent failures separately, one critique URL per commit, three strongest objections inline.
