# StudyAI coordination memory

## Vision and ease target
- The app should feel as easy as Mindgrasp, NotebookLM, StudyFetch and Thea: upload once, land directly in a grounded learning interaction, no setup or decision fatigue.
- The Scientific Canvas and the Canvas-aware Tutor are the reason to stay. Do not make Canvas opt-in.
- User confirmed "both": the first minute must be effortless and the whole workspace must stay simple.

## Coordination preferences
- Do not paste the user's messages verbatim into worker prompts. Write short, synthesized briefs that give the worker only what it needs. User corrected this on 2026-11-25.
- If the user does not answer a request, keep working on every other front. When they return, append the still-unanswered request at the bottom of every reply, whatever the new request is. User instructed this on 2026-11-25. The bounded typed-evaluator spec was approved on 2026-11-25 and written to `docs/superpowers/specs/2026-11-25-bounded-math-evaluator-design.md`; the four-task plan is `docs/superpowers/plans/2026-11-25-bounded-math-evaluator.md` and is ready for a worker. Canvas context performance fix (`8b14f7a`, memoized context, quantized viewport, single-pass truncation) merged to main after tsc and its two regression tests passed.

## Decisions
- Preferred UX approach: one-drop start with progressive surfaces. Design: `docs/superpowers/specs/2026-11-25-one-drop-start-design.md`; plan: `docs/superpowers/plans/2026-11-25-one-drop-start.md`.
- Navigator default: board is the one room; top bar has Canvas, Study, Studio, Concepts only. Home/Today in sidebar; decks live in the Studio/PPTX flow.
- Browser first, then Kokoro-82M q8 as the only approved TTS benchmark candidate. No engine selected; no weights downloaded. User paused voice work on 2026-11-25.
- No subagents; native thread workers only. At most two workers plus coordinator, one Playwright suite at a time, pause below 1 GB free RAM. Workers use `opencode-go/hy4-flash-free` (channel default now set to this).
- No new dependency, paid service, API key, subscription or `.env` change without explicit approval. Local-first and BYOK.
- On 2026-11-25 the user approved enabling "Allow paid endpoints that train on request data" in OpenCode Go privacy settings so `opencode-go/iceman-contributor-free` can run. Verified enabled and persisted after reload. Only run that model in a dedicated worktree with no `.env`, keys or credential files; briefs must forbid reading or printing secrets because requests train on the data.
- On 2026-11-25 the user accepted rejection of all five Gemini-proposed Tutor MCPs (Sym-MCP, mcp-run-python, pymupdf4llm-mcp, mcp-mermaid, ad/sequentialthinking) and explicitly skipped the cross-model second opinion. Nothing installed; no bot restart. Evidence: `mcp-run-python` and `ad/sequentialthinking` are archived; `pymupdf4llm-mcp` is AGPL-3.0; `mcp-mermaid` installs Chromium and can emit public URLs; Sym-MCP is unproven and its worker pool costs ~1.5 GB. Review thread: https://discord.com/channels/1574451017817399346/1575203510285238365

## Installed ideation tools (2026-11-25, user-approved)
- BMad skills installed globally: `bmad`, `bmad-build`, `bmod-core-tools`, `bmod-method`. BMad project setup has not been run.
- `idea-refine` and `doubt-driven-development` installed globally from `karanmrn/karanagentskills`.
- The Unstuck skill in the MCP listing no longer exists in its source repo; these two were chosen as substitutes.
- Not installed: LoopTroop, WildCrane, Shinobi, opencode-evolve, AutoIdeator (services, keys or autonomous loops conflicting with worker limits). Karpathy's autoresearch is a method, not an install.

## Performance tools on call (user-supplied, 2026-11-25)
Keep these links; install and actually use them if RAM or performance dips again. Do not install while the machine is healthy. Do not restart the bot to connect an MCP without a new explicit request.

