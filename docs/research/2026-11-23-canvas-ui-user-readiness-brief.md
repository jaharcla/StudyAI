# Canvas UI — user readiness push

Owner words, verbatim:
> You need to do more work on this, it’s not user ready
> Get an agent on it
> Canvas ui

You already landed the shared-token foundation (S1–S4). This is the next push: make the Canvas UI genuinely usable for a student, not merely test-green.

## Evidence you already have

The three audits in sibling worktrees found, among other things:
- Flashcard shows front and back together, so recall is impossible.
- Mindmap Inspect opens an empty editor; edge labels are silently dropped; map title never renders.
- Equation and graph titles render raw `x^2` ASCII instead of the app's existing math renderer.
- Bond and molecule editors show raw IDs and mojibake glyphs.
- Anatomy shows a lowercase raw `structureId`; concept ID leaks into the UI.
- Fresh vector/force/measurement objects say `canvas units` and labels collide with arrows.
- Atom hit region is roughly 25× the drawn glyph; bonds anchor to that invisible box.
- Graph reads as a sketch: tiny ticks, grid bleed-through, no surface or depth.

## Scope for this push

Implement the remaining high-impact fixes from `docs/superpowers/plans/2026-11-23-canvas-visual-remediation.md`: K1, K2, K3, K4, K6, K7, K8. Skip K5 (molecule editor) because the Lewis redesign owns that file region right now; note it as remaining work. Do not touch LewisSidebar, RadialAtomActions, MoleculeInteraction, radial actions, bond-order selection, place/connect flow, or molecule authoring. Edit ScientificLayer only at the standalone vector/force arrow block and `.scene-atom` only for the glyph label and hit region.

## What "user ready" means

1. Pick up where the shared tokens left off and actually fix the object behaviours named above. Reuse the patterns in the remediation plan's reuse map; no new authority, no new dependency, no new ScientificObject kind, no CanvasDocument.version change.
2. Work from real renders. Capture before/after screenshots at shipped desktop size for every kind you change, plus dark theme. Upload contact sheets to your thread in a fixed order.
3. Exercise the interactions in a real browser: select, inspect, edit, reveal, navigate, keyboard focus. No dead buttons, raw IDs, mojibake, unitless fallbacks or silent drops.
4. Playwright DOM assertions for every UI change. Quote `npm run verify` output and name any provider-dependent failures separately.
5. Apply `C:\Users\Owner\.config\opencode\skills\impeccable\reference\craft-floor.md` to what you touch: contrast, depth, spacing, states, focus, reduced motion.

## Constraints

- Work only in this worktree. Commit real changes to `work/canvas-remediation-phase1-20261123` with `Discord: https://discord.com/channels/1574451017817399346/1574451617007271966` in the message.
- Native execution only: no subagents of any kind, no Groq-hosted models. Skip any skill step demanding a builder-check subagent.
- Local env: `TUTOR_PROVIDER=opencode-go`, `CANVAS_OPENCODE_GO_MODEL=hy4-flash-free`. Unique ports: WEB_PORT=5352, RUNTIME_PORT=8293, DATA_PORT=8294, AGENT_PORT=8212.
- Report what is now genuinely usable, what remains blocked, and any decision the owner must make.
