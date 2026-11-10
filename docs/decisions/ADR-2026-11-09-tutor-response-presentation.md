# ADR: Tutor response separation and retrieval gating

Status: selected for the Tutor experience redesign.

## Root cause

`server/agent.ts` searches course documents for every nonempty message and binds the retrieval tool on every turn. At completion it canonicalizes links in the model answer, then appends up to five retrieved candidates whether or not the answer used them. It also appends context-budget notices to student-facing text. Canvas context is already typed and scope-validated, but its model projection includes IDs, coordinates, bounds, and raw analysis metadata for ordinary description requests.

## Decision

1. Keep Groq-first inference, course-scoped retrieval, validated canvas tools, citation navigation, and the existing CopilotKit chat.
2. Gate retrieval with a deterministic request-intent policy. Greetings, exact-output requests, and canvas-description requests skip retrieval and do not expose the retrieval tool. Academic or source-grounded questions keep retrieval scoped to the validated active course.
3. Build a typed `TutorResponse` from the model answer and candidate sources. Canonicalize only citations the answer actually uses; keep retrieved-but-unused sources and context diagnostics out of student content.
4. Project canvas context into human-readable observations for ordinary questions. Preserve raw object references and geometry in the existing context and include them in model context for explicit edit or metadata requests, so targeted tools remain available.
5. Reuse CopilotKit 1.85.0 (MIT), React 19.2.0, the existing citation-link navigation, and current Markdown/equation rendering. Group tool work and expose the CopilotKit inspector only in development. Add no dependency.

## Alternatives

- Prompt-only or CSS-only changes leave unconditional retrieval and candidate appending intact, so they do not fix the response pipeline.
- Replacing the chat stack or adding a Markdown/citation package duplicates the installed CopilotKit rendering and citation navigation without filling a capability gap.
- Requiring provider JSON mode would add compatibility risk across configured Groq/Ollama models; a typed server-side presentation object provides the needed separation while preserving current streaming and tool contracts.

## Limits

The intent policy is deterministic and may need refinement for unusual academic phrasing. Source identity is validated against retrieved course candidates; claim relevance still depends on the model's evidence use. Raw canvas metadata remains available in the validated context and development inspector, but ordinary description prompts receive a semantic projection.

## Verification

Add deterministic tests for retrieval policy, citation use, canvas projection, and exact student text; run the full Vitest suite and production build; then run targeted Playwright flows for exact output, canvas descriptions, greeting behavior, and a synthetic course-source citation. Use a bounded live Groq smoke only with synthetic course/canvas data.
