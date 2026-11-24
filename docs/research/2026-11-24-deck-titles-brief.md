# Deck title cleanup

Evidence: mock student rerun, screenshots run1-05 and run2-05. Decks generate with `6 slides · 5 cited sources` and openable citations, but slide headings still read raw course filenames like `c120-module5`. The student asked for a presentation about Quantum theory, not a file name.

## Scope

- `server/presentations/compile.ts`, `server/presentations/service.ts`, `server/presentations/templates.ts`
- `server/artifact-intelligence/service.ts` only where it builds the slide_deck component title/objective
- `tests/slide-deck-*.ts`, `tests/e2e/artifacts-page.spec.ts`.

## What to fix

- Use a human title derived from the lesson objective or the slide claim, not the imported document filename.
- Keep the source chip with the real filename and page so provenance stays intact.
- No `as any`, no new dependency, no new provider, no PPTX committed. Keep the single citation grammar and claim containment.

## Verification

- Unit test that a slide title never equals a raw filename when an objective exists.
- Playwright assertion on the artifacts viewer showing the human title and the source chip.
- Quote `npm run verify`; inline critique with three objections.

## Constraints

- Do not touch App.tsx, src/coach, src/canvas, learning, or Studio surfaces.
- Work only in this worktree; commit to `work/fix-deck-titles-20261124` with the Discord link from the round-two brief.
- Native execution only: no subagents, no Groq-hosted models, no paid services. Ports: WEB_PORT=5452, RUNTIME_PORT=8493, DATA_PORT=8494, AGENT_PORT=8392.
