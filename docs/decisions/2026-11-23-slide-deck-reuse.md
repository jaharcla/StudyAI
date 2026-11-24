# ADR: slide deck generation — reuse over rebuild

Date: 2026-11-23
Status: accepted (design approved 2026-11-23; implementation in worktree `slide-deck-artifact`)
Context: the Tutor must produce a course-grounded, editable `.pptx` that appears as an artifact in StudyAI. The Artifact Intelligence ADR (`ADR-2026-11-23-artifact-intelligence-system.md`) defines one composition authority and three renderers; slide decks were previously out of scope.

## Decision

1. **Reverse the scope decision narrowly.** Add a `slide_deck` component to `ArtifactPackage`; keep `deck` as the Canvas flashcard kind. Do not add a new board-interpretation authority, `ScientificObject` kind, or `CanvasDocument.version` change.
2. **Integrate Presenton** (`presenton/presenton`, Apache-2.0, self-hosted REST + MCP) as the PPTX renderer behind `server/presentations/renderer.ts`. It already provides editable PPTX export, English built-in templates, custom templates from PPTX, Pexels/Pixabay/image-model providers, Ollama/local LLM support, and Docker on Windows. We call `POST /api/v1/ppt/presentation/generate` with `slides_markdown` and do not import its internals.
3. **The agent-facing contract is semantic.** No shape IDs, coordinates, font names or colours in `slide_deck`; layout, theme and placeholders come from the template. Deterministic compilation produces Presenton's request.
4. **Storage:** keep the existing `studio_artifacts` table with additive `collection` and `file_path` columns; generated `.pptx` files live under `data/artifacts/` and are served over a course-scoped loopback route. No rename or migration test is needed for an additive column.
5. **Provider and egress:** prefer Presenton with `LLM=ollama` or an OpenAI-compatible local endpoint. Cloud keys and external image providers (Pexels 200 req/h + 20k/month, Pixabay ~100 req/60s with 24h cache) require explicit user consent. Disable Presenton's community gallery. Never send `.env`, tokens, citations with raw student content, or database dumps to an external service.
6. **Quality:** validate citations, unique slide titles, alt text and placeholder text after generation; bounded repair allows at most one regeneration; the student accepts/corrects/declines as for other artifacts.

## Alternatives considered

| Option | Verdict | Reason |
|---|---|---|
| Scratch `pptx_to_json.py` → agent-edited JSON → serializer | Rejected | Reinvents a solved integration; raw shape/coordinate edits cause overlap and fidelity loss |
| PPTAgent / DeepPresenter (`icip-cas/PPTAgent`, MIT) as website engine | Deferred | Best research-backed edit/review loop, but the skill targets Claude Code/Codex/OpenCode and requires Linux/WSL or macOS + Python/uv/LibreOffice; DeepPresenter v1.1.38 (MCP, offline PPTX export) is a future local-model option |
| Codex Slides (`nexu-io/codex-slides`, MIT) export | Rejected | 45 English templates and 38 MCP tools, but PPTX export is full-slide images today (editable shapes on roadmap) |
| SlideLab | Rejected | Code not publicly released at research time |
| Hand-author dozens of templates | Rejected | Small English-only manifest from Presenton built-ins is sufficient for the first test |

## Limits and non-goals

- English templates only, at most 12 entries. Presenton built-ins are Apache-2.0; any dataset-derived template must be CC0/CC BY. No `ppt4web`/`lusana` corpora.
- Self-hosted Presenton must mount its `/app_data` volume at the host directory given by `STUDYAI_ARTIFACTS_DIR` (default `data/artifacts`); otherwise the renderer's returned path is not readable locally.
- Course-native figure extraction is deferred: Document Intelligence extracts text only, not images.
- AI raster illustration is a labelled last resort; every image needs alt text, attribution and a rendered visual check.
- No claim that generated decks improve learning outcomes without a learner study.

## Verification

`npm run verify` (tsc, vitest, Playwright) with output quoted in `docs/verification/2026-11-23-slide-deck-verification.md`; `npm run benchmark:canvas` with four quoted gate numbers if the Tutor prompt/model path changes; graph check before each commit (`gitnexus detect_changes`, re-run until clean). The GitNexus index in this worktree is 101 commits behind and does not resolve the edited symbols, so callers were confirmed by text search per the UNKNOWN rule.
