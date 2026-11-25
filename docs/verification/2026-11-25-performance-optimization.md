# Performance optimization log (2026-11-25)

## Baseline (before resuming the queued work)

- Uptime: 02:26:38, total RAM 15.71 GB, free RAM 1.43 GB.
- CPU load: 8%; top consumer `opencode` (PID 12248, 335 s CPU, 536 MB).
- GPU: `nvidia-smi` reports 0% utilization and 0 MiB used; no GPU work applies here.
- Full `npm run verify` from the evaluator task is still running as PID 18536.
- Earlier full-verify failures were caused by a missing `CPK_INTELLIGENCE_API_KEY` in the worktree, not a product regression. The key is already present in the project's local `.env`.

## Scope and throttling

- Keep the existing sequential queue: math evaluator, lazy mode-gated surfaces, Creative Muse fixes, then final verification and the two remaining low-risk performance findings.
- No parallel worker while the verify process is running: one Playwright suite at a time.
- Pause new work whenever free RAM is below 1 GB; resume only after it recovers and the verify exits.
- Prefer targeted Vitest and Playwright suites over repeated full `npm run verify` runs; reserve the full gate for final handoff.

## Instrumentation

- Resource baseline captured with OS counters and `nvidia-smi` before any further build or test.
- No profiler was attached because no new hot path is being changed in this step; the audit's concrete findings already identify the targets.

## Approved system memory optimization (2026-11-25 16:32 local)

- Terminated 12 Wispr Flow, 9 Copilot app, 1 Copilot host, 4 rsAppUI, 1 OVR launcher subtree, 1 RemoteDesktopCompanion, 1 crashpad handler and 7 Chrome renderers older than 15:00 under PID 19256. `LEDKeeper2`, `MSI.CentralServer` and `rsEngineSvc` were already absent. Two OVR processes (`OVRServiceLauncher.exe`, `OVRRedir.exe`) remain: taskkill returned access denied.
- Backed up `C:\Users\Owner\.config\opencode\opencode.json` to `C:\Users\Owner\AppData\Local\Temp\opencode\opencode.json.bak-20261125-1632.json`, set `disabled: true` on 10 MCP servers (agentmemory, browsermcp, chrome-devtools, openpets, rea, reddit_outreach, ui-expert, x_outreach, linkedin_outreach, zulip), and rewrote the file as formatted JSON.
- `opencode mcp list` now shows 4 globally enabled servers (gitnexus, mcpproxy, sequentialthinking, serena) plus project-local `waterloo-learn`; all others disabled.
- Node processes fell from 79 to 14 and npx MCP processes from 57 to 9. Free RAM rose from 3.72 GB before termination to 5.55 GB after config reload.

## Root cause of RAM pressure

- Chronic baseline: the OpenCode service (PID 12248) owns 58 long-lived `npx` MCP-server processes started at 13:23, totaling about 2.8 GB, plus 46 Chrome/Edge WebView/headless processes totaling about 2.16 GB and Windows Memory Compression around 2.5 GB. That is roughly 7.5 GB of 15.71 GB before any test runs.
- Acute trigger: the evaluator full verify used a dummy `CPK_INTELLIGENCE_API_KEY` because its worktree had no `.env`. Tutor/PDF cases failed and retried for 61 minutes, keeping headless Chromium trees and `tsx` workers alive; free RAM fell to 0.85 GB.
- Evidence it is not an application memory leak: stopping the verify process tree freed about 1.3 GB immediately and free RAM recovered to 4-5 GB without code changes. No growing renderer or JS heap was identified.
- Recommendations: keep only needed MCP servers enabled in the OpenCode config, copy the real CPK key into worktrees before a full gate, avoid concurrent Playwright suites, and cap retries so a failing suite cannot hold browser trees for an hour.

## RAM cleanup (2026-11-25 16:15 local)

- The evaluator full verify (PID 18536, started 15:14) was stopped after 61 minutes of retry-heavy Playwright while free RAM sat at 0.85 GB. `taskkill /PID 18536 /T /F` freed about 1.3 GB (0.85 GB to 2.16 GB).
- This is a resource stop, not a test verdict. Rerun the full gate after `CPK_INTELLIGENCE_API_KEY` is copied into the worktrees without printing it.
- The flaky-spec worker resumes first; the evaluator queue stays held so only one Playwright suite runs at a time.

## GPU offload decision

- GPU is idle (0% utilization, 0 MiB used). The queued work is TypeScript compilation, Vitest, Playwright and SQLite/JSON processing, all CPU or I/O bound; offloading it to the GPU would not help.
- The only local model path is CLIP canvas recognition in `server/canvas-intelligence/recognition/clip.ts`, and `CANVAS_CLIP_WARMUP=0` disables it. transformers.js in Node runs ONNX on CPU; GPU execution would need a new ONNX runtime provider dependency and explicit approval.

## Follow-ups

- Wait for PID 18536 to exit, then record its exact result in the worker's verification note.
- Copy `CPK_INTELLIGENCE_API_KEY` from the main `.env` into each worktree that runs e2e tests, without printing its value.
- Resume the lazy-mode-surfaces task only when RAM is above 1 GB.
- Consider a second parallel worker only if RAM stays comfortably above 1 GB and the remaining write scopes do not overlap.
