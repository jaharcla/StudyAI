---
name: studyai-project
description: Use when working on the StudyAI MK3 codebase — dev servers, build/test commands, ports, provider configuration, project layout, data locations, and the mandatory GitNexus pre-edit/pre-commit workflow. Triggers on StudyAI, studyai-mk3, tutor, canvas, FSRS, adaptive review, "run the app", "dev server".
---

# StudyAI MK3 — Project Orientation

Local-first, single-user study workspace: course/lesson management, scientific canvas, document search, adaptive review (FSRS), AI Tutor. Windows 11, PowerShell, Node.js >= 22, npm. Python is NOT required to run the app.

## Commands

| Task | Command |
| --- | --- |
| Install | `npm ci` (then copy `.env.example` to `.env` if missing) |
| Dev (all 4 processes) | `npm run dev` |
| Dev: web only | `npm run dev:web` (Vite) |
| Dev: CopilotKit runtime | `npm run dev:runtime` |
| Dev: data API | `npm run dev:data` |
| Dev: LangGraph agent | `npm run dev:agent` |
| Build | `npm run build` (`tsc -b && vite build`) |
| Unit tests | `npm test` (vitest run) |
| E2E tests | `npm run test:e2e` (playwright; needs `npx playwright install chromium` once) |

## Ports (all loopback) and data

- Web 5183, CopilotKit runtime 8210, Data API 8211, LangGraph agent 8133.
- SQLite DB: `data/studyai.sqlite` (better-sqlite3). Imported files: `data/documents/`.
- Inspect DB via bash with the installed better-sqlite3 (`node --input-type=module -e "..."`) or Python's sqlite3 — no separate DB server is configured.

## AI providers (.env)

- Default is Groq (`TUTOR_PROVIDER=groq`, `CANVAS_INFERENCE_PROVIDER=groq`, `CANVAS_OCR_PROVIDER=groq`); requires `GROQ_API_KEY`; explicit groq mode does NOT fall back to Ollama.
- Local inference: set all three to `ollama`/`ollama`/`local` (default model `qwen3:latest` at `http://127.0.0.1:11434`). `TUTOR_PROVIDER=auto` = Groq with Ollama fallback.
- `GOOGLE_FACT_CHECK_API_KEY` is optional (Google Fact Check Tools API for the Tutor on Groq).
- Never write secrets to `.env.example`; keep them in `.env`.

## Layout

- `src/` — React 19 web app (canvas/, components/, learning/, `api.ts`, `workspace-state.ts`).
- `server/` — `api.ts` (data API), `runtime.ts` (CopilotKit), `agent.ts` (LangGraph), `db.ts`, `tutor-*.ts`, `science-tools.ts`, `ai-requests.ts` (queueing/cost caps).
- `agents/` — markdown subagent role specs (code-reviewer, qa_engineer, security_auditor, ...).
- `docs/` — `ARCHITECTURE.md`, `STATUS.md`, `ADAPTIVE_LEARNING.md`, `DOCUMENT_INTELLIGENCE.md`, `decisions/` (ADRs), `plans/`.
- `tests/` — vitest unit tests at root of `tests/`, `tests/e2e/` for playwright, `tests/fixtures/`.
- Root `*-main.zip` files are vendored upstream sources for reference (xyflow, mathlive, openchemlib, langgraphjs, tiptap, plotly, ts-fsrs, zod, ...). Never edit or import from the zips; the pinned npm packages in `package.json` are the authority.

## Mandatory workflow rules (from CLAUDE.md / AGENTS.md)

- Run GitNexus `impact` (upstream) BEFORE editing any symbol; warn on HIGH/CRITICAL; `risk: UNKNOWN` is unresolved, not safe — confirm by text search.
- Run GitNexus `detect_changes` (scope `all`) BEFORE committing; `partial`/`truncated` is not a clean check — re-run.
- Use `query`/`context`/`impact` for structure first; grep only for literals or empty/UNKNOWN results.
- Use GitNexus `rename` for renames — never find-and-replace.
- Reuse policy: prefer existing code and pinned deps; no new dependency without a demonstrated capability gap; record significant reuse-vs-build decisions as an ADR in `docs/decisions/` before implementing.
- Keep calculations deterministic; bound untrusted expressions/model output; preserve user data and worktree ownership.
- Choose tooling from `docs/MCP_AND_PLUGINS.md` (and the "MCP & plugin routing" section of `CLAUDE.md`) before reaching for an MCP; there is no database MCP — query `data/studyai.sqlite` with the documented here-string recipe.

## Gotchas

- `.npmrc` exists at root — respect it when installing.
- `npm run dev` starts four processes; if a port is occupied, check for stale `tsx`/node processes before assuming a code bug.
- Verification artifacts live in `build-verification*/` and `docs/verification-results.json`; this project has a strong build-gate culture — run `npm run build` and `npm test` before declaring done.
- Current git work happens on feature branches (e.g. `codex/*`); remote is `https://github.com/jaharcla/StudyAI.git`.
