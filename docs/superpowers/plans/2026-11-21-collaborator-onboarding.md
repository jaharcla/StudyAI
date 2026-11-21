# StudyAI collaborator onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make StudyAI legally and practically joinable, and produce a reviewed set of local drafts for outreach, without publishing or changing product code.

**Architecture:** Documentation-only work in five layers: the legal door (LICENSE + CONTRIBUTING), the story (VISION + OUTREACH brief), scoped starter issues, public post drafts, and personal note drafts. Everything public stays as a local file until the author approves it. GitHub search and built-in web search come first; metered tools (treg/exa/firecrawl) require explicit consent before use.

**Tech Stack:** Markdown and plain text, PowerShell verification commands, existing GitHub MCP (read), built-in web search, optional MCPs added only after approval.

**Spec:** `docs/superpowers/specs/2026-11-21-collaborator-onboarding-design.md`

## Global Constraints

- MIT license, approved by the author on 2026-11-21. Copyright holder defaults to `jaharcla` and is confirmed with the author in Task 1.
- Do not modify product code, configuration, dependencies, or `.env.example`.
- Do not create GitHub issues, reply to PRs, post to any site, or send any message. All public text is a local draft until the author explicitly approves it.
- Do not put `.env` contents, API keys, PATs, `data/studyai.sqlite` contents, or real local user paths in any draft or tool argument.
- `treg` spend is pre-approved by the author up to a **$4.91 cap** (2026-11-21). No per-call price gate is needed, but track cumulative spend and stop before exceeding the cap. `exa`/`firecrawl` consume credits; built-in web search is free and is the default.
- GitNexus `detect_changes` must be clean before any commit (`partial: true` or `truncated: true` is not clean).
- Do not report "done" without quoting actual verification output.
- No `@ts-ignore`, `@ts-nocheck`, `as any`, or `as never` (no code is expected, but the rule stands).

## Review Focus

| Risk | Behavior expected | Test that pins it | Owner |
| --- | --- | --- | --- |
| A public action happens before approval | No issue, post, PR reply, or message is created without a reviewed draft and explicit "yes" | Verification step: no write tool invoked; all public text still exists only under `docs/outreach/`; GitHub read check shows no new issue with the draft titles | Task 7 |
| Secrets or study data leak into drafts or an open-world tool | Zero API keys, tokens, DB contents, or local paths in any file | `rg -n -i "GROQ_API_KEY\|GOOGLE_FACT_CHECK_API_KEY\|GITLAB_TOKEN\|PAT\|data/studyai.sqlite\|C:\\\\Users" ...` returns no matches | Tasks 2, 4, 5, 7 |
| Public copy claims features that do not exist | Every product claim is traceable to README or STATUS "Implemented" | Forbidden-claim grep plus a claim-to-source table in each post draft | Task 4 |
| A starter issue describes an already-fixed bug or a wrong location | Each draft cites the exact current file and line proving it is still open | Each issue draft carries a `Source: path:line` line, read and confirmed during the task | Task 3 |
| LICENSE has wrong holder or terms | MIT text, correct year, holder name confirmed by author | `Get-Content LICENSE -TotalCount 3` plus author confirmation | Task 1 |

---

### Task 1: Legal door — LICENSE and CONTRIBUTING

**Files:**
- Create: `LICENSE`
- Create: `CONTRIBUTING.md`

**Interfaces:**
- Consumes: author's explicit "MIT license" approval; GitHub remote owner `jaharcla` from `git remote -v`.
- Produces: `LICENSE` (exact MIT text), `CONTRIBUTING.md` (short, contributor-facing).

- [ ] **Step 1: Confirm the copyright holder with the author**

Run: `git remote -v` in the project root.
Expected: `origin https://github.com/jaharcla/StudyAI.git`.
Ask the author: "MIT with copyright holder `jaharcla`, 2026 — correct?" Use their answer verbatim in LICENSE. Do not guess a real name.

- [ ] **Step 2: Write `LICENSE`**

Standard MIT text, year `2026`, holder from Step 1. No custom clauses.

- [ ] **Step 3: Write `CONTRIBUTING.md`**

