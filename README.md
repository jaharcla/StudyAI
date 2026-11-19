# StudyAI

Local-first, single-user study workspace with course and lesson management, a scientific canvas, document search, adaptive review, and an AI Tutor.

## Requirements

- Node.js 22 or newer and npm.
- The current `.env.example` configures Groq; provide a `GROQ_API_KEY` to use that default. Groq receives Tutor prompt context and, when Canvas analysis is requested, canvas input including OCR image crops.
- For local AI, install Ollama and pull the configured model, then select Ollama in `.env`.

Python is not required to run the app.

## Run locally

In PowerShell:

```powershell
npm ci
if (!(Test-Path .env)) { Copy-Item .env.example .env }
npm run dev
```

Open `http://127.0.0.1:5183`. Keep API keys in `.env`; do not edit `.env.example` with local secrets.

The current `.env.example` sets `TUTOR_PROVIDER=groq`, `CANVAS_INFERENCE_PROVIDER=groq`, and `CANVAS_OCR_PROVIDER=groq`. Groq mode requires `GROQ_API_KEY` and does not fall back to Ollama. To use local inference, set `TUTOR_PROVIDER=ollama`, `CANVAS_INFERENCE_PROVIDER=ollama`, and `CANVAS_OCR_PROVIDER=local`; the default Ollama model is `qwen3:latest`. The Tutor also supports `TUTOR_PROVIDER=auto`, which selects Groq when a key is present and can fall back to Ollama after a Groq failure.

`GOOGLE_FACT_CHECK_API_KEY` is optional; it enables published-claim searches through Google's Fact Check Tools API when the Tutor uses Groq. Those requests send the search query to Google and do not establish a claim as true or false.

## Data and services

- SQLite database: `data/studyai.sqlite`.
- Imported files: `data/documents/`.
- The web app, CopilotKit runtime, data API, and LangGraph agent bind to loopback. Default ports are 5183, 8210, 8211, and 8133.
- Supported document imports: PDF, DOCX, PPTX, and UTF-8 TXT. Search is lexical; scanned-PDF OCR is not included.

## Checks

```powershell
npm run build
npm test
npx playwright install chromium
npm run test:e2e
```

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Current status and limitations](docs/STATUS.md)
- [Document intelligence](docs/DOCUMENT_INTELLIGENCE.md)
- [Adaptive learning](docs/ADAPTIVE_LEARNING.md)
- [Historical integration verification](docs/INTEGRATION_VERIFICATION.md)
