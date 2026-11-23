# Open-source options for the artifact pedagogy gap

Date: 2026-11-23
Question: which maintained open-source projects solve the defect found in four qualification cycles — questions that look like transfer but are answerable by copying or renaming variables from the explanation?

## The gap, precisely

Both independent reviewers scored the documented-request question low because the "new situation" changed only nouns and the angle symbol, and the answer restated the explanation. The needed capabilities are:

1. generate a genuinely different situation (scenario-based questions),
2. reject questions whose answer leaks from or restates the source,
3. reduce reliance on one integer from one reviewer for the gate.

## Candidates (primary sources verified)

### 1. BloomAssessmentItemGeneration — closest architectural match

- Repo: https://github.com/LyleW473/BloomAssessmentItemGeneration
- Paper: https://aclanthology.org/2026.bea-1.22/ (BEA 2026, pp. 292–335, DOI 10.18653/v1/2026.bea-1.22)
- License: MIT. Python 3.9+, 4 stars, 12 commits, no forks at review time.
- What it does: multi-agent, multi-stage generation of assessment tuples. Short-answer questions `(q,m,a)` and scenario-based questions `(s,q,m,a)` — question, mark scheme, expected answer, plus a grounding scenario. Bloom-specialised generation agents, critic/refine stages, and automated verification.
- Paper's key finding, quoted from the abstract: "prompt-level Bloom conditioning alone is insufficient to reliably achieve cognitive control." This independently matches our cycle-4 result that adding a "transfer" rule to the composer prompt did not change behaviour.
- Evaluation approach: rubric-guided LLM-as-judge, five pipelines compared head-to-head, matched-task pairwise voting with bootstrap confidence intervals, per-Bloom-level breakdown.
- Limits: research-grade, tiny community, Python (StudyAI is TypeScript), requires an OpenAI-compatible endpoint and optionally LlamaParse. Its LLM judges cannot serve as proof of pedagogy under our ADR; only the structural pattern is reusable.

### 2. SemanticQAGen — closest validator match

- Repo: https://github.com/StephenGenusa/semantic-qa-gen
- License: MIT, copyright 2025–2026. Python 3.10+, PyPI package, README declares v0.5.2 beta and active maintenance.
- Relevant capabilities, from its README: factual / inferential / conceptual question categories; **answer-leakage filtering** that removes questions revealing the answer or "restate[ing] the source verbatim"; diversity filtering that rejects near-duplicates; faithfulness and completeness validation; standalone/decontextualisation rewrite with keep-better-of-two repair; custom validators and custom question categories.
- It supports local OpenAI-compatible endpoints (Ollama), hybrid task routing, and per-task validation thresholds.
- Limits: beta API, Python, centred on Q&A pairs rather than our `ArtifactPackage`, and its leakage/diversity filters are lexical/semantic similarity — necessary but not sufficient for genuine transfer. No published human-blind pedagogy evaluation was located.

### 3. Qworld — question-specific criteria, not a generator

- Repo: https://github.com/mims-harvard/qworld
- Paper: https://arxiv.org/abs/2603.23522 (COLM 2026). License: MIT, 36 stars, 4 forks.
- Generates question-specific evaluation criteria with a recursive expansion tree (scenarios → perspectives → binary criteria). Reported to cover 89% of expert-authored criteria and generate 79% novel criteria validated by humans on HealthBench.
- Fit: addresses our "one integer from one reviewer" fragility by deriving criteria for the specific question under review.
- Limits: it evaluates answers, not question quality; needs embeddings and an LLM; criteria are a reviewer aid, not a replacement for frozen human thresholds.

### 4. llmqg / "Can LLMs Ask Good Questions?" — candidate transfer detector

- Repo: https://github.com/CoLearn-Dev/llmqg (10 stars, 30 commits; licence not stated on the repository page — verify before reuse)
- Paper: https://arxiv.org/abs/2501.03491 (v2, 2025-06-17)
- Evaluates generated questions on six dimensions including **answerability** and **uncommonness** — the latter measured by answering without the context, to see whether the question is answerable from pretraining alone.
- Fit: an operational test for "could the student answer by recall rather than by using the changed situation?" — a direct probe of the cosmetic-transfer defect.
- Limits: research scripts with Poetry and downloadable datasets, not a maintained library; licence unclear.

### 5. QGEval — evaluation benchmark, not a fix

- Repo: https://github.com/WeipingFu/QGEval (18 stars, EMNLP 2024, paper https://arxiv.org/abs/2406.05707; licence not stated on the repository page)
- Seven human-annotated dimensions including answerability and answer consistency, plus 15 automatic metrics with three-annotator scores.
- Useful as a catalogue of metrics and as evidence that answerability is a distinct, measurable quality axis. Not suitable as an auto-apply gate under our ADR.

## Reuse-versus-build decision (ADR)

**Decision: integrate BloomAssessmentItemGeneration's scenario-first method directly into StudyAI's TypeScript composer; add no runtime dependency.** Reading its source corrected an earlier assumption: SemanticQAGen's leak filter targets source-container phrasing such as "according to the passage", not answer-copying or cosmetic variable swaps. It does not solve our defect and was not adopted.

What was integrated:

1. `src/artifacts/scenario-question.ts` ports the upstream *scenario generation + Application-level eligibility* rules: a neutral scenario with at least two concrete values, an application verb, use of a scenario value, and rejection of answers copied from the explanation or scenarios that merely paraphrase it.
2. `src/artifacts/package.ts` gained optional `scenario` and `bloomLevel: "application"` fields on question components, so a transfer question is part of the artifact rather than hidden in prose.
3. `scripts/generate-artifact-records.ts` carries upstream-derived scenario-first instructions and uses the deterministic check inside its bounded retry loop.

Qworld's question-specific criteria remain a future reviewer aid only; the frozen gate and thresholds are untouched. QGEval and llmqg are useful references but were not adopted.

**Alternatives rejected:** fine-tuning a local QG model (no demonstrated capability gap, high cost); using LLM-as-judge scores as the gate (forbidden by the quality ADR); swapping models again (three models produced the same pedagogy ceiling).

**Verification required before implementation:** confirm each candidate's current licence file and last commit date at implementation time; port the *checks*, not the packages; add TDD coverage under `tests/artifact-*`; re-run the existing four-cycle harness against unchanged frozen thresholds.

## Uncertainty

No candidate was run in this investigation. Claims about their behaviour are from README files and peer-reviewed abstracts, not from execution. The claim that lexical leakage filtering is insufficient for transfer is an inference from our own reviewer scores, not a published result.