Content, in this order, one page maximum:
1. One-line thanks and the aim ("small, well-described changes are welcome").
2. Local setup: point to the existing README commands; do not duplicate them.
3. How to pick work: "look for issues labelled `good first issue`; comment before starting so two people don't collide."
4. How to submit: fork, branch, `npm run verify`, open a PR describing what changed and why.
5. What to expect: a welcome reply and a first-PR response within a day; imperfect English is fine.
6. Boundaries: local-first and single-user; no hosted service; no study data in issues or PRs.

- [ ] **Step 4: Verify**

Run: `Get-Content LICENSE -TotalCount 3`
Expected: `MIT License`, `Copyright (c) 2026 <confirmed holder>`, `Permission is hereby granted, free of charge, to any person obtaining a copy`.
Run: `rg -n -i "GROQ_API_KEY|GITLAB_TOKEN|data/studyai.sqlite|C:\\\\Users" LICENSE CONTRIBUTING.md`
Expected: no output.

- [ ] **Step 5: Report, do not commit**

Run: `git status --short LICENSE CONTRIBUTING.md`
Expected: both files listed as untracked. Report them to the author in the review set.

---

### Task 2: The story — VISION and OUTREACH brief

**Files:**
- Create: `docs/VISION.md`
- Create: `docs/OUTREACH.md`

**Interfaces:**
- Consumes: author's verbatim brief in the spec, the approved design's goals/non-goals/anti-goals.
- Produces: `docs/VISION.md` (public-facing story), `docs/OUTREACH.md` (private working brief used by Tasks 3–6).

- [ ] **Step 1: Write `docs/VISION.md`**

Use the author's brief as the opening block quote, unchanged except for spelling corrections. Then add three short sections: "What it is today" (copy only from README/STATUS Implemented list, with links), "Why it exists" (interactive visual studying that matches how the author learns; no subscription), and "Where it's going" (one paragraph, framed as an open invitation, not a roadmap promise). End with: "If this sounds like something you'd like to help build, say hello — there's room to own a piece of it."

- [ ] **Step 2: Write `docs/OUTREACH.md`**

Include exactly: the verbatim brief; the goals, non-goals, anti-goals and constraints from the spec; the chosen approach (2–3 lane owners after packaging); the default hand-off lane ("plumbing": provider integrations, benchmark harnesses, CI, OCR/CLIP internals, canvas-recognition machinery) marked **proposed default, author to confirm**; the author's kept areas (learning experience, look and feel, vision); the rule "drafts only, no public action without explicit approval"; the money rules for treg/exa/firecrawl; and a table of decisions with dates. Mark it private working notes, not for publication.

- [ ] **Step 3: Verify**

Run: `rg -n -i "GROQ_API_KEY|GOOGLE_FACT_CHECK_API_KEY|GITLAB_TOKEN|PAT|data/studyai.sqlite|C:\\\\Users" docs/VISION.md docs/OUTREACH.md`
Expected: no output.
Run: `Get-Content docs/OUTREACH.md | Select-String "proposed default, author to confirm"`
Expected: one match.

- [ ] **Step 4: Report, do not commit**

Run: `git status --short docs/VISION.md docs/OUTREACH.md`

---

### Task 3: Starter issue drafts

**Files:**
- Create: `docs/outreach/issues/issue-1-spatial-index-recall.md`
- Create: `docs/outreach/issues/issue-2-provider-disclosure.md`
- Create: `docs/outreach/issues/issue-3-browser-test.md`

**Interfaces:**
- Consumes: `docs/OUTREACH.md` (boundaries), current source and `PROGRESS.md` items 5–6, `STATUS.md` limits.
- Produces: three issue drafts, each with title, problem, "done" criteria, difficulty, and a `Source: path:line` line.

- [ ] **Step 1: Verify each candidate is still open before writing**

Read `PROGRESS.md` item 5 (the 256-node blind spot in `CanvasGridSpatialIndex.insert`), `STATUS.md` line 20 (no provider disclosure/opt-out yet), and the current canvas e2e tests. For each candidate, record the exact file path and line number that proves it is still open. If any candidate is already fixed, replace it with another small task from `STATUS.md` Limits and record that source instead. Do not invent a bug.

- [ ] **Step 2: Write the three drafts**

Each file: a short title; a 3–5 sentence problem statement a newcomer can understand; 2–4 bullet "done" criteria; a `Difficulty: small` line; a `Source: path:line` line from Step 1; and a `Status: DRAFT — not published` line. For the provider-disclosure issue, state the boundary explicitly: UI only, no provider behaviour changes, no lowering of caps or thresholds (canvas invariants).

