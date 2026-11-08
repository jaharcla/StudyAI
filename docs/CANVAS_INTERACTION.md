# Direct scientific manipulation

Baseline: `9b7d0568f35f73d736d97d49993209201734dcfa`. Worktree/branch: `canvas-direct-manipulation` / `work/canvas-direct-manipulation`. The verified integration and both original worktrees are preserved.

## Milestone A — vectors and forces

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

Later milestones add Lewis construction and the remaining spatial tools.
