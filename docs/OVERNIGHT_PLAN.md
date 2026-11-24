# Overnight plan — 2026-11-24, until 08:30 EST (13:30 UTC)

Goal: finish the four fix squads, integrate safely, and prove the full student workflow with a repeat mock run before the owner wakes.

## Do not

- No paid services, new API keys, subscriptions, or provider changes.
- No destructive database edits; the synthetic courses stay until the owner decides.
- No theme or `DESIGN.md` decision — the owner has not landed on a visual direction.
- No FunASR or Magic implementation; both are recorded as future/consideration only.
- No PRs or pushes to GitHub; issues are for tracking only.

## While the squads run

Four native workers own separate worktrees and GitHub issues:

| Squad | Branch | Issue | Scope |
| --- | --- | --- | --- |
| Generation endpoints | `work/fix-generation-endpoints-20261124` | #20 | 502s on deck/studio generate, honest errors |
| Practice flow | `work/fix-practice-flow-20261124` | #21 | 404 on study/ask, hidden source field, answer→mastery loop |
| Tutor hygiene | `work/fix-tutor-hygiene-20261124` | #22 | streamed reasoning, placeholder links, empty answers, board citations |
| Shell/context | `work/fix-shell-context-20261124` | #23 | stale chat, titles, course picker, panel overlap, model display |

Do not interrupt them. If a worker stalls more than ~30 minutes without progress, check its log once; if it is blocked on a decision, record the blocker and move on rather than waiting.

## As each squad finishes

1. Review the real diff (critique patch plus changed files); do not trust the completion claim alone.
2. Merge into `main` in this order: generation → practice → Tutor hygiene → shell/context. Resolve conflicts by keeping both features; the known conflict zone is `src/App.tsx` (Coach surface, Artifacts page, paid-rail flag).
3. After each merge: `tsc -b`, full Vitest, then the squad's targeted Playwright specs. Name provider-dependent failures separately; do not weaken assertions.
4. Keep GitHub issues updated with outcome and links; close only after the repeat mock run.

## After all four land

1. Repeat both mock student runs from `C:\Users\Owner\AppData\Local\Temp\opencode\mock-student-brief.md`, using the owner's real local course data (CHEM 120 / Quantum theory first, then KIN 120).
2. Use `TUTOR_PROVIDER=opencode-go` and `CANVAS_OPENCODE_GO_MODEL=hy4-flash-free` explicitly; no Groq, Ollama or beam-free.
3. Compare against the baseline note `C:\Users\Owner\AppData\Local\Temp\opencode\mock-student-runs-2026-11-24.md`. The path must work: read source → grounded answer with openable citation → canvas object work → generate artifact → practice and rate → Coach Continue → progress.
4. Upload numbered screenshots and record exact UI text for any remaining failures.
5. Update `docs/PRODUCT_ROADMAP.md` with what is now actually working and what still blocks the vision.
6. Report at 08:30: what merged, what the repeat run proved, what remains broken, and any decision needed from the owner.