- [ ] **Step 3: Verify**

Run: `rg -n "^Source:|^Status: DRAFT|^Difficulty:" docs/outreach/issues`
Expected: one of each per file (six lines total across three files).
Run: `rg -n -i "GROQ_API_KEY|GITLAB_TOKEN|data/studyai.sqlite|C:\\\\Users" docs/outreach/issues`
Expected: no output.

- [ ] **Step 4: Report, do not commit**

Run: `git status --short docs/outreach/issues`

---

### Task 4: Public post drafts and demo shot list

**Files:**
- Create: `docs/outreach/posts/show-hn.md`
- Create: `docs/outreach/posts/reddit.md`
- Create: `docs/outreach/posts/devto.md`
- Create: `docs/outreach/demo-shot-list.md`

**Interfaces:**
- Consumes: `docs/VISION.md`, README, `STATUS.md` Implemented list.
- Produces: three post drafts plus a shot list for a 60–90 second demo the author will record.

- [ ] **Step 1: Build a claim-to-source table**

In `show-hn.md` (and copy into the other two), add a short table at the bottom: each product claim in the post mapped to `README.md:line` or `docs/STATUS.md:line`. Remove any claim with no source.

- [ ] **Step 2: Write the three drafts**

Show HN: title under 80 characters, 3–4 short paragraphs, direct link to the repo, explicit ask at the end pointing at the three starter issues. Reddit (`r/SideProject` / `r/opensource`): same substance, less hype, no "please star". dev.to: slightly longer, with the vision block quote and a "how to help" section. All three end with the same line: "I'm looking for two or three people to own a piece — here are three starter tasks."

- [ ] **Step 3: Write `demo-shot-list.md`**

Six to eight shots: launch, a course/lesson, the canvas with a worked concept, a document search, adaptive review, the AI tutor, and a closing card with the repo URL. Note that the author records and edits the video; we only produce the list and, if asked, verify the app path with Playwright.

- [ ] **Step 4: Verify**

Run: `rg -n -i "multi-user|hosted|cloud sync|scanned PDF OCR is supported|free forever" docs/outreach/posts`
Expected: no output.
Run: `rg -n "claim-to-source|Source|README.md:|STATUS.md:" docs/outreach/posts/show-hn.md`
Expected: each claim in the post has a source row.
Run: `rg -n -i "GROQ_API_KEY|GITLAB_TOKEN|data/studyai.sqlite|C:\\\\Users" docs/outreach/posts docs/outreach/demo-shot-list.md`
Expected: no output.

- [ ] **Step 5: Report, do not commit**

Run: `git status --short docs/outreach/posts docs/outreach/demo-shot-list.md`

---

### Task 5: People research and personal note drafts

**Files:**
- Create: `docs/outreach/targets.md`
- Create: `docs/outreach/notes/template.md`
- Create: `docs/outreach/notes/note-01.md` … `note-20.md`

**Interfaces:**
- Consumes: `docs/OUTREACH.md`, `docs/outreach/issues/*`, GitHub MCP (read), built-in web search.
- Produces: 20 named, researched targets and 20 tailored note drafts. No message is sent.

- [ ] **Step 1: Find targets with free tools first**

Using built-in web search and GitHub read tools only, collect 20–30 specific people: contributors to the libraries StudyAI already uses (CopilotKit, LangGraph, QuickDraw, MathLive), authors of local-first/study apps, and people active in relevant subreddits or Discords. Record for each: handle, profile URL, one concrete thing they did, and which lane they'd fit. Skip anyone whose profile requires payment to read.

- [ ] **Step 2: Use treg within the approved cap**

The author pre-approved treg spend up to **$4.91 total** (2026-11-21). Use treg for deeper people-finding if useful, but track cumulative spend and stop before the cap. Prefer free GitHub/web search for the bulk of the list. Record the treg spend and the searches performed in `docs/outreach/targets.md`.

- [ ] **Step 3: Write `template.md` and 20 notes**

Template: one paragraph, four parts — who you are and what you built; a link to the demo/repo; one sentence about *their* work and why it fits; one specific lane and a question ("would you want to own this?"). Plain, no hype, no asks for stars. Each `note-XX.md` fills the template with the target's real detail from Step 1. Every note ends with: "No pressure — if it's not your thing, I'd still love to hear what you think of the idea."

