# Zero-config learning actions

> User, verbatim: "this is not how a user wants to make a quiz. youre making it too customizable while getting rid of the google notebook, studyfetch, or gauth feel of a smart app that just helps you, you shouldnt have to do much of anything"
>
> User, verbatim: "Dont just make this fix for the quizzes, make it for everything"
>
> Chosen approach: **One intent per surface** (button click 1, 2026-11-24).

## Intent and why

StudyAI currently makes a student assemble learning material field by field. The quiz author asks for concept, prompt, two choices, the correct one, a source document, a suggested excerpt, a source excerpt and an explanation. Learning activities ask the student to paste an ActivitySpec JSON. Studio asks for focus, artifact type, practice type and count. Artifacts asks for a focus string. None of these are decisions a student wants to make; they are decisions the app can infer from the lesson it is already showing.

The competitor feel the user wants is the opposite: the app reads the course material and hands back something usable. One intent, one action, no form.

## Goals

- Every learning surface has a single primary action that infers its inputs from the current course and lesson.
- Generated items remain grounded in student-provided material and keep an openable citation.
- Manual controls stay reachable, but only behind an explicit Advanced affordance — never on the main path.
- A failed or rate-limited generation produces an honest, actionable message and never a fake or ungrounded item.

## Non-goals

- No chat-only entry point, no auto-generation on every lesson open, no provider change.
- No new visual direction, no `DESIGN.md`. This is a behavior change under the current `immersive-real` scheme.
- No change to the citation and acceptance contract: a source ref must still match document text and page.
- No weakening of the copy-style question filter added on 2026-11-24.

## Anti-goals

- Removing the manual endpoints or schemas. The reviewed-question, ActivitySpec and acceptance contracts are still the grounding gates and are covered by tests.
- Making Canvas authoring hands-off. The canvas is the product's defining surface and drawing on it is the work itself, not configuration.
- Touching Settings or user-managed API keys.

## Constraints

- 99.9% of student-facing substance comes from student-provided course material; anything else is labelled.
- Existing local-first providers only (`opencode-go` / `hy4-flash-free` for live runs); no paid service, key or external commitment.
- No subagents of any kind. Review is native.
- Known operational limit: `opencode-go` can return 429 under load. Studio already has a deterministic grounded fallback; a one-click path must report a degraded result honestly rather than silently produce a worse artifact.

## Approaches considered

1. **One intent per surface** (chosen). Each surface gets one primary button; defaults are inferred; manual forms move behind Advanced. Predictable, keeps every surface recognizable, and reuses the grounded Studio generator and importer that already exist.
2. **Tutor does it all.** One chat ("quiz me", "make cards"). Least UI, but the Tutor is provider-dependent and timed out during live testing, so the main study path would inherit that fragility.
3. **Pre-generate on lesson open.** Zero clicks, but spends a provider call on every visit and produces material the student did not ask for.

## Design

### Shared behavior

- The current `courseId` and `lessonId` are the context. The app never asks for a focus string: it uses the lesson title, or the already-selected source excerpt when one is in scope.
- Count defaults to 4 for practice items. Artifact type defaults to the surface's own type. Practice type defaults to both cards and questions where both are useful.
- Generation runs through the existing Studio artifact path and imports the result into the lesson's reviewed bank, then opens the result. No new provider call site.
- Every primary button shows a busy state and an honest failure state. When all generated items are rejected by grounding or quality checks, the message says the lesson's material did not yield a usable item and offers retry — it never drops back to a copy-style question.
- An "Advanced" disclosure on each affected surface preserves today's manual editor unchanged.

### Study

- Replace the empty state's "Add a question" primary action with "Make quiz": generate a practice artifact for this lesson, import its questions, then call the existing ask flow so the first question appears immediately.
- "Ask a reviewed question" stays for existing banks.
- The eight-field author form moves behind "Advanced → Add a question by hand".

### Cards

- When no cards are due, `FlashcardReview` offers "Make cards from this lesson": same generate-and-import path with cards only, then reload the due list.
- Manual card creation remains available elsewhere; no new authoring form.

### Studio

- "Generate a mind map / study guide / practice set" becomes one primary button per tab, with focus, count and practice type collapsed into Advanced.
- The acceptance and citation seams stay exactly as they are.

### Artifacts

- Remove the focus input from the main path. "Build slide deck" uses the lesson title as its focus.
- Filter, rename, delete and the Presenton-missing notice stay; they manage results rather than configure them.

### Learning activities

- Replace the JSON textarea on the main path with "Start a guided activity": choose the force or graph template from keywords in the lesson's indexed source text, fill the spec from that cited excerpt, and call the existing preview/start endpoints.
- "Advanced → Paste an ActivitySpec" keeps the current editor and templates unchanged.

### Unchanged

Concepts, Canvas authoring, Settings, Tutor, and the citation seams between surfaces.

## What is left to the builder

- Wire the five primary actions to the existing generate/import endpoints; add one small shared helper for "generate practice, import, then open".
- Update the e2e specs that currently assert the manual form on the main path; keep an Advanced-path assertion so the editor is not lost.
- Add focused tests for inferred defaults, the degraded-generation message, and that every generated item still carries a citation.
- Keep `npm run verify` honest: name provider-dependent failures separately, do not weaken assertions.
