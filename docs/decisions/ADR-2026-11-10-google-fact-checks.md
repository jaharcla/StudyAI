# ADR: Google Fact Check tool in the Tutor

## Decision

Register `search_fact_checks` as a server-side LangChain tool on Groq Tutor runs. Reuse the existing `@langchain/core` tool loop and Zod validation (`@langchain/core` 1.3.5, MIT; Zod 4.2.0, MIT), plus Node's built-in `fetch`. Keep the Google key server-only in `GOOGLE_FACT_CHECK_API_KEY`; call only the fixed Google `claims.search` endpoint, with bounded input, results, response bytes, timeout, retry, and local rate limits.

## Alternatives

- `googleapis`: rejected; this one REST GET does not justify another dependency.
- Separate MCP/server: rejected; StudyAI already executes registered tools inside its bounded Tutor request and provider cost accounting.
- Groq web search or general web search: rejected; the requirement is specifically published ClaimReview records from Google's Fact Check Tools API, not broader web results.

## Boundaries

Expose the tool only on Groq runs; never send the Google key or request to the browser/model. Return each review's original publisher, textual rating, review URL and dates. Label ratings as publisher assessments; a matching review is not conclusive and no match establishes neither truth nor falsity. Keep course RAG citations and course isolation separate from external fact-check links.

## References

- [Google Fact Check Tools API: `claims.search`](https://developers.google.com/fact-check/tools/api/reference/rest/v1alpha1/claims/search)
- [Groq local tool calling](https://console.groq.com/docs/tool-use/local-tool-calling)