- [ ] **Step 4: Verify**

Run: `Get-ChildItem docs/outreach/notes/note-*.md | Measure-Object | Select-Object -ExpandProperty Count`
Expected: `20`.
Run: `rg -L "would you want to own" docs/outreach/notes/note-*.md`
Expected: no output (every note has the ask).
Run: `rg -n -i "GROQ_API_KEY|GITLAB_TOKEN|data/studyai.sqlite|C:\\\\Users" docs/outreach/targets.md docs/outreach/notes`
Expected: no output.

- [ ] **Step 5: Report, do not commit**

Run: `git status --short docs/outreach/targets.md docs/outreach/notes`

---

### Task 6: Optional MCP options (proposal only)

**Files:**
- Create: `docs/outreach/mcp-options.md`

**Interfaces:**
- Consumes: OpenCode V2 MCP docs (`https://opencode.ai/docs/mcp-servers`), `docs/MCP_AND_PLUGINS.md`.
- Produces: a decision document, no configuration changes.

- [ ] **Step 1: Write the options document**

For each of Gmail/Calendar (OAuth, draft-first), Reddit, Discord, and Buffer: what it would add, the exact OpenCode V2 command pattern (`opencode mcp add <name> --url <url>` for remote OAuth, `opencode mcp add <name> -- npx -y <package>` for local), the sign-in step (`/mcps`), and the risk (open-world egress; drafts-only until approved). State plainly that exact URLs/packages must be verified before adding, and that secrets use `{env:NAME}` and never go into config or chat. Add a line: "GitHub + built-in web search already cover Tasks 3–5; add nothing until the author asks."

- [ ] **Step 2: Verify no config was touched**

Run: `opencode mcp list`
Expected: no new server compared with the list at the start of this task; if the CLI reports a server needing authentication, do not sign in — just record that no MCP was added by this task.

- [ ] **Step 3: Report, do not commit**

Run: `git status --short docs/outreach/mcp-options.md`

---

### Task 7: Final verification, author review, commit

**Files:**
- Read: all files from Tasks 1–6.

**Interfaces:**
- Consumes: every draft from Tasks 1–6.
- Produces: a single review set shown to the author, then (only after approval) one commit.

- [ ] **Step 1: Prove nothing public happened**

Run: `rg -n "gh issue create|call_tool_write|call_tool_destructive|fetch\\(.*POST" docs/outreach docs/VISION.md`
Expected: no output. Confirm with a GitHub **read** check that no issue with any of the three draft titles exists in `jaharcla/StudyAI`. Record the result in the review message.

- [ ] **Step 2: Run the full verification**

Run: `npm run verify`
Expected: quote the complete output, including any e2e failures. If Playwright browsers are missing or tests fail for environmental reasons, say so explicitly — do not claim a pass.

- [ ] **Step 3: Run GitNexus change analysis**

Run: `node .gitnexus/run.cjs detect-changes --scope all --repo .`
Expected: no `partial: true` and no `truncated: true`. If either appears, re-run until clean. A PowerShell exit code 1 from the wrapper with stderr progress is expected; check the real code (the repo docs describe `cmd /c ... & echo EXITCODE=%ERRORLEVEL%`).

- [ ] **Step 4: Show the author the review set**

List every created file with a one-line description. Highlight the three decisions needing confirmation: license holder, the "plumbing" hand-off lane, and which (if any) extra MCPs to connect. State explicitly what has **not** been done: no issues created, no posts published, no messages sent, no MCPs added, no treg spend.

- [ ] **Step 5: Commit only after explicit approval**

Ask: "Approve this set for commit?" If and only if the author says yes:

```bash
git add LICENSE CONTRIBUTING.md docs/VISION.md docs/OUTREACH.md docs/outreach/ docs/superpowers/specs/2026-11-21-collaborator-onboarding-design.md docs/superpowers/plans/2026-11-21-collaborator-onboarding.md
git commit -m "docs: add collaborator onboarding and outreach drafts"
```

Expected: commit succeeds with no product code in the diff.

- [ ] **Step 6: Hand off the next decision**

Tell the author the next step is their review of the three post drafts and 20 notes, then — only with their explicit go-ahead — publishing the repo docs first, then the issues, then the posts and notes.
