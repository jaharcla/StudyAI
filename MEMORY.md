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

## Where things live
- UI source of truth: `DESIGN.md` at repo root.
- Coordination ledger and scorecard: `docs/FINAL_PUSH.md`.
- Tutor directive final report: `docs/verification/2026-11-25-tutor-transaction-final-report.md`.
- Voice benchmark harness: `tests/voice-benchmark/`; plan and verdicts in `docs/research/2026-11-25-voice-*`.
- Uninterrupted J1–J7 proof: `tests/e2e/journey-uninterrupted.spec.ts` with 13 ordered screenshots.

## Open goals
- Active sequential queue in thread `1575238760545919027` (started 2026-11-25, user asked to queue three tasks and then whatever follows): (1) bounded math evaluator from `docs/superpowers/plans/2026-11-25-bounded-math-evaluator.md`, (2) lazy-load mode-gated surfaces in `src/App.tsx`, (3) resolve uncommitted Creative Muse fixes in `.worktrees/creative-muse`, (4) final verification plus the two remaining low-risk performance findings. Workers do not merge; coordinator merges after reviewing each gate. The earlier attempt in thread `1575235495225598042` was aborted. The three later tasks are held until the evaluator full verify exits and RAM is above 1 GB.
- Parallel worker in thread `1575253772559581205` fixes the two flaky Playwright specs named in `docs/verification/2026-11-25-one-drop-start.md` (canvas-physics-fbd slider timing, canvas-visual-remediation seed board read). It waits for the evaluator verify to exit before running Playwright. No subagents.
- Kimaki CLI truncates a prompt at the first blank line: multi-paragraph worker briefs arrive with only the first paragraph. Write worker prompts as a single paragraph, and verify the delivered text in `~/.kimaki/session-events/<threadId>.jsonl` before trusting a worker was briefed.
- One-drop start plan merged into main on 2026-11-25 after green full gate (`tsc -b`, Vitest 918, Playwright 151 passed, 13-screenshot journey). Verification report: `docs/verification/2026-11-25-one-drop-start.md`. Next-Lesson Pre-flight was merged earlier the same day.
- The two mock-student defects (canvas inspection refusing a populated board, Notes autosave dropping text on immediate Done) were fixed by the Creative Muse worker but remain uncommitted in `feat/creative-muse`; they are not merged. Live-provider behavior of the canvas fix is still unconfirmed.
- Live-provider tutor turn remains unverified locally: no BYOK key configured.
- ChatGPT upload limit (~18h from 2026-11-25 09:00) still blocks attaching ten walkthrough screenshots.
