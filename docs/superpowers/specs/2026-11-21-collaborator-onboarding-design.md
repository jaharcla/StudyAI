# StudyAI collaborator onboarding — design

## Intent and why

StudyAI was built because existing study tools did not have interactive visual parts that matched how the author learns, and because learning should not require a subscription. It is now a substantial, working project that the author does not want to see go to waste. The author is not a strong programmer and does not want to manage or direct a team; they want two or three people they can talk to about the vision, who then own pieces of the work.

The blocker is not a lack of places to post. It is that a stranger currently has no legal permission to contribute (no LICENSE), no entry point (no CONTRIBUTING guide, no scoped tasks), and no story for why the project exists (README is setup-only). The public repo `github.com/jaharcla/StudyAI` has 0 stars, 0 forks, 0 watchers, and 57 commits.

## Vision, in the author's words

> StudyAI is a tool built for students to communicate with their work. Instead of having your notebook, your canvas app, your Gemini Notebook, and your general AI, what if it was all in one place? Our goal is to provide students with all the tools necessary to visualize and learn hard concepts. I built it because all the AI tools I used did not have interactive visual parts for studying that worked with how I learned, and I didn't want to pay a subscription to learn.

## Goals

1. Make contributing legally and practically possible for a stranger.
2. Establish two or three self-owned lanes so the author does not direct day-to-day work.
3. Produce drafted outreach the author approves before anything public goes out.
4. Record the vision and boundaries in the repo so future sessions and agents stay consistent.

## Non-goals

- No product code changes.
- No marketing campaign, rebrand, or hiring process.
- No automatic posting, issue creation, PR replies, or messages.
- No spending on metered tools without explicit consent.

## Anti-goals (failure even if it technically works)

- A pile of drive-by PRs the author now has to manage.
- Public claims about features that do not exist in the current source.
- Sending study data, `.env`, tokens, or local paths to an open-world tool.
- Publishing outreach under the author's name without a reviewed draft and explicit approval.

## Constraints

- Hands-off is a preference, not just a convenience: the author will not assign tickets or review deep code.
- The codebase is deep and specialized (canvas intelligence, provider chains, benchmark gates, 300+ tests). Starter tasks must be small and well described.
- Local-first, single-user; no multi-user auth. Anything implying hosted/multi-user service is false.
- MIT + Commons Clause license (no right to sell the software), chosen by the author on 2026-11-21 as a revision to the earlier plain-MIT decision.
- Project rules: GitNexus `detect_changes` before commits; no suppression to make code compile; verification evidence before claiming done; no secrets in docs or tool arguments.
- Money rule: `treg` bills per catalog call; state the price from `catalog_get` and get consent above one cent. `exa`/`firecrawl` consume credits. Built-in web search is free and preferred first.

## Approaches considered

1. **Post and wait** — add docs and issues, then post publicly and let people self-select. Closest to the author's instinct, but the repo has zero audience and no legal permission, so this most likely produces silence.
2. **Recruit 2–3 lane owners after packaging** — chosen. Same packaging, plus personal outreach to named people and one short call per person; the author keeps the vision, each person owns a lane.
3. **One technical peer / co-pilot** — biggest relief but hardest to find and implies shared ownership; keep as a later option, not this effort.

Approach 2 is chosen, with approach 1's packaging done first. A community is the end state; it has to be seeded with two or three people.

## Decisions made here (the author's calls are listed separately)

- MIT + Commons Clause at the repo root. Holder `jaharcla` (confirmed by the author).
- Short `CONTRIBUTING.md`; the existing README already covers local setup.
- Vision recorded in `docs/VISION.md`; a persistent `docs/OUTREACH.md` holds the brief, lanes, and boundaries.
- Starter issues, public post drafts, and personal note drafts live as **local files under `docs/outreach/`** until the author approves each one.
- The "lane" the author is happy to hand off defaults to **plumbing**: provider integrations, benchmark harnesses, CI, OCR/CLIP internals, canvas-recognition machinery. The author keeps the learning experience, look and feel, and vision. This was proposed as a default, not stated by the author — confirm it.

## Left to the builder

Write the files described in the linked plan, verify every factual claim against the current README/STATUS, show the author every public-facing draft, and do not commit or publish until the author approves.
