# Design: StudyAI product demo video (new UI, capabilities-forward)

Date: 2026-11-22
Status: proposed — awaiting approval before planning/production

## Intent and why

The existing demo (`artifacts/product-demo/`, `VIDEO.md`, ADR `2026-11-21`) was recorded against the **old UI/UX** and showed only a thin slice of what StudyAI does: sketch → vector → force → Tutor → flashcard. The owner asked for a new demo on the **current** UI that shows substantially more capability, with explicit permission to take creative liberties.

This is an **outreach** asset for prospective students and educators: click-to-play 16:9 master plus a 9:16 feed recut, sound-off-first, captions carrying the message. The "one workflow" rule of the demo-walkthrough format is honoured by choosing one job that *naturally* crosses many capabilities: **turn one messy study topic into a checked, connected study pack**. That is still one story with one result, not a feature tour.

## Goals

- Show the **current** app, captured live from the running build — no simulated or rebuilt UI.
- Demonstrate at least seven distinct capabilities with real, observed results: canvas sketch/object recognition, vectors/forces with units, verified math steps, linked graphs, Tutor grounded in board objects, document intelligence with citations, and generated flashcards/activities.
- Add a constructed layer the old cut could not have: **raea-rendered 3D science-object interludes and chapter cards**, giving the film visual range without faking product behaviour.
- Deliver a 16:9 master, a 9:16 recut, an updated `VIDEO.md`, and a QA summary, all reproducible from committed capture/finish scripts.
- Record a short ADR covering the raea-vs-GenMotion tool decision before production.

## Non-goals

- Not a feature tour of every `ScientificObject` kind, and not a launch/ad film.
- Not a claim that the 3D interludes are app UI — they are explicitly visual metaphors.
- No synthetic voiceover, music, or noise bed. No synthesized "air" or room tone.
- raea stays an authoring tool in a sandbox; it is never a StudyAI dependency and no raea binary is committed.

## Anti-goals (what would make this a failure even if it rendered)

- Any fabricated UI, invented metric, or course data invented by an agent.
- Illegible UI — any label the viewer must read under 24 px tall at 1080p.
- A dead wait/spinner on screen, or a cut that ends before the Tutor answer completes.
- A cut that looks like the old demo (old UI, narrow capability set, no constructed motion).

## Constraints

- **Product truth (ADR 2026-11-21):** every visible claim must come from an observed UI result in the running app. Creative liberty applies to *form* (3D metaphor, motion, chapter cards), never to invented behaviour. The 3D interludes illustrate concepts (a vector becoming components, nodes connecting); they never show a screen the app does not have.
- **raea** v0.1.8, pinned, Windows x86_64, FSL-1.1-ALv2 (source-available, non-competing use; converts to Apache-2.0 two years after release). Sandboxed outside the repo; only rendered MP4s/PNGs are used. Spike measured 15.8 ms/frame for 2D and 272 ms/frame for a lit 3D scene on this machine — keep each constructed beat ≤ 4 seconds.
- **App must be running** at `127.0.0.1:5183` (currently down). The capture uses real course data from Waterloo Learn; keep it inside the captured viewport and out of logs, plans, and any open-world tool.
- **Sound-off-first:** captions ≥ 40 px at 1080p carry the story. No VO in v1. If a sound-on variant is cut later, add only click SFX on press frames — never a synthesized bed.
- **One rendering/direction authority:** update the existing `VIDEO.md`; do not create a second direction file or a parallel capture pipeline.
- **Generated outputs** (`artifacts/`, raea render scratch) are never committed; only the direction, scripts, ADR, and QA summary are.
- Verification follows the existing finish/QA path (`finish_video.py`, `probe_video.py`, contact sheet), plus a browser-level assertion that the captured UI is the current build.

## Approaches considered

| | Approach | Trade-off | Verdict |
|---|---|---|---|
| **A** | raea 3D interludes + chapter cards, Playwright capture of real UI, existing finishing skill for composite | Only route that adds true 3D geometry and keeps every capability claim on observed UI. Cost: pinned canary-era tool, slow 3D frames, new compositing step. Spike proved it works on this Windows box. | **Picked** |
| B | GenMotion constructed scenes instead of raea | Faster (3 frames in ~3 s) and template-polished, but 2D/2.5D streaks rather than real geometry; forked scene needs re-skinning; ADR records 5 production advisories (1 critical) in its MCP chain. | Fallback for title cards only |
| C | Real capture only, as before | Zero new tool risk, but reproduces exactly the limitation the owner asked to fix: no constructed motion, narrow visual range. | Rejected |
| D | Fully synthetic raea "product film" | Maximum visual liberty, but zero product proof — a concept piece, not a demo. Breaks the product-truth rule. | Rejected |

Spike evidence: raea 0.1.8 rendered a valid 2D 90-frame H.264 in ~1.4 s and a lit 3D scene in ~52 s/90 frames; its automatic contact check caught a floor-clipping error and its exposure meter caught a −6-stop frame. GenMotion forked and captured a tuned scene in ~3 s.

## The how (calls made here, correctable by the owner)

- **Length / format:** 90 s at 30 fps (2700 frames), 16:9 master 1920×1080, 9:16 recut 1080×1920 with the full UI and captions kept inside the platform-safe area.
- **Style:** soft-light app stage for captured UI (app-native palette sampled from the live build); dark accent interludes for raea 3D, using the same accent. Focus pushes 24–48f, pull-backs 45–52f, no two camera moves at once.
- **Captions:** ≥40 px at 1080p, burned in finishing; chapter cards 45–75f; persistent progress label `n / 3 · <chapter>`, updated at each turn.
- **Sound:** no audio track in v1; captions and on-screen step lines carry structure.

