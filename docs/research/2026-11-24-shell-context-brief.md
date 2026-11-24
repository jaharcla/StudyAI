# Fix squad — shell and context continuity

Owner words, verbatim:
> Now we should deploy the next scoped squad to fix all the things it found

Evidence: `C:\Users\Owner\AppData\Local\Temp\opencode\mock-student-runs-2026-11-24.md`, screenshots run1-01, run2-01, run2-02, run2-03, run3-23. Findings: raw slug `kin120` as lesson title; most KIN documents mislabelled `KIN 472 – Section 24 Upper Extremity Disorders <real filename>`; 271 mostly synthetic courses in the picker; tutor chat from CHEM 120 stayed visible after switching to KIN 120; tutor panel covers canvas objects; Settings model dropdown shows Ollama models only while the active provider is opencode-go/hy4-flash-free.

## Scope (yours only)

- `src/App.tsx` (smallest edits), `src/components/document-intelligence/*`, `src/components/ProgressDialog.tsx`
- `src/canvas/CanvasStudio.tsx` only for publishing selected scientific object into Tutor context and avoiding panel overlap
- `server/tutor-canvas-context.ts` only for selected-object context
- Settings model dropdown display in `src/App.tsx` / `src/FreeKeyGuide.tsx` if needed.

## What to fix

1. Clear tutor chat and stale lesson context when the student switches course or lesson. Keep the student's current course identity accurate in the Tutor context.
2. Publish the selected scientific object's real id and human name into Tutor context so questions about the selected object work. Never expose raw IDs in visible text.
3. Clean shell presentation: show a human lesson title instead of a raw slug; show real document titles instead of a stale prefix; make the course picker usable despite synthetic test data without deleting the owner's data (filter/hide or group, no destructive DB changes).
4. Stop the tutor panel covering canvas objects it is meant to discuss. Respect the frontend design principles.
5. Settings should reflect the active provider's model path. Under explicit `opencode-go`, either list the configured model or explain clearly why the local Ollama list is not the active one. No provider calls or new keys.

## Constraints

- Do not touch `server/agent.ts`, `server/tutor-presentation.ts`, `server/learning/*`, `server/studio/*`, `server/presentations/*`, `src/artifacts/*`, or `src/coach/*`. Other squads own them.
- Frontend standard `C:\Users\Owner\Downloads\StudyAI MK3\docs\FRONTEND_DESIGN_PRINCIPLES.md`; screenshots, Playwright DOM assertions, inline critique with three objections.
- Native execution only: no subagents, no Groq models, no paid services. Work only in this worktree.
- Commit to `work/fix-shell-context-20261124` with `Discord: https://discord.com/channels/1574451017817399346/1574451617007271966`. Quote `npm run verify`; name provider-dependent failures separately.
