# StudyAI architecture

StudyAI is a local-first, single-user React and TypeScript app. `npm run dev` starts four loopback services:

| Service | Default address | Role |
| --- | --- | --- |
| Vite | `127.0.0.1:5183` | Workspace UI |
| CopilotKit Runtime | `127.0.0.1:8210` | UI-to-agent transport |
| Data API | `127.0.0.1:8211` | SQLite, documents, learning, and canvas APIs |
| LangGraphJS | `127.0.0.1:8133` | Tutor graph |

Ports and provider settings are read from `.env`; defaults are in `.env.example`. The database is `data/studyai.sqlite`, and imported files default to `data/documents/`. `STUDYAI_DB` and `STUDYAI_DOCUMENTS` can override those paths.

## AI providers

The current `.env.example` sets `TUTOR_PROVIDER=groq`, which requires `GROQ_API_KEY` and does not fall back to Ollama. Set `TUTOR_PROVIDER=ollama` to force local inference. The Tutor also supports `auto`: it selects Groq when a key is configured, otherwise Ollama, and can fall back to Ollama after a failed Groq request. Tutor context, completion size, request count, and Groq cost are bounded by configuration.

Canvas analysis has separate settings. `CANVAS_INFERENCE_PROVIDER` and `CANVAS_OCR_PROVIDER` accept `auto`, `groq`, `opencode-go`, `openrouter`, or local modes. `auto` uses `CANVAS_PROVIDER_CHAIN` (default `groq,opencode-go,openrouter`) and skips providers with no key. OpenCode Go and OpenRouter have daily request caps to bound usage. Explicit provider modes are single-provider and do not fall back. Model interpretations remain uncertain evidence and canvas edits require user approval.

Stroke recognition runs inside Node. `CANVAS_RECOGNITION=off|baseline|clip|auto` selects the deterministic geometry baseline, an ONNX CLIP adapter, or automatic fallback. CLIP weights are cached under `CANVAS_MODEL_CACHE` (default `data/models`) and downloaded only when enabled; no Python runtime is required. Few-shot examples are stored per course in SQLite.

Pure-ink math boards are cropped as one whole expression and transcribed through the LaTeX OCR profile. Provider order is `gemini` (Google AI Studio, when `GOOGLE_AI_API_KEY` is set) → `openrouter` → `groq`; OpenCode Go is explicit-only for equations. Gemini free-tier requests are serialized at 15/minute with 429/503 retries. Mixed/diagram boards keep grouped crops bounded by `CANVAS_OCR_MAX_REGIONS`.

The Tutor's optional Google Fact Check tool is available when the Tutor is using Groq and `GOOGLE_FACT_CHECK_API_KEY` is configured. It returns published ClaimReview assessments; a match is not an independently verified verdict.

Groq and Google are remote services. Tutor prompts and requested Canvas analysis input (including OCR image crops) can leave the machine for Groq; Fact Check searches send their query to Google. Workspace data otherwise stays in local storage, and app services bind to loopback. The app does not provide multi-user authentication.

## Documents and learning

Document Intelligence extracts text from PDF pages, DOCX paragraphs, PPTX slides, and UTF-8 TXT. It stores document metadata and lexical FTS5 indexes in SQLite. Search and Tutor retrieval are course-scoped; PDF citations link to their source page. Scanned PDFs are not OCR'd, and document images and visual meaning are not extracted.

Adaptive learning uses reviewed questions, BKT mastery updates, and FSRS scheduling. Learning activities use registered, bounded capabilities and deterministic checks where available. See [Document Intelligence](DOCUMENT_INTELLIGENCE.md) and [Adaptive learning](ADAPTIVE_LEARNING.md).

## Canvas

Quickdraw drawings and structured scientific objects are saved as course- and lesson-scoped boards. Canvas analysis keeps native observations separate from OCR and model interpretations, validates source IDs and revisions, and rejects stale writes or proposals. The Tutor may inspect the active canvas and propose edits; the user applies them explicitly. Freehand handwriting interpretation is limited and uncertain.

A derived, revision-bound scene graph exposes nearby/overlapping spatial relations and revision-scoped text search to the Tutor through `get_canvas_scene` and `search_canvas_evidence`. The graph is rebuilt from the persisted snapshot and never stored in `CanvasDocument` or used to bypass approval.
