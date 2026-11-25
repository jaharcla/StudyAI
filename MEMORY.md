# StudyAI coordination memory

## Vision and ease target
- The app should feel as easy as Mindgrasp, NotebookLM, StudyFetch and Thea: upload once, land directly in a grounded learning interaction, no setup or decision fatigue.
- The Scientific Canvas and the Canvas-aware Tutor are the reason to stay. Do not make Canvas opt-in.
- User confirmed "both": the first minute must be effortless and the whole workspace must stay simple.

## Coordination preferences
- Do not paste the user's messages verbatim into worker prompts. Write short, synthesized briefs that give the worker only what it needs. User corrected this on 2026-11-25.

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
