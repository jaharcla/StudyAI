# StudyAI

![Node.js](https://img.shields.io/badge/node-%3E%3D22-brightgreen) ![License: MIT + Commons Clause](https://img.shields.io/badge/license-MIT%20%2B%20Commons%20Clause-blue)

A study workspace that keeps your notes on your machine. Bring course documents, handwritten diagrams, and review into one place — with an AI tutor that can run locally or through a provider you configure.

## What's inside

- **Course workspace** — organize courses and lessons, with notes and imported documents.
- **Scientific canvas** — sketch diagrams and math on a revision-tracked canvas, with reviewable AI edit proposals.
- **Document search** — import PDF, DOCX, PPTX, and UTF-8 TXT, then search across your material.
- **Adaptive review** — keep your review queue tied to what you're studying.
- **AI tutor** — asks about your course material and canvas, with bounded context and provider calls.

## Quick start

Requires Node.js 22 or newer and npm. Python is not required.

```powershell
git clone https://github.com/jaharcla/StudyAI.git
cd StudyAI
npm ci
if (!(Test-Path .env)) { Copy-Item .env.example .env }
npm run dev
```

Open <http://127.0.0.1:5183>. Keep API keys in `.env`; never put secrets in `.env.example`.

The default `.env.example` is configured for a cloud provider and needs a `GROQ_API_KEY`. To keep everything on your machine, install Ollama, pull the configured model, and switch the provider settings. See [Configuration](docs/CONFIGURATION.md) for the options.

## Privacy

StudyAI is single-user and stores its data locally. With the default configuration, tutor prompts — and canvas image crops when analysis is requested — are sent to the configured provider. Choosing local inference keeps those requests on your machine. See [Configuration](docs/CONFIGURATION.md#privacy-and-data-flow) and [Status and limitations](docs/STATUS.md) for the details.

## Checks

```powershell
npm run build
npm test
npx playwright install chromium
npm run test:e2e
```

## Documentation

- [Configuration](docs/CONFIGURATION.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Current status and limitations](docs/STATUS.md)
- [Document intelligence](docs/DOCUMENT_INTELLIGENCE.md)
- [Adaptive learning](docs/ADAPTIVE_LEARNING.md)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Small changes and clear issue reports are welcome.

## License

MIT + Commons Clause — see [LICENSE](LICENSE). The Commons Clause removes the right to sell the software.
