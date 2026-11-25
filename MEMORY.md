# StudyAI coordination memory

## Vision and ease target
- The app should feel as easy as Mindgrasp, NotebookLM, StudyFetch and Thea: upload once, land directly in a grounded learning interaction, no setup or decision fatigue.
- The Scientific Canvas and the Canvas-aware Tutor are the reason to stay. Do not make Canvas opt-in.
- User confirmed "both": the first minute must be effortless and the whole workspace must stay simple.

## Decisions
- Preferred UX approach: one-drop start with progressive surfaces. Design: `docs/superpowers/specs/2026-11-25-one-drop-start-design.md`; plan: `docs/superpowers/plans/2026-11-25-one-drop-start.md`.
- Navigator default: board is the one room; top bar has Canvas, Study, Studio, Concepts only. Home/Today in sidebar; decks live in the Studio/PPTX flow.
- Browser first, then Kokoro-82M q8 as the only approved TTS benchmark candidate. No engine selected; no weights downloaded. User paused voice work on 2026-11-25.
- No subagents; native thread workers only. At most two workers plus coordinator, one Playwright suite at a time, pause below 1 GB free RAM. Workers use `opencode-go/hy4-flash-free` (channel default now set to this).
- No new dependency, paid service, API key, subscription or `.env` change without explicit approval. Local-first and BYOK.

## Installed ideation tools (2026-11-25, user-approved)
- BMad skills installed globally: `bmad`, `bmad-build`, `bmod-core-tools`, `bmod-method`. BMad project setup has not been run.
- `idea-refine` and `doubt-driven-development` installed globally from `karanmrn/karanagentskills`.
- The Unstuck skill in the MCP listing no longer exists in its source repo; these two were chosen as substitutes.
- Not installed: LoopTroop, WildCrane, Shinobi, opencode-evolve, AutoIdeator (services, keys or autonomous loops conflicting with worker limits). Karpathy's autoresearch is a method, not an install.

## Where things live
- UI source of truth: `DESIGN.md` at repo root.
- Coordination ledger and scorecard: `docs/FINAL_PUSH.md`.
- Tutor directive final report: `docs/verification/2026-11-25-tutor-transaction-final-report.md`.
- Voice benchmark harness: `tests/voice-benchmark/`; plan and verdicts in `docs/research/2026-11-25-voice-*`.
- Uninterrupted J1–J7 proof: `tests/e2e/journey-uninterrupted.spec.ts` with 13 ordered screenshots.

## Open goals
- Execute the one-drop start plan task by task; no merge before `tsc -b`, Vitest and targeted Playwright pass.
- Queued after the one-drop plan (user asked on 2026-11-25): fix the two mock-student defects — canvas inspection refuses a moderately populated board (3/3 attempts), and Notes autosave drops text when Done is clicked immediately.
- Live-provider tutor turn remains unverified locally: no BYOK key configured.
- ChatGPT upload limit (~18h from 2026-11-25 09:00) still blocks attaching ten walkthrough screenshots.
