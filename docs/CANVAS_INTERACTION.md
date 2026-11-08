# Direct scientific manipulation

Baseline: `9b7d0568f35f73d736d97d49993209201734dcfa`. Worktree/branch: `canvas-direct-manipulation` / `work/canvas-direct-manipulation`. The verified integration and both original worktrees are preserved.

## Milestone A — vectors and forces

Commit: `20d42a4e5f07eba4d9b980dfcc837d2025bb9cd0`.

- Tool activation creates no object. Dragging on the canvas previews an arrow; release commits one undoable object. Endpoint handles change components; dragging the shaft translates it while preserving components.
- Double-click or Inspect opens the existing property editor. Inspector and CopilotKit patches update the same object and its displayed geometry.
- SVG geometry is projected through Quickdraw `pageToScreen`/camera and pointer input uses `screenToPage`. Native Quickdraw pan, zoom, tools, and records remain in use. SVG wheel input calls the same public camera methods and uses Quickdraw's zoom rate.
- New arrows are uncalibrated: one world-coordinate unit corresponds to one component coordinate unit. `vx = (tip.x-tail.x)*s`, `vy = (tail.y-tip.y)*s`, with `s=1` in canvas units until supplied by the user. Screen/world Y points downward; positive component Y points upward. No force unit is assigned automatically.
- Supplying units per canvas unit calibrates x/y components while retaining endpoints. Numeric component edits retain the tail and scale and change the tip. Z contributes to the numerical magnitude but the drawing projects only x/y.
- Legacy vectors/forces keep their IDs, units and components. Their former card position becomes the tail, and display geometry uses 24 world-coordinate units per stored component for a readable initial layout; this is a compatibility display mapping, not a physical measurement.
- A force stores its point of application at the tail; moving its tail or body updates that point.
- Canvas JSON stays version 1 with optional geometry fields. SQLite/API schema is unchanged.
- One canvas history orders scientific edits and native gesture snapshots. Existing Quickdraw gesture batches continue to produce native strokes; application undo/redo restores complete snapshots and scientific objects together.

Verified: TypeScript and build passed; 44 unit tests passed; 7 production Chromium tests passed (49.4 seconds), including the original PDF/tutor/Lewis-card integration flow and the new vector/force pointer test. The palette accessible-name issue and an obsolete test board-menu toggle were corrected. A cold PDF.js import exceeded its original 5-second unit timeout under load; that extraction test now allows 15 seconds. Physical calibration has unit coverage; the browser test covers uncalibrated drawing and numeric editing.

## Milestone B — Lewis construction

- Lewis mode starts empty. Clicks place atoms at world coordinates; placement and selected-element controls are separate. Connect mode supports click/click or dragging between atoms, with a live bond preview. Single, double, triple and aromatic bond orders use the existing model; double-click cycles single/double/triple.
- Atom dragging preserves attached bond IDs and topology. The molecule label or Move molecule mode translates the whole structure. Lone-pair controls update existing electron counts and formal-charge calculations. The detailed inspector retains resonance editing and OpenChemLib conversion.
- Atom positions are optional relative world coordinates. Legacy molecules receive a readable linear layout without changing atom/bond/form IDs. JSON version and SQLite schema are unchanged.
- Pointer changes commit once on release. Selection, cancellation, camera projection, history, numeric edits and tutor proposals share the same scientific objects.

Verification: TypeScript/build and 46 unit tests passed. All 10 production Chromium cases passed (1.8 minutes). Browser coverage builds CO2 by pointer, checks OpenChemLib, changes elements/bond orders/lone pairs, checks charges, moves an atom with persistent bonds, and saves/reloads. Additional tests cover force calibration and real tutor vector edits. Commit: `ecc14cdbc0c4a2ad8c529e4d3f98bb7a06f2af55`.

## Milestone C — measurements, connections and remaining tools

Implemented:

