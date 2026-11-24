# Slide deck direction — keep the PowerPoint flow

Owner words, verbatim:
> I dont think I like what the deck in canvas ui is doing, I wanted to keep the PowerPoint flow with pictures and layouts and all that, the same as Gemini notebook

The deck-in-Canvas integration is stopped and will not be merged. Its branch is preserved as `work/deck-in-canvas-20261123` only as evidence of a rejected direction. This branch, `work/slide-deck-artifact-20261123`, is the deck track.

## What to build

Keep the real deck experience: a generated, editable `.pptx` from Presenton with pictures, layouts, templates and speaker notes, opened and downloaded from the artifacts page. The student's path should feel like producing a presentation, not viewing semantic cards on a canvas.

1. **Prove the real renderer.** Run self-hosted Presenton if the environment allows; generate from a grounded fixture; verify the returned file is an editable PPTX with real shapes/layouts/images, not a full-slide image. Render to PNG and inspect. Upload screenshots to your thread.
2. **Images and layouts.** Check the image plan and template manifest: real photos or deterministic diagrams, provenance, alt text, caption/credit, no decorative-only images, no invented citations, no placeholder text left. Fix what the renders show.
3. **Student path.** Generate from a lesson, list in artifacts, open the deck viewer, follow a citation to its source, download the `.pptx`, rename, delete. Loading, empty, error and failure states need real copy and working controls.
4. **Grounding stays.** Every claim traces to student course material or is explicitly labelled general knowledge; the semantic component contract, citation containment and one bounded repair stay intact. No new authoring authority, no second provenance implementation.

## What not to build

- No deck dock on the scientific canvas, no present-mode overlay, no shell page map, no Canvas pan/zoom language.
- No semantic-slide-card-only viewer that replaces the PPTX.
- No new provider, paid service, cloud key or dependency without an ADR and approval.

## Standards and verification

- Read `C:\Users\Owner\Downloads\StudyAI MK3\docs\FRONTEND_DESIGN_PRINCIPLES.md` and AGENTS.md. Apply the craft floor to any UI you touch.
- Playwright DOM assertions for the artifacts/deck flow; quote `npm run verify`; name provider-dependent failures separately.
- Inline critique before reporting done: name the three strongest objections. Critique agents are native threads only; the subagent tool stays banned, no Groq-hosted models.
- Work only in this worktree. Commit to `work/slide-deck-artifact-20261123` with `Discord: https://discord.com/channels/1574451017817399346/1574451617007271966` in the message.
- Local env, no secrets printed: `TUTOR_PROVIDER=opencode-go`, `CANVAS_OPENCODE_GO_MODEL=hy4-flash-free`. Ports: WEB_PORT=5194, RUNTIME_PORT=8221, DATA_PORT=8222, AGENT_PORT=8144.
