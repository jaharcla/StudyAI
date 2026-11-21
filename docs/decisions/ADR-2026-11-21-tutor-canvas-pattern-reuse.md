# ADR: Reuse tutor→canvas patterns without new dependencies

Date: 2026-11-21

Status: accepted for implementation.

## Decision

Adapt four patterns from external projects into StudyAI's existing canvas tool surface. Add no MCP server, canvas engine, or runtime dependency. The external projects remain research references only; the Quickdraw canvas and `server/canvas-persistence` stay the single board authority.

1. `describe_canvas` + `read_design_guide` tools (pattern: `yctimlin/mcp_excalidraw` v2.2.0, MIT — `describe_scene` and `read_diagram_guide`).
2. `propose_teaching_scene` compiler (pattern: `ddkbs/sketchy` v0.2.0, MIT — semantic scene with layout decided by the app, not the model).
3. Reader-check warnings from the existing revision-bound scene graph (pattern: Sketchy drawing feedback + Excalidraw screenshot-verify-fix).
4. Read-only / consequential annotations in tool descriptions (pattern: WebMCP draft 2026-11-19 `ToolAnnotations`).

## Alternatives considered

- **Install `mcp-excalidraw-server`**: rejected. It drives a separate Excalidraw canvas; a second board authority violates the canvas invariants, and it would add a Node ≥20 stdio server plus HTTP/WS surface.
- **Install `@ddkbs/sketchy`**: rejected. It ships its own elkjs/rough.js renderer and MCP App; again a second canvas authority.
- **Install `@w3c/webmcp-polyfill`**: rejected for now. WebMCP is a registration contract, not a capability, and no in-app consumer calls browser tools. The registration shape is already implemented by CopilotKit's `useFrontendTool`.
- **Use tldraw MCP**: rejected. The tldraw SDK license forbids production use without a trial or commercial key and adds license-key enforcement plus telemetry; no MCP Apps host exists in the runtime.

## Limits

- No new dependency is added. All logic is pure TypeScript over existing Zod schemas, the existing scene graph, and existing proposal functions.
- Teaching-scene layout is a bounded deterministic grid, not a layout engine: 8 nodes / 10 edges / 4 steps maximum so a batch stays under `canvasActionSchema`'s 30-action cap.
- Step captions are always emitted; step highlights are emitted only for shapes that already exist on the board, because `highlightShape` validates against the current store and cannot target ids created in the same proposal.
- Reader-check warnings are derived from scene-graph `overlaps` edges plus an optional viewport. They are advisory, never a mutation, and never lower an OCR or recognition threshold.
- Adding tool descriptions to `server/agent.ts` changes the Tutor's prompt; the `benchmark:canvas` gate applies and its four numbers must be quoted in the handoff.

## Verification

- Unit tests: `tests/canvas-teaching-scene.test.ts` and `tests/canvas-scene-tools.test.ts` for the compiler, guide, and warnings.
- Full gate: `npm run verify`, then `npm run benchmark:canvas` against `docs/verification/canvas-benchmark-baseline.json`.
- GitNexus `impact` upstream before edits; `detect_changes` (scope all) before commit.