- Windows PC Optimizer skill: https://mcpmarket.com/tools/skills/windows-pc-optimizer
- Windows 11 Performance Optimizer skill: https://mcpmarket.com/tools/skills/windows-11-performance-optimizer
- Windows RAM Optimizer skill: https://mcpmarket.com/tools/skills/windows-ram-optimizer (installed as `memory`; bundled scripts were not included)
- CPU/GPU Performance skill: https://mcpmarket.com/tools/skills/cpu-gpu-performance-optimizer (installed as `cpu-gpu-performance`)
- ProcMon MCP: https://github.com/0xhackerfren/ProcMon-MCP (POC, admin, sensitive Windows internals)
- Process Monitor MCP: https://mcpmarket.com/server/process-monitor
- AppControl: https://www.appcontrol.com/
- Windows MCP Server: https://windowsmcpserver.dev/
- Windows Task Manager MCP: https://mcpmarket.com/es/server/windows-task-manager
- Earlier Athola CPU/GPU skill page: https://skillselion.com/skills/athola/claude-night-market/cpu-gpu-performance

## CLI-Anything (2026-11-25, user explicitly approved)
- `cli-hub-meta-skill` installed globally at `~\.agents\skills\cli-hub-meta-skill`.
- Five OpenCode commands plus `HARNESS.md` installed globally at `~\.config\opencode\commands\`: cli-anything, cli-anything-refine, cli-anything-test, cli-anything-validate, cli-anything-list.
- `cli-anything-hub` 0.4.1 installed via `python -m pip install --user`; executable at `C:\Users\Owner\AppData\Roaming\Python\Python310\Scripts\cli-hub.exe` but that Scripts directory is not on PATH, so invoke by full path.
- Use only for scoped tasks. Generator produces Python Click harnesses; it is not part of the StudyAI runtime.

## Installed performance commands (2026-11-25, user-approved)
- Seven `claude-code-templates` performance commands installed into `.claude/commands/`: optimize-memory-usage, performance-audit, add-performance-monitoring, implement-caching-strategy, optimize-api-performance, system-behavior-simulator, setup-cdn-optimization.
- These are prompt checklists, not runtime tools. Most useful here: baseline before/after, heap and listener leak checks, streaming and limits on the data API. CDN, containers and autoscaling do not apply to a local-first app.

## Machine state (2026-11-25)
- Startup trim applied with user approval. Removed 8 HKCU Run entries: Steam, Overwolf, EpicGamesLauncher, EADM, BlueStacks Services, Adobe Acrobat Synchronizer, Opera Browser Assistant, Opera GX Browser Assistant. Backups in `%TEMP%\opencode\ram-optimization-backup\hkcu-run-20261125-125718.reg` and matching HKLM file. HKLM entries Acronis Scheduler2 Service and SteelSeriesGG were not removable without elevation. DiagTrack and SysMain remain Automatic for the same reason. Full RAM benefit arrives after next login.
- On 2026-11-25 the user approved a second RAM pass: background apps and idle Chrome renderers were stopped, and 10 MCP servers were disabled in `C:\Users\Owner\.config\opencode\opencode.json` (backup at `%TEMP%\opencode\opencode.json.bak-20261125-1632.json`). Only gitnexus, mcpproxy, sequentialthinking, serena and project-local waterloo-learn remain connected. Node processes fell 79 to 14; free RAM rose to about 5.5 GB. Two OVR processes still need elevation. Tools from the disabled servers (browsermcp, rea, agentmemory, reddit/x/linkedin/zulip outreach, openpets, chrome-devtools, ui-expert) are no longer available in this session.

## Where things live
- UI source of truth: `DESIGN.md` at repo root.
- Coordination ledger and scorecard: `docs/FINAL_PUSH.md`.
- Tutor directive final report: `docs/verification/2026-11-25-tutor-transaction-final-report.md`.
- Voice benchmark harness: `tests/voice-benchmark/`; plan and verdicts in `docs/research/2026-11-25-voice-*`.
- Uninterrupted J1–J7 proof: `tests/e2e/journey-uninterrupted.spec.ts` with 13 ordered screenshots.

## Open goals
- Bounded math evaluator is merged into main (`e4a4a36` plus verification-note merge `8086bc3`) after a clean full gate: `tsc -b` 0, Vitest 151 files / 956 tests, Playwright 158 passed / 6 skipped / 2 flaky / 0 unexpected, exit 0. Gate note: `docs/verification/2026-11-25-bounded-math-evaluator-gate.md`. The earlier red gate used a dummy CPK key and is invalid.
- All three successor tasks from thread `1575263169654427778` are merged into main: lazy mode-gated surfaces (`fbcface`), Creative Muse defect fixes (`7f3f259`), and concept-graph hot paths plus verification note (`4ab9fdb`). Each merge was verified on main with `tsc -b` clean and targeted Vitest green. Diffs: lazy https://critique.work/v/ce8f308ef49c302ec83aa581e592f115 · Creative Muse https://critique.work/v/0b98cc3e5ccc45a06afb77b76c8d61e4e8ce2074da22c32 · hot paths https://critique.work/v/e74af35bbafd88a106381d75e72572fd. The UI and backend worker worktrees were created from earlier main and will need a rebase before merge. Earlier attempt in thread `1575235495225598042` was aborted.
- UI redesign is merged into main at `62fccd5`: P0 one-drop shell, P1 canvas hierarchy, P1 canvas-aware Tutor actions and P2 human-readable proposals. Review verdict and findings are in `.worktrees/ui-direction-luna/docs/design/ui-redesign-review.md` (Hold before merge; the worker resolved its core findings). Implementation thread `1575269403669303306`; its erroneous backend detour was stashed as `stash@{0}` in `.worktrees/ui-redesign-20261125` and not deleted. Merge diff: https://critique.work/v/e298dc57ffbb1d14754befac4e8dbecf.
- Targeted Playwright on merged UI: 14 passed, 1 failed (`tutor-experience.spec.ts` expects the Ollama echo `STUDYAI-OLLAMA-OK`, but local `.env` sets `TUTOR_PROVIDER=opencode-go`; the worker had already flagged this provider-dependent test as unverified). `tsc -b` clean and targeted Vitest green. Do not weaken the test; run it under an Ollama stub before claiming it green.
- Backend follow-ups are merged into main at `c519dee` after the six items plus review fixes (`2334fa4`, https://critique.work/v/e3a1669c9cad014f408525c0ae2a5b01), and the backend final-check risks were fixed and merged at `285b81d` (`e45c3ef`, https://critique.work/v/c4165ada0e150ee9392a364004c41715): reconciliation canonicalizes roots/stored files with `realpath`, and the Windows-only case test is skipped elsewhere. Review handoff: `.worktrees/backend-review-luna/docs/engineering/backend-review-direction.md`. Verified on main with `tsc -b` clean; the three API suites transiently timed out in `beforeAll` during a full Vitest run while the UI worker was compiling, but all 13 tests passed when rerun in isolation. Merge diffs: https://critique.work/v/242119062a28e922dd43f0a217da9dc9 · https://critique.work/v/8f357f3ab45f757b5df42433568b4dc5.
- When both implementation workers finish (UI thread `1575269403669303306`, backend thread `1575272279435116576`), send the two original Luna threads back for another 5-minute review of the changes: UI review in `1575266741389369445` on `.worktrees/ui-redesign-20261125`, backend review in `1575270454644445295` on `.worktrees/backend-followups-20261125`. User requested this on 2026-11-25. Verify each thread is still on `opencode-go/gpt-6-luna` before sending.
- Flaky canvas specs fixed in thread `1575253772559581205` and merged to main in `25456c5`: `expect.poll` on `/api/canvases` before indexing in `canvas-physics-fbd.spec.ts` and `canvas-visual-remediation.spec.ts`. Confirmed 5/5 with retries disabled, `tsc -b` clean, targeted Vitest 5/5. Other specs using `boards[0].id` were not audited and may share the race.
- Kimaki CLI truncates a prompt at the first blank line: multi-paragraph worker briefs arrive with only the first paragraph. Write worker prompts as a single paragraph, and verify the delivered text in `~/.kimaki/session-events/<threadId>.jsonl` before trusting a worker was briefed.
- One-drop start plan merged into main on 2026-11-25 after green full gate (`tsc -b`, Vitest 918, Playwright 151 passed, 13-screenshot journey). Verification report: `docs/verification/2026-11-25-one-drop-start.md`. Next-Lesson Pre-flight was merged earlier the same day.
- The two mock-student defects (canvas inspection refusing a populated board, Notes autosave dropping text on immediate Done) were fixed by the Creative Muse worker but remain uncommitted in `feat/creative-muse`; they are not merged. Live-provider behavior of the canvas fix is still unconfirmed.
- Live-provider tutor turn remains unverified locally: no BYOK key configured.
- ChatGPT upload limit (~18h from 2026-11-25 09:00) still blocks attaching ten walkthrough screenshots.
