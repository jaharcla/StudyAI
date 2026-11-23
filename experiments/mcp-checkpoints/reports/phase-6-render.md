# Phase 6 — Render determinism and persistence

Status: **partial — harness, real upstream fidelity loop and real StudyAI persistence tests run; StudyAI app reload/reconnect not run.**

## What was actually run

### Harness comparison (RED → GREEN)

```
npm test -- --config experiments/mcp-checkpoints/harness/vitest.config.ts experiments/mcp-checkpoints/harness/src/render.test.ts
```
- RED: `Cannot find module './render'`.
- GREEN: `Test Files 1 passed (1); Tests 2 passed (2)`.
- Tolerance is explicit: `GEOMETRY_TOLERANCE_PX = 1`. The tests deliberately accept different PNG bytes with identical geometry (`exportDelta: 1`, `reproducible: true`), so upstream's byte-identical claim is **not** imposed on StudyAI's renderer.

### Real upstream fidelity loop (actually run)

Pinned mcp_excalidraw, built, canvas server running. Commands in order:

```
node dist/bin.js screenshot --out evidence/phase-6-render/upstream-mcp_excalidraw/repeat.png
node dist/bin.js export --out evidence/phase-6-render/upstream-mcp_excalidraw/scene.excalidraw
node dist/bin.js snapshot save v1
node dist/bin.js import evidence/.../scene.excalidraw --replace
node dist/bin.js snapshot restore v1
node dist/bin.js screenshot --out evidence/phase-6-render/upstream-mcp_excalidraw/after-restore.png
```

Results:
- `repeat.png` SHA-256 `9085B3260E918FE177BD0206FD711F769996217CFE5D25BF5CF8FDF5671675BE`
- `after-restore.png` SHA-256 `9085B3260E918FE177BD0206FD711F769996217CFE5D25BF5CF8FDF5671675BE`
- The original `signup-flow-B3.png` from Phase 1 has the **same** SHA-256.

So for this scene and the pinned node renderer, repeat render and snapshot restore were byte-identical. This **reproduces locally** the upstream claim from the earlier research; it is not a claim about every scene or the browser renderer.

Notable behavior: in-memory state reported 8 elements, while `export` produced 14 elements (bound labels materialized as separate text elements). `import --replace` loaded 14, and `snapshot restore v1` returned to 8. The render hash was unaffected. This is an export-normalization detail worth remembering for any interoperability work.

### Real StudyAI tests

```
npx vitest run tests/canvas-stable-json.test.ts tests/canvas-persistence.test.ts tests/canvas-recognition.test.ts
```
Result: `Test Files 3 passed (3); Tests 18 passed (18)`, including `canvas recognition renderer > renders deterministically and keeps a square canvas` and six persistence tests.

These are unit/integration assertions about serialization, persistence and the recognition rasterizer. **No StudyAI PNG screenshot hash comparison was performed** — this campaign has no headless PNG pipeline for StudyAI's Quickdraw canvas, so no byte-identical claim is made for StudyAI.

## Answer to the campaign question

Partially answered for the checkpoint: mcp_excalidraw's determinism claim held for the one fixed state and node renderer exercised here. For StudyAI, the relevant deterministic primitives (stable JSON, persistence, recognition rasterizer) have passing tests, but the full render → export → reload → restore → reconnect loop has not been executed against the app.

## To complete this phase

1. Build a StudyAI headless screenshot harness (or use Playwright against a running dev server with a fixed board fixture).
2. Run the same loop on the three states in `fixtures/render/states.json`.
3. Feed object-level snapshots to `compareRenders` with the 1 px tolerance and report geometry drift, missing/duplicated objects, export delta and recovery separately.
