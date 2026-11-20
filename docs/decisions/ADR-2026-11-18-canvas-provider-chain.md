# ADR: Canvas provider chain — Groq first, OpenCode Go and OpenRouter fallback

Status: accepted for implementation.

## Decision

Canvas analysis uses an ordered provider chain, not a single provider:

`groq → opencode-go → openrouter`

- **Groq is primary.** It keeps normal StudyAI use off the OpenCode allowance.
- **OpenCode Go** is the first fallback and the explicit deep-analysis provider. It is capped at `CANVAS_OPENCODE_GO_MAX_REQUESTS_PER_DAY` (default 20) to bound usage.
- **OpenRouter** is the second fallback and the manual model-comparison route. It is capped at `CANVAS_OPENROUTER_MAX_REQUESTS_PER_DAY` (default 50).
- **Ollama is opt-in only.** It is not in the default chain, and the local structure model proved too slow on this machine (a trivial structured call took 83 s).
- **Deterministic observations and local CLIP recognition are always on** and never consume provider quota.

`CANVAS_INFERENCE_PROVIDER` and `CANVAS_OCR_PROVIDER` accept `auto`, `groq`, `opencode-go`, `openrouter`, or `local`/`ollama`. An explicit provider is single-provider and does not silently fall back; `auto` uses the chain.

## Verified before adoption

- OpenCode Go is OpenAI-compatible at `https://opencode.ai/inference/go/openai/v1`, requires `x-opencode-session` (any UUID accepted), and returned 200 for text, JSON mode, and a vision request.
- OpenCode Go vision read a rendered `F = 5 N` crop as `F`, `=`, `5`, `N` in ~3 s.
- OpenCode Go `qwen3.8-flash` returned JSON mode in ~1.6 s and is priced at $0.15/$0.47 per million tokens.
- The full Canvas Intelligence pipeline completed through OpenCode Go in 26.7 s, including recognition evidence and structure observations.
- Groq remains primary in `auto` mode; a transient Groq OCR failure fell back to OpenCode Go and was recorded as a warning.

## Reasons

- A single provider is a single failure point. Groq rate limits and model availability have already caused partial or failed analyses.
- OpenCode Go is a strong fallback with vision and JSON support, but using it for every analysis would burn the user's allowance.
- OpenRouter provides a broad model catalog and a standard API without adding another subscription.
- Free alternatives were evaluated:
  - GitHub Models is retired (July 30, 2026).
  - GitHub Student Pack provides Azure credit and Camber GPU hours, not permanent inference hosting.
  - Cloudflare Workers AI (10,000 neurons/day) and Google AI Studio (Gemini Flash-Lite 500 RPD) are viable free fallbacks but are not configured yet.
  - Oracle Always Free is a 2 OCPU/12 GB ARM VM, suitable for ONNX perception, not a fast VLM.

## Limits

- Chain order is configurable with `CANVAS_PROVIDER_CHAIN`; unknown provider names are rejected.
- `auto` skips providers with no configured key.
- Fallbacks are recorded in analysis warnings and `AI_DIAGNOSTICS=1` logs.
- Budget counters are in-memory and reset at UTC midnight; they reset on process restart.
- No canvas content is sent to a provider unless that provider is configured and selected.
- Keys live in `.env` only: `GROQ_API_KEY`, `OPENCODE_GO_API_KEY`, `OPENROUTER_API_KEY`.
- The recognition adapter and evidence contract are unchanged.

## Verification

- Unit tests cover chain parsing, explicit-provider isolation, Groq → OpenCode Go fallback, OCR fallback, session/JSON headers, and daily budget handoff.
- Live checks cover OpenCode Go text, JSON, vision OCR, and the full analysis pipeline.
- `GET /api/canvas-providers` reports the active chain and remaining daily budgets without exposing keys.
