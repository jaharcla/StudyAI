# Lewis canvas tools — visual and interaction brief

Owner's words, verbatim (2026-11-23):

> Last time I checked it looked horrendous and it didn't function nicely at all. I want functionality to look nice you know, like I was trying to have my agent yesterday have the some of the buttons go around the atom when you click on it in a nice maybe semi animated way and then have the Lewis diagram side bar pop out to the side of the main side bar when you click its button and just a bunch of stuff I asked it and it stupendously failed.

## What must be true when this is done

1. **Radial atom actions** appear around a clicked atom as a deliberate, semi-animated arc — not a cramped SVG cluster. Actions are readable at a glance, have generous hit targets, clear labels or drawn icons, and a smooth restrained entrance/exit (~150–300 ms, decelerating ease). They must not sit under the atom, under the sidebar, or off-canvas.
2. **Lewis sidebar** slides out from the side of the main canvas sidebar when the Lewis button is clicked, with a clear relationship to the main sidebar rather than floating as an orphan panel. It closes cleanly, reopens reliably, and never covers the radial actions or the atom being edited.
3. **Functionality is the point.** Select atom, choose bond order, place atoms, connect atoms, inspect, and finish all work in a predictable sequence. No panel closing unexpectedly between actions, no dead buttons, no stale selection, no confusing states.
4. **Visual quality is an acceptance criterion**, not a nice-to-have. Contrast ≥4.5:1 for body text; real depth with offset and soft blur; tight internal spacing with clear grouping; one authored moment of motion; hover, disabled, focus and empty states; keyboard reachable with visible focus rings; reduced-motion fallback.
5. **Do not accept "tests pass" as evidence.** Capture real browser screenshots of the sidebar closed, sidebar open, radial actions open, and a completed CO2-style structure. Upload them with `kimaki upload-to-discord` in your thread so the owner can see them. Iterate on what the screenshots actually show.

## Reuse and constraints

- Work only in this worktree. Copy `CPK_INTELLIGENCE_API_KEY` and other local env values from `C:\Users\Owner\Downloads\StudyAI MK3\.env` without printing them; use a unique port quad (WEB_PORT=5331, RUNTIME_PORT=8271, DATA_PORT=8272, AGENT_PORT=8191, LANGGRAPH_DEPLOYMENT_URL=http://127.0.0.1:8191).
- Relevant files: `src/canvas/LewisSidebar.tsx`, `src/canvas/RadialAtomActions.tsx`, `src/canvas/MoleculeInteraction.tsx`, `src/canvas/ScientificLayer.tsx`, `src/canvas/lewis-bonds.ts`, `src/overrides.css`, `tests/e2e/lewis-sidebar.spec.ts`, `tests/e2e/radial-atom-actions.spec.ts`, `tests/e2e/direct-molecule.spec.ts`.
- Keep the existing molecule data model, validation, formal-charge logic and approval path intact. This is a UI and interaction change, not a chemistry rewrite.
- No new dependency without a demonstrated gap. No `@ts-ignore`, `as any`, or weakened assertions. UI behaviour needs Playwright DOM assertions plus the visual checks above.
- Quote `npm run verify` output. No commits, no paid services.
- Native execution only: no subagents of any kind, no Groq-hosted models.

## Definition of done

- Screenshots uploaded showing the four states above, at the shipped desktop size.
- A short written account of what changed in the interaction and what the screenshots prove.
- Playwright assertions for open/close, radial selection, bond order, and keyboard access; `tsc` and `npm run verify` output quoted, with any pre-existing failures named separately.
