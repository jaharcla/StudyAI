# ADR: Responsive Focus Workspace composition

## Status

Accepted for the Phase 2 prototype.

## Decision

Compose the redesigned workspace from the existing React shell and the current
QuickDraw, CopilotKit, document intelligence, learning activity, and scientific
tool components. Add no UI framework or pane-management dependency.

The prototype will adapt layout and presentation around:

- `react@19.2.0` (MIT)
- `lucide-react@0.563.0` (ISC)
- `@quickdrawjs/react@0.1.0` (MIT)
- `@copilotkit/react-core@1.85.0` (MIT)

## Alternatives considered

1. Add a resizable-panel or component-library dependency. Rejected because the
   current shell already owns pane state, adding another layout authority would
   overlap it, and the capability gap is small.
2. Replace QuickDraw or CopilotKit surfaces with custom representations.
   Rejected because those integrations are functional and replacement would
   risk persistence, tool-call, and editor behavior.
3. Rebuild the workspace as a new route. Rejected because it would duplicate
   application state and weaken the local-first single-workspace architecture.

## Limits

The prototype does not change provider selection, persistence contracts,
scientific calculations, document indexing, or activity schemas. Responsive
drawers remain local UI state and do not persist across devices.

## Verification

Run the existing TypeScript/Vite build, Vitest suite, focused browser checks,
and manual desktop/mobile screenshots against the supervised preview.
