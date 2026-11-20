# StudyAI integration design brief

- Preserve the current StudyAI Canvas and Tutor layout; this work is a functional integration, not a redesign.
- Keep analysis status, uncertainty, and source references readable near the Tutor response.
- Keep canvas edits as reviewable proposals with an on-canvas preview and explicit Apply action; never auto-apply.
- Distinguish observations from model interpretations in visible copy and response rendering.
- Avoid exposing provider internals, token accounting, or implementation details in student-facing flows.
- Visual review is required after any new UI surface or changed proposal flow.

## Visual review — 2026-11-09

- At 1440×900, **Analyze board** is visible beside the existing board controls and becomes enabled after the board is saved; the saved-state indicator remains readable.
- The action fits the existing Canvas/Tutor layout without covering the drawing surface. No layout change is needed for this integration.
- A CopilotKit feature popover appeared over part of the Tutor pane in the isolated review capture. It did not obstruct the Analyze action; its source and whether it appears in the user's normal session were not verified.
- Verdict: pass for the Canvas handoff control. Capture: `build-verification-20261109-final/canvas-toolbar-review.png`.
