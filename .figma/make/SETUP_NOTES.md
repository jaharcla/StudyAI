# Initial import setup notes

## Bootstrap

- Reused the repository's pinned npm dependencies and existing `scripts/dev.ts`
  multi-service launcher rather than adding an overlapping process manager.
- The imported manifest directly includes Windows-only esbuild and Rollup
  binaries. Linux bootstrap therefore runs `npm ci --force`; Vite's normal
  Linux platform packages remain installed and the verified dev server starts.
- No environment-variable names are required for startup. Ollama uses its
  documented local default; Groq, LangSmith, and Google Fact Check credentials
  are optional.

## Deployment

- Deploy preview is explicitly skipped because the application requires the
  Node data/runtime services and LangGraph agent; a static artifact cannot
  preserve the primary experience.
- Production deploy is intentionally not configured for the same reason. The
  Vite frontend can build to `dist`, but publishing it with the available
  static adapter would leave `/api` routes unavailable.
- A future deploy setup needs a supported multi-service hosting approach for
  the frontend, Node services, LangGraph agent, and persistent local data.
