# StudyAI

Local single-user study workspace. Requires Node.js 20+ and Ollama for AI tutoring.

```powershell
npm run setup
npm run dev
```

Open `http://127.0.0.1:5173`. Configure `OLLAMA_MODEL` in `.env.example` or copy it to `.env` and restart. Pull the model separately with Ollama. The app stores data under `data/`.

Run checks with `npm run build` and `npm test`. Browser tests: `npx playwright install chromium`, then `npm run test:e2e`.
