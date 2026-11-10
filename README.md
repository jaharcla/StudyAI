# StudyAI
Studying with AI

Local single-user study workspace. Requires Node.js 22+ and either a Groq API key or Ollama for AI tutoring.

```powershell
npm run setup
npm run dev
```

Open the URL printed by the development command. Copy `.env.example` to `.env`, set `GROQ_API_KEY`, and use `TUTOR_PROVIDER=groq` to run without an Ollama fallback. Alternatively, set `TUTOR_PROVIDER=ollama`, configure `OLLAMA_MODEL`, and pull that model locally. The app stores data under `data/`.

Run checks with `npm run build` and `npm test`. Browser tests: `npx playwright install chromium`, then `npm run test:e2e`.
