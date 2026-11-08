# Quickdraw AI Bridge

This bridge is isolated from `CanvasStudio.tsx`. It uses `@quickdrawjs/core`, the installed `@quickdrawjs/react` store/editor, Zod, and CopilotKit v2. AI requests create proposals; a separate application-owned approval path calls `approveCanvasProposal`.

## Exports

- `buildCanvasAIContext(options)` in `src/canvas/ai/canvas-context.ts`
- `canvasActionSchema`, `validateCanvasAction`, `proposeCanvasAction`, `approveCanvasProposal`, `canvasFingerprint` in `src/canvas/ai/canvas-actions.ts`
- `useQuickdrawAIBridge(options)` in `src/canvas/ai/canvas-bridge.ts`

Context includes board/course/lesson scope, selected shapes, visible native shapes, typed text, arrow endpoints, spatial relationships, and nearby structured scientific objects. Raw draw/highlight strokes include point count, bounds, and at most six sampled points; coordinates are not interpreted as scientific handwriting. Text bounds are marked as approximations because Quickdraw's native text-layout helper requires a browser canvas.

Actions allow native geo, arrow, line, text, and note shapes. Updates only allow validated geometry and per-type properties. Every action is Zod parsed, scope checked, and captured against a canonical board fingerprint. Approval rejects changed boards, stale proposals, missing IDs, unsupported shapes, and invalid geometry. Approved mutations use one Quickdraw store transaction, retaining native IDs on updates and using store history for undo/redo. Connections create a native arrow between two shape centers and record both IDs in arrow props.

## CanvasStudio integration hooks

1. Import `useQuickdrawAIBridge`, `approveCanvasProposal`, and `CanvasProposal`.
2. Call the hook unconditionally in `CanvasStudio`, passing `editorRef.current.store`, `[...editorRef.current.selection]`, `editorRef.current.viewportPageBounds()`, `document.objects`, and `{ boardId: activeBoard.id, courseId, lessonId }`. Provide an empty `Store` until the editor and board exist.
3. Keep context current by triggering a render when the Quickdraw store, selection, camera, active board, or scientific objects change. The existing camera listener can be extended; also subscribe to the store and editor selection events and unsubscribe in `cleanupEditor`.
4. Store each callback proposal in component state and show its description with explicit Apply/Discard controls. Apply calls `approveCanvasProposal(editorRef.current.store, boardRef.current.id, proposal)` only from the Apply handler, then clears the proposal. Clear pending proposals on board/course/lesson changes. Do not register approval as an AI tool.

No changes to shared files or package manifests are required for this isolated implementation. `@quickdrawjs/core` is currently installed transitively through `@quickdrawjs/react`; declare it directly in `package.json` in the eventual integration if dependency ownership is being formalized.

## Verification

- `npx vitest run tests/canvas-ai-bridge.test.ts`: 6 tests passed.
- `npx tsc -b --pretty false`: passed.

The test suite covers selected/visible context, typed text, arrow and rotated bounds, stroke summaries, nearby objects, size limiting, create/update/move/delete/connect, invalid inputs, stale proposals, board isolation, and undo/redo.

## Limitations

- Handwriting interpretation is not implemented; freehand stroke coordinates are summarized only.
- Text bounds are approximate and do not account for browser-specific glyph metrics or line wrapping.
- Connectors are native arrows with endpoint IDs in metadata; endpoints do not auto-follow later shape moves.
- Image creation, arbitrary Quickdraw props, cross-board edits, and automatic AI edit execution are unsupported.