- All scientific/learning palette tools activate placement modes. Clicks place equations, plots, anatomy labels, concepts, source links, questions and flashcards at the pointer. Line tools preview on drag. Inspectors open only explicitly. Existing source-note/document actions remain available.
- Measurement endpoints are draggable and may reference scientific objects, molecule child atoms or native Quickdraw shapes. New distances use canvas units until calibrated. Numeric Value sets the calibration against the current endpoints; subsequent target motion recalculates the distance.
- Relationships draw as arrows and retain source/target IDs. Endpoints record normalized page-bound positions or exact molecule atom IDs. Deleting a target detaches its endpoint at its last position; connection lines cannot target other connection lines, preventing attachment cycles.
- A force/vector with only its tail attached follows its target by translation, retaining components. Two attached endpoints follow their targets and recompute components. Dragging a shaft detaches it and preserves components; retargeting an endpoint establishes a new attachment. Numeric/tutor component edits release an attached tip and retain its anchored tail.
- Every scientific object has one persisted data object and one rendering. Shared SVG ordering supplies scientific hit order and Front/Back controls. Native Quickdraw remains the base drawing plane, with its own native shape ordering; arbitrary interleaving across the two planes is not provided. Native tools bypass scientific hit targets; Select chooses the topmost scientific hit or a native drawing through empty space.
- Native pointer gestures and non-pointer store edits participate in application history. Scientific previews, numeric changes, native changes and tutor edits resolve references through the same scene before saving. JSON version 1 and SQLite/API schemas are unchanged. Legacy geometry, molecule layouts, measurements, relationships and square-expression notation have compatibility readers.
- Math.js 15.2.0's lazy numeric module parses/evaluates equations and samples graph expressions. Numeric variables, arithmetic and a bounded list of standard functions are supported. Assignments, property access, arrays, executable functions and oversized expressions are rejected. Nonfinite/invalid results clear stale results/plots and show errors. Graphs support pointer tracing, moving and corner resizing; equations display evaluated results beside the expression.
- Anatomy remains an editable identifier/label, without a new anatomical viewer. PNG export retains the existing native Quickdraw export; complete scientific data is exported through canvas JSON.

Verified: `npm run build` passes TypeScript and production bundling (35.80 seconds). All 52 unit tests pass across 13 files. All 13 production Chromium tests pass, including real pointer gestures, camera pan/zoom, both vector endpoints, numeric/tutor synchronization, native drawing undo, force calibration/anchors, Lewis construction/charges/OpenChemLib, measurements/connections, math evaluation, plot tracing/resizing, remaining placement/stacking, persistence and course/lesson/board isolation. The complete PDF import → index → real tutor citation → real tutor Lewis edit → save → reload flow passes, including source-note/document actions. The real tutor uses local `qwen3:latest`; tutor responses are not mocked. Machine-readable cases, durations and bundle data are in [canvas-interaction-verification.json](canvas-interaction-verification.json).

## Failure record

| Failure | Resolution |
| --- | --- |
| A: cold PDF.js import exceeded 5 seconds under load | Extraction test allows 15 seconds; subsequent full unit runs pass. |
| A: palette icon polluted accessible button names | Decorative icons are hidden from accessibility names. |
| A: old new-board test reopened a menu closed by the new UI | Removed its obsolete extra toggle. |
| B: sandboxed browser run could not start local services | Reran with the required local-server/browser access; all 10 production cases passed. |
| C: first development navigation exceeded 30 seconds during cold Vite optimization | Scene cases allow 120 seconds; warm targeted run passed in 23.8 seconds. |
| C: equation label selector matched both drawing and input | Scoped it to the textbox role. |
| C: TypeScript caught a removed formal-charge import still used by the legacy atom inspector | Restored that import; subsequent compilation passes. |
| C: production regression found duplicate native history on pointer release, so one undo left the last stroke; a microtask still ran before Quickdraw's native pointer-up listener | Keep the native gesture active through its pointer-up store event; finalize history in the next task. The original vector/native-undo browser case verifies the fix. |
| C: adapted note-link fixture clicked below the canvas at the smaller integration viewport | Place the note using fractions of the actual visible canvas bounds. |

Existing dependency audit findings remain 45 advisories (6 low, 10 moderate, 25 high, 4 critical). Unrelated dependency migrations were not applied.

## Bundle measurements

`npx tsx scripts/bundle-size.ts dist docs/canvas-interaction-bundle-sizes.json` measures exact bytes and separate per-file gzip sizes. These totals cover all emitted assets, not the initial page transfer.

| Asset | Raw bytes | Gzip bytes |
| --- | ---: | ---: |
| Integration baseline entry JS | 3,022,042 | 862,131 |
| Direct-interaction entry JS | 3,045,942 | 869,611 |
| Entry delta | +23,900 | +7,480 |
| Lazy Math.js numeric module | 416,002 | 121,106 |
| Lazy OpenChemLib adapter/engine | 1,097,002 | 340,786 |
| PDF worker | 1,046,214 | 289,897 |
| All 429 emitted files | 22,847,334 | 6,138,028 |

All-assets delta from the integration baseline: +443,913 raw bytes and +129,430 per-file gzip bytes. Vite's pre-existing large-chunk warning remains. The full Math.js module was measured during development at 744.92 kB / 209.36 kB gzip; the official numeric entry point avoids that additional payload.

Production verification uses isolated data under `data/e2e-*`, local `qwen3:latest`, and ports WEB=5193, runtime=8220, data=8221, agent=8143. No main merge was performed. The baseline integration and canvas source worktrees remain clean at their original commits; the document source has unchanged tracked files and an existing untracked nested `.worktrees/` directory belonging to another chat.
