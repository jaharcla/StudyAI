# Configuration

All settings live in `.env`. Start from `.env.example` and keep real keys in `.env`, which is gitignored. Every value below has a commented example in `.env.example`; that file is the authoritative list.

## Providers

Tutor and canvas inference are configured separately:

- `TUTOR_PROVIDER` — `groq`, `auto`, `ollama`, `omniroute`, `opencode-go`, `openrouter`, or `gemini`. Explicit modes never fall back; `auto` selects Groq when a key is present and can fall back after a Groq failure.
- `CANVAS_INFERENCE_PROVIDER` and `CANVAS_OCR_PROVIDER` — default to `auto`, which follows `CANVAS_PROVIDER_CHAIN` (`groq,opencode-go,openrouter,gemini`). Ollama is opt-in and is not in the default chain.
- `CANVAS_MATH_OCR_PROVIDER` — empty means the automatic math chain (Gemini, OpenRouter, OpenCode Go, Groq).

The local Ollama defaults are `OLLAMA_BASE_URL=http://127.0.0.1:11434` and `OLLAMA_MODEL=qwen3:latest`. To run fully locally, set `TUTOR_PROVIDER=ollama`, `CANVAS_INFERENCE_PROVIDER=ollama`, and `CANVAS_OCR_PROVIDER=local`. Groq mode needs `GROQ_API_KEY` and does not fall back to Ollama.

Provider budgets, concurrency, timeouts, and model context limits are also configurable in `.env.example`; keep them there rather than editing source.

## Optional fact checking

`GOOGLE_FACT_CHECK_API_KEY` enables published-claim searches through Google's Fact Check Tools API when the Tutor uses Groq. Those requests send the search query to Google and do not, by themselves, establish whether a claim is true or false. Treat returned ratings as evidence to review.

## Ports and local data

The web app, runtime, data API, and LangGraph agent bind to loopback on these defaults:

| Service | Port | Setting |
| --- | --- | --- |
| Web app | 5183 | `WEB_PORT` |
| Runtime | 8210 | `RUNTIME_PORT` |
| Data API | 8211 | `DATA_PORT` |
| Agent | 8133 | `AGENT_PORT` |

Local data lives under `data/`: `data/studyai.sqlite` for the database and `data/documents/` for imported files. Canvas models are cached in `data/models`. The entire `data/` directory is gitignored.

There is no hosted multi-user service and no authentication; do not expose these ports beyond your machine.

## Privacy and data flow

- Local inference (Ollama, or a local OpenAI-compatible gateway) keeps prompts and canvas crops on your machine.
- Configuring a cloud provider means tutor prompts — and, when canvas analysis is requested, OCR image crops — are sent to that provider.
- Optional Google Fact Check searches send a query string to Google.
- API keys stay in `.env`. Never commit them or paste them into issues.

See [Status and limitations](STATUS.md) for current provider limits and known failure modes.
