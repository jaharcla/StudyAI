# Visual directions — owner decision

Three static, self-contained mockups of the same StudyAI shell: sidebar, lesson home, canvas with Tutor dock, and the single Coach prompt. Same content in every direction so the comparison is about the visual world, not the copy. No winner is declared.

Open each HTML file directly in a browser. No server, no JS, no network fonts. The two bundled WOFF2 files under `assets/fonts/` are referenced by relative path.

| # | File | World in one line |
|---|---|---|
| 1 | `direction-1-quiet-scholarly.html` | Paper, ink, one terracotta accent; Literata headings, DM Sans UI |
| 2 | `direction-2-immersive-studio.html` | The board owns the screen; navigation and Tutor float |
| 3 | `direction-3-cool-ledger.html` | Cool, exact, evidence-first; teal reserved for state |

Each HTML file carries its own rationale (says / suits / cost / reuse / motion / honest risk) at the top.

## Screenshots

`capture.mjs` renders each of the four `.surface` artboards at 1440×900 with the global native Playwright install. Files in `screenshots/`, in upload order:

1. `direction-1-01-sidebar.png`
2. `direction-1-02-lesson-home.png`
3. `direction-1-03-canvas-tutor.png`
4. `direction-1-04-coach-prompt.png`
5. `direction-2-01-sidebar.png`
6. `direction-2-02-lesson-home.png`
7. `direction-2-03-canvas-tutor.png`
8. `direction-2-04-coach-prompt.png`
9. `direction-3-01-sidebar.png`
10. `direction-3-02-lesson-home.png`
11. `direction-3-03-canvas-tutor.png`
12. `direction-3-04-coach-prompt.png`

Direction 2 surface 1 shows the slide-over navigation **open**; surfaces 2–4 show it closed. Direction 2 surface 3 shows the Tutor card with its reserved column, so no board object sits under it.

## Tradeoffs at a glance

- **Quiet scholarly** — strongest warmth and reading comfort; reuses `src/schemes/quiet-scholarly.css` almost verbatim. Risks reading conservative; warm paper makes dark mode and contrast real work. The incumbent `--ink-3` was too light on paper and was darkened in this mockup.
- **Immersive studio** — best for sketch-heavy work and an uninterrupted board; reuses `src/schemes/immersive-real.css`. Highest maintenance cost: every new panel must negotiate the same floating space, and the incumbent already shipped a Tutor-panel-over-board bug.
- **Cool ledger** — makes grounding and citation visible without decoration; reuses the neutral base in `src/styles.css`, `Citation.tsx`, `.science-result` and `coach.css`. Least expressive; warmth must come from type and spacing, not colour.

## Inline critique — three strongest objections

1. **All three keep a docked or floating Tutor column**, so the board still loses about a quarter of its width. A future direction could make the Tutor a true side sheet that only appears on demand; I kept the column because it is the product's current truth and the brief asked for variations of that shell.
2. **Direction 2's slide-over hides the navigation**, which weakens scanability on an Operate surface. It is shown open in surface 1 precisely so the owner can judge that cost; `FRONTEND_DESIGN_PRINCIPLES.md` puts scanability above expression.
3. **These are static captures**, so the one authored motion moment per direction is described in prose rather than demonstrated. Motion is part of the brief's pleasure, and a still image cannot prove timing, interrupts or reduced-motion behaviour.

## Constraints honoured

No product source edits, no `DESIGN.md`, no commits, no subagents, no Groq models, no paid services. Work confined to this worktree. Lesson prose is labelled illustrative in the mockups; demo course and board names come from the product's own evidence.