### Beats

| # | Frames | Job | Source | Capability shown |
|---|---|---|---|---|
| 1 | 0–240 | Orientation: a rough stroke resolves into connected science objects; title "From sketch to study pack" | raea 3D | (metaphor only) |
| 2 | 240–480 | Current UI: open a course Canvas, enter a 2D-vector problem | capture | sketch → object recognition |
| 3 | 480–690 | Vector resolves into components + units | raea 3D | (metaphor for recognition) |
| 4 | 690–990 | Force object, verified equation steps, graph linked from the result | capture | verification + graph |
| 5 | 990–1200 | Concept nodes light up and connect | raea 3D | (metaphor for relationships) |
| 6 | 1200–1500 | Tutor answer grounded in the board objects | capture | Tutor |
| 7 | 1500–1800 | Link a document; citations and a linked-document object appear | capture | document intelligence + citations |
| 8 | 1800–2070 | Flashcards and an activity generated from the same work | capture | flashcards + activities |
| 9 | 2070–2430 | Result: finished board held with concept links and study pack; chapter card | mixed | the produced study pack |
| 10 | 2430–2700 | Next step: "Open your course → Canvas" | capture | specific in-app destination |

Beat 6 must wait for the Tutor stream to finish (no "Working", no `streamdown:incomplete-link`, stable text length) before the capture stops — the previous demo had to be re-recorded for ending on "Working 10s".

## Deliverables

- `VIDEO.md` — replaced with this new direction and its production result (single authority).
- `docs/decisions/ADR-2026-11-22-raea-constructed-demo.md` — tool decision, pinned v0.1.8, FSL terms, sandbox limits, alternatives.
- Committed capture/finish scripts under the existing `artifacts/product-demo/` tooling path.
- `artifacts/product-demo/studyai-demo-16x9.mp4`, `studyai-demo-9x16.mp4`, `qa-summary.md`, contact sheet.
- raea compositions kept as source alongside the scripts so the constructed beats are reproducible.

## Builder-check resolutions

A fresh builder read this document cold and raised ten questions. Resolutions below are either already answered by the project, settled here as my call (the owner delegated creative liberties), or genuinely left to the builder.

| # | Question | Resolution |
|---|---|---|
| 1 | Exact course topic and concrete objects per beat | **My call:** keep KIN 120 "2D Vectors" (Waterloo Learn) as the spine — real data is already verified in the previous cut — and broaden *within that course*: vectors/forces, a linked note/document, Tutor, flashcard. Correctable by the owner. |
| 2 | DOM actions, selectors, wait conditions | **Left to builder:** derive from the running app; one DOM assertion per beat that the expected result actually appeared. |
| 3 | 3D geometry / style per interlude | **My call:** reuse the spike's `scene3d.tsx` pattern (sphere, torus, vector bar, floor, key/fill/rim) for beats 1, 3, 5; beat 9 is a held end composition. ≤ 4 s each; dark accent sampled from the live UI. Metaphor only, never a fake screen. |
| 4 | Exact caption text and styling | **My call:** "From sketch to study pack" / "Sketch → recognised objects" / "Components + units, checked" / "Every step verified" / "Ideas connected" / "Tutor reads your board" / "Cited, linked, findable" / "Practice, generated from your work" / "One board. A whole study pack." / "Open your course → Canvas". ≥ 40 px at 1080p, ≥ 5:1 contrast. |
| 5 | Is the app up, and is auth needed? | **Answered by project:** currently down. `npm run dev` (`scripts/dev.ts`) starts the full stack; web is `127.0.0.1:5183` with `strictPort: true` (`vite.config.ts`, `server/config.ts`). No login gate in `src/App.tsx` — only a credit-token bearer for API calls. |
| 6 | Click SFX files and levels | **Answered by design:** no audio in v1, therefore no SFX. A later sound-on cut adds click SFX on press frames only; no synthesized bed. |
| 7 | Progress label format and position | **My call:** top-left inside the 5% safe zone, 28 px caps at +0.14em, ≥ 5:1 contrast, word-slot flip 10–14f. Chapters: `1 / 3 · Capture`, `2 / 3 · Connect`, `3 / 3 · Study pack`. |
| 8 | Brand colour values | **Answered by project:** no brand kit is available (old `VIDEO.md` limitation). Sample the accent from the live UI at capture time; do not invent a hue. |
| 9 | raea source directory and naming | **My call:** commit compositions under `demo-video/raea/NN-name.tsx` — **outside** `scripts/`, because `tsconfig.json` includes `scripts` and `import from "raea"` would break `npm run verify`. Rendered media and captures stay in gitignored `artifacts/`; the external skill's capture/finish scripts stay pinned, with the repo holding the shot plan, raea sources, and a thin wrapper. |
| 10 | Bitrate / size / delivery limits | **My call:** keep the existing finish defaults — H.264 CRF ~18 with faststart; no stated platform cap, target ≤ 10 MB for the 16:9 master (previous was 3.1 MB). |

## What is left to the builder (planning stage)

1. Start the app, verify the **current** UI at 127.0.0.1:5183, and choose one real course topic plus the exact objects/results to capture for beats 2, 4, 6, 7, 8.
2. Write a shot list mapping each beat to a DOM action and a frame range; add assertions that each captured result actually appeared.
3. Write and render the three raea interludes and chapter cards at 1920×1080; inspect one frame per beat before compositing.
4. Capture the live UI with Playwright; composite with the existing finishing skill; burn captions; export both formats.
5. Run `probe_video.py`, build the contact sheet, and check no held wait exceeds 20f and every step label clears 24 px.
6. Write the ADR and update `VIDEO.md` with measured output and limitations.
