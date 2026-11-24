# Slide deck artifact — user readiness push

Owner words, verbatim:
> You need to do more work on this, it’s not user ready
> Get an agent on it

Interpretation: the rescued Presenton slide-deck implementation on branch `work/slide-deck-artifact-20261123` is real but not ready for a student to use. Make it user-ready, not just test-green.

## Current state

- Branch `work/slide-deck-artifact-20261123`, worktree `C:\Users\Owner\Downloads\StudyAI MK3\.worktrees\slide-deck-artifact-20261123`, HEAD includes implementation commits through `bb159bc` plus a docs commit.
- `server/presentations/` has compiler, templates, injectable Presenton renderer, validator/repair, path/sanitize helpers, service and HTTP route. `src/artifacts/ArtifactsPage.tsx` and the artifacts e2e spec exist.
- Verification record `docs/verification/2026-11-23-slide-deck-verification.md`: `tsc` clean, 107 files / 680 tests pass, artifacts-page Playwright spec passes. Eight tutor-dependent e2e failures are documented as environmental. Free-model semantic smoke passed with `hy4-flash-free` and `beam-free`.
- Explicit gaps from that record: no live generation against a running Presenton instance, no real rendered-slide visual QA, no LibreOffice/PPTX render inspection, no learning-outcome claim.

## What "user ready" means here

1. **Run the real thing.** Try to start a self-hosted Presenton locally (Docker if available; otherwise report the exact blocker). Generate a deck from a fixture through the actual HTTP route or service, not only injected fake `fetch`. If Presenton cannot run here, prove why and leave a reproducible setup note.
2. **Inspect the output.** Render the produced PPTX to PNG (LibreOffice if available, or Presenton's own path) and upload screenshots to your thread. Judge slide layout, readable type, citation visibility, notes, and editable shapes versus a full-slide image. Fix what the screenshots show.
3. **Harden the student path.** Check the artifacts page end to end: generate → list → open → citation opens source → download `.pptx` → rename → delete. Check loading, error, empty and failure states. No dead buttons, no silent failures, no raw IDs or provider errors shown to the student.
4. **Keep the contract.** Claim provenance and citation containment stay server-side; one repair call; no new authoring authority; no `.pptx` committed; no paid service or cloud key without approval.
5. **Prove it.** Quote `npm run verify` output. Playwright DOM assertions for any UI change. Upload before/after screenshots. Apply the Impeccable craft floor from `C:\Users\Owner\.config\opencode\skills\impeccable\reference\craft-floor.md` to any UI you touch.

## Constraints

- Work only in this worktree. Native thread execution only: no subagents of any kind, no Groq-hosted models. Skip any workflow step that demands a builder-check subagent.
- Use local env values without printing secrets. Tutor/LLM routing: `TUTOR_PROVIDER=opencode-go`, `CANVAS_OPENCODE_GO_MODEL=hy4-flash-free`. Unique ports: WEB_PORT=5361, RUNTIME_PORT=8301, DATA_PORT=8302, AGENT_PORT=8221, LANGGRAPH_DEPLOYMENT_URL=http://127.0.0.1/8221.
- Commit real changes to this branch with a Discord link in the message: `Discord: https://discord.com/channels/1574451017817399346/1574451617007271966`.
- Report what is now verified, what remains blocked, and any decision the owner must make.
