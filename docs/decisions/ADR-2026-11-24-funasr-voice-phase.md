# ADR-2026-11-24 — FunASR as the self-hosted STT candidate for the voice phase

Date: 2026-11-24
Status: proposed — research and contract design complete; implementation gated on the owner decisions in §9.
Baseline: `docs/research/2026-11-24-funasr-adr-brief.md`; roadmap entry `docs/PRODUCT_ROADMAP.md:101`; grounding rule `ADR-2026-11-24-course-grounding-rule.md`; reuse boundary `ADR-2026-11-23-artifact-breadth-reuse.md`.

## 1. Decision

Adopt **FunASR as the STT candidate for the later voice-tutoring phase**, self-hosted, on loopback, with no API key and no paid service. It is an audio utility, not a Tutor provider: the provider resolution boundary, the single Tutor authority and `author_board` remain unchanged.

Three constraints bind this decision:

1. **Reuse before build.** A transcript becomes a course source through the existing source-reference, excerpt-containment and ClaimProvenance machinery. No second grounding authority, store or renderer.
2. **Provenance before UI.** No transcription UI is built until the transcript-as-course-source contract, time offsets and explicit no-source labelling are specified and gated.
3. **Local-first before scale.** The first route is a CPU/edge checkpoint on this Windows machine. GPU serving, streaming and cloud deployment are later, separately approved steps.

This ADR commits to a *candidate and a contract*, not to a shipped feature. No product source is changed here.

## 2. What FunASR is, with sources

FunASR is a speech-recognition **toolkit**, not one model. The task, checkpoint and runtime are chosen separately; support in one does not imply support in another [S1].

| Claim | What the evidence actually says | Source |
| --- | --- | --- |
| Open source, self-hostable | Toolkit source is MIT; weights are licensed separately per model card, sometimes under the FunASR Model Open Source License Agreement. | [S1], [S2] |
| OpenAI-compatible API | A **subset**: `POST /v1/audio/transcriptions`, `GET /v1/models`, `/health`, `/docs`. It is not a compatibility guarantee for every SDK feature. Includes no built-in authentication; `api_key="not-needed"` does not authenticate. | [S1], [S3] |
| "50+ languages" | A toolkit/marketing claim [S4]. No single default checkpoint covers 50+: SenseVoiceSmall is 5 languages (zh/en/ja/ko/yue), Fun-ASR-Nano is zh/en/ja plus Chinese dialects, Fun-ASR-MLT-Nano is 31, Qwen3-ASR is 52. | [S1], [S4] |
| Speaker diarization | Available via a pipeline (FSMN-VAD + CAM++ embedding clustering) or the third-party MOSS adapter. Output is **anonymous, recording-local speaker indices**, not enrolled identities. | [S1], [S3] |
| Streaming | Requires the Paraformer-zh-streaming checkpoint and a per-session cache or WebSocket runtime; offline checkpoints cannot be streamed. | [S1] |
| Emotion and audio events | SenseVoiceSmall-specific rich tags. The OpenAI-compatible HTTP example **strips the `<\|...\|>` tags and exposes no dedicated emotion/event fields**; the in-process Python SDK is required to keep them. | [S1], [S3] |
| CPU / edge fallback | Documented CPU path for SenseVoiceSmall and a GGUF/llama.cpp route with prebuilt Windows binaries (Vulkan and CUDA variants), no Python at runtime. | [S1] |
| Speed ("170x realtime") | Vendor/marketplace claim, benchmark-specific, not a capacity guarantee. The project's own docs say to benchmark on your own audio and hardware. | [S1], [S4] |

The architectural description is corroborated by the INTERSPEECH 2023 toolkit paper: Paraformer, FSMN-VAD, CT-Transformer punctuation, timestamp prediction, hotword customization, and CPU/GPU runtimes [S5]. SenseVoice is described in [S6].

Cite the **toolkit** and the **checkpoint** separately in any later document. The MIT license covers FunASR source; it is not a license for every model weight [S1].

## 3. Reuse versus build

### Reuse (chosen)

- **Grounding contracts.** `studyai://document/<id>/<unitType>/<unitNumber>?chunk=<n>` is the existing stable source reference [C1]. Transcript segments get a parallel `studyai://transcript/...` kind that reuses the same `make`/`parse` discipline, citation link (`#studyai-citation=<encoded ref>`) and retrieval result shape.
- **Claim provenance.** `claimProvenanceSchema` (`sourceRef`, `excerpt`, `relationship`, `confidence`) in `src/artifacts/contracts.ts:6` stays the only claim shape [C2]. `parseArtifactPackage` already enforces that every ref was retrieved this turn and that every `direct` claim's excerpt is literally contained in its chunk [C3]. A transcript segment is simply another retrieved chunk.
- **Citation enforcement.** The server already rewrites citations to refs it actually retrieved and drops invented ones before the tool result reaches the client [C4]. No new citation path.
- **Course scoping.** Documents are already bound to one course and lesson [C1]. A transcript attaches to the same scope; no cross-course source mixing.
- **Existing storage.** `di_documents` / `di_units` / `di_chunks` and `document_chunks` are the only source stores [C1][C5]. Transcript text is indexed the same way rather than kept in a parallel transcript table.

### Build (rejected)

- A new STT engine trained or assembled in-house: no dataset, no model-ops capacity, and the toolkit already provides the components. Building the inference stack is not a differentiator for this product.
- A second provenance/grounding authority for transcripts: it would break the single-source rule in `ADR-2026-11-24-course-grounding-rule.md` and make "99.9% grounded" unmeasurable.
- A second renderer or artifact store for voice-derived material: `ADR-2026-11-23-artifact-breadth-reuse.md` already decides one composition format, one store and one accept transaction.

### Alternatives considered

| Option | Verdict |
| --- | --- |
| Cloud transcription service (hosted STT API) | Rejected. Sends student audio off-machine, needs a key and budget approval, and introduces a second provider authority. Conflicts with the local-first / BYOK architecture and the "no paid service" rule in `docs/PRODUCT_ROADMAP.md:102,109`. |
| Whisper / whisper.cpp as primary | Not selected, not dismissed. FunASR is the owner-named candidate and ships separable VAD, punctuation, diarization and streaming components plus a Windows edge binary. FunASR's docs describe the GGUF route as analogous to whisper.cpp and claim lower Chinese CER [S1] — a source claim, not our measurement. Whisper stays the fallback if our own benchmark on representative course audio wins. |
| Browser Web Speech for STT | Deferred. The canvas-narration path already considers `speechSynthesis` for *output*; it does not solve grounded transcript storage, and browser STT egress behaviour would need its own review. |
| Build from scratch | Rejected. No training data or model-ops capacity; duplicates a maintained MIT toolkit. |

The choice is **provisional until a local benchmark** on our own audio. All sources instruct benchmarking with the selected checkpoint, revision and hardware before choosing a runtime [S1].

## 4. Deployment footprint

### Two candidate routes on this Windows machine

| Route | Shape | Pros | Limits |
| --- | --- | --- | --- |
| **A — GGUF / llama.cpp binary** (first spike) | Prebuilt `windows-x64-vulkan` or `windows-x64-cuda` archive; `hf download` SenseVoiceSmall-GGUF + fsmn-vad-GGUF; run `llama-funasr-sensevoice.exe -m ... --vad ... -a audio.wav`. | No Python runtime, no GPU required (Vulkan driver suffices), explicit Windows packages in the upstream README [S1]. | CLI-style transcription, not an HTTP service; need a thin local adapter later. GGUF weights are a separate download from Python checkpoints. |
| **B — Python HTTP service** (later, if HTTP is needed) | `funasr-server --host 127.0.0.1 --model sensevoice --device cpu`, FastAPI + uvicorn; Node server calls loopback `/v1/audio/transcriptions`. | Matches the OpenAI-compatible subset; easy for the Node server to call. | Upstream quick-starts assume POSIX shell, Python 3.11 and a venv [S1][S3]; on Windows this means WSL2 or an equivalent adaptation. Service has no auth — keep it bound to loopback. |

Route A is the proof-of-life path; Route B is the integration path. **No host route is approved yet** — see §9.

### Checkpoint sizes (parameters, from the upstream Model Zoo [S1])

| Component | Params | Role in a v1 |
| --- | --- | --- |
| SenseVoiceSmall | 234M | CPU-first ASR + emotion/event tags; 5 languages |
| fsmn-vad | 0.4M | Voice activity segmentation |
| cam++ | 7.2M | Speaker embeddings for anonymous diarization |
| ct-punc | 290M | Optional punctuation |
| Paraformer-zh / streaming | 220M | Later live/streaming path |
| Fun-ASR-Nano / MLT-Nano | 800M each | Higher-quality / 31-language later options |
| Qwen3-ASR | 1.7B | Source of the "52 languages" figure; not a v1 default |

On-disk byte sizes, RAM, first-token latency and RT factor are **not measured here** and must come from the Phase 1 spike. The docs explicitly treat published speed figures as benchmark-specific and require local measurement [S1].

### Security and egress shape

- The OpenAI-compatible example has **no authentication, upload limit or rate limit**; keep it on `127.0.0.1`, never exposed to the LAN [S3].
- The example's `duration` field is elapsed `generate()` time, **not audio duration**; the packaged server uses audio duration. Time offsets for provenance must come from `sentence_info.start` / `end` (milliseconds), never from `duration` [S3].
- `verbose_json` selects a response shape; it does **not** enable diarization or force timestamps. Segments may be empty and speaker labels may be null [S3].
- Model download is a one-time network event; after weights are cached, transcription is local. This must be verified in Phase 1, not assumed.

## 5. Transcript provenance contract

A transcript is evidence only when it is bound to a course, a source and a time span. The following is a contract for a later spec, not implemented code.

1. **Source reference.** Add a `transcript` unit type alongside `page | slide | text` in `parseSourceReference` [C1]. Shape: `studyai://transcript/<transcriptId>/time/<segmentIndex>?start=<ms>&end=<ms>`. It must round-trip through make/parse and be rejected if the course or segment does not exist.
2. **Offsets are first-class.** `start`/`end` come from the ASR segment, are stored with the indexed chunk, and are shown in the citation UI as a time range — the audio analogue of `unitNumber` for pages/slides [C1]. A chunk without offsets is indexed as `text` and labelled `time unknown`, never silently given a page number.
3. **Excerpt containment.** Transcript text is chunked and indexed like documents [C1]. Existing gates apply unchanged: a ref must be retrieved this turn, and every `direct` claim's excerpt must be literally contained in that retrieved transcript segment [C2][C3]. ASR output is fallible; it is a candidate excerpt, not a verified answer.
4. **Speaker labels are anonymous.** Emit `Speaker 1`, `Speaker 2` etc. with an explicit `recording-local` qualifier [S1]. Never present a diarization index as a student's or teacher's identity, and do not expose voice-embedding vectors.
5. **Audio provenance.** Store the source audio's hash, duration, requested checkpoint/revision and engine version with each transcript, mirroring the existing `content_hash` discipline [C1]. A re-transcription creates a new transcript source; it never silently overwrites cited text.
6. **No matching course source is stated.** If a transcript claim has no retrieved course evidence, it is labelled `No course evidence`, and any conventional or model-supplied wording is labelled `General label`, per `ADR-2026-11-24-course-grounding-rule.md`. A transcript is not automatically course truth because it was spoken in class.
7. **Emotion/event tags stay out of claims.** SenseVoice tags are metadata, not course evidence, and are not exposed by the HTTP subset [S3]. If retained via the SDK, label them `Model label` and exclude them from `direct` claims.

No new renderer, no `as any`, no weakened assertions: the citation component already opens a source by encoded ref [C6].

## 6. Privacy, consent and egress

- **What leaves the machine:** nothing during transcription, once weights are cached. The model download fetches weights from ModelScope or Hugging Face; that is a one-time egress to disclose. No audio is sent to a provider because no provider is used.
- **What stays local:** audio bytes, embeddings, transcripts, chunks and offsets in the existing course-scoped store. The loopback service never binds to a public interface [S3].
- **Consent:** recording a lesson, or uploading audio of other people, requires an explicit, per-recording opt-in that names what is stored and for how long. Anonymous diarization labels must not be described as identifying anyone.
- **Retention:** audio and transcript retention need an owner decision before any capture UI exists. Default should be no indefinite audio retention; transcript text may follow existing document deletion semantics [C1].
- **Provider authority:** no new key, no `.env` secret, no change to `TUTOR_PROVIDER` or the loopback settings API. FunASR is not added to the provider chain established by `ADR-2026-11-20-openai-compatible-provider.md`.

## 7. Boundaries and non-goals

- No paid service, no API key, no account, no cloud transcription.
- No voice UI, microphone capture, TTS, audio overview or podcast generation in this ADR.
- No Tutor prompt, model or provider change; no `benchmark:canvas` implication.
- No product source edits, commits or dependency additions from this task.
- No claim that FunASR is faster or more accurate than Whisper on our data until Phase 1 measures it.

## 8. Phased plan

| Phase | Scope | Acceptance criteria | Owner decision needed |
| --- | --- | --- | --- |
| **0 — Clear the choice** | Record checkpoint, weight license and host route. No code. | Written sign-off naming the checkpoint, confirmation that its weight license is acceptable, and a chosen route A or B. | **Yes.** Checkpoint, license, host route. |
| **1 — Offline spike** | Transcribe a known ~60 s clip on this Windows machine with Route A; record RT factor, RAM, timestamp shape, diarization behaviour and network egress after cache. No product code. | Transcript produced locally; `start`/`end` present; no audio leaves the machine after weights are cached; a short report with measured numbers, not vendor claims. | No, unless results invalidate the checkpoint. |
| **2 — Provenance contract** | Specify and gate the `transcript` source-ref kind, offset storage, excerpt containment, anonymous speaker labels and no-source labelling. Tests for round-trip, containment and no-evidence handling. | All contract tests pass; no UI; no renderer changes; grounding rule honoured. | **Yes.** Retention and consent wording. |
| **3 — Local service adapter** | If Route B is chosen, a loopback-only adapter behind a feature flag; Node server calls the OpenAI-compatible subset. | No key, no cloud egress, bounded upload size, loopback binding asserted; no Tutor path touched. | **Yes.** Approve Route B if spike warrants it. |
| **4 — Voice tutoring UI** | Separate spec/ADR: capture, consent, playback, visible provenance. | Explicit opt-in, time-offset citations visible, `No course evidence` labelling, provider authority unchanged. | **Yes.** Full go/no-go. |

Phases 1–3 remain read-only with respect to product behaviour until the owner signs Phase 4. Streaming, multi-language expansion and GPU serving are out of scope for all four phases.

## 9. Decisions requiring the owner

1. **Checkpoint:** SenseVoiceSmall (5 languages, CPU-first, emotion/event tags) vs Fun-ASR-Nano (zh/en/ja, 800M) vs MLT-Nano (31 languages). The "50+ languages" marketing figure does not come from any one of these defaults.
2. **Weight license:** confirm the selected checkpoint's model-card terms, including any FunASR Model Open Source License Agreement. MIT covers the toolkit only.
3. **Host route:** GGUF binary on Windows (A) vs Python HTTP service under WSL2 (B).
4. **Features:** is diarization needed in v1? Are emotion/audio-event tags needed? The latter forces the in-process SDK, not the HTTP subset.
5. **Consent and retention:** wording, per-recording opt-in, and how long audio vs transcript text is kept.

## 10. Sources

External, accessed 2026-11-24:

- **[S1]** [modelscope/FunASR](https://github.com/modelscope/FunASR) — README: toolkit boundaries, Model Zoo, Windows GGUF paths, MIT/toolkit vs weight license, deployment. (Primary)
- **[S2]** [FunASR LICENSE](https://github.com/modelscope/FunASR/blob/main/LICENSE) and [model license](https://github.com/modelscope/FunASR/blob/main/MODEL_LICENSE), as linked from [S1]. (Primary)
- **[S3]** [OpenAI-compatible API example](https://github.com/modelscope/FunASR/blob/main/examples/openai_api/README.md) — API subset, no auth, `duration`/segment caveats, model aliases. (Primary)
- **[S4]** [MCP Marketplace: FunASR](https://mcpmarket.com/server/funasr-1) — "50+ languages", 170x realtime, self-hostable MIT claim. (Secondary / marketing; used only where marked)
- **[S5]** Gao et al., *FunASR: A Fundamental End-to-End Speech Recognition Toolkit*, INTERSPEECH 2023, pp. 1593–1597, [arXiv:2305.11013](https://arxiv.org/abs/2305.11013), [doi:10.21437/Interspeech.2023-1428](https://doi.org/10.21437/Interspeech.2023-1428). (Primary, peer-reviewed)
- **[S6]** *SenseVoice*, [arXiv:2407.04051](https://arxiv.org/abs/2407.04051), linked from [S1]. (Primary paper)

Internal code and decisions:

- **[C1]** `server/document-intelligence/service.ts:24-32,34-88,90-107` — source-ref make/parse, import, chunking, retrieval, location lookup; `server/db.ts:14`.
- **[C2]** `src/artifacts/contracts.ts:6-21` — `claimProvenanceSchema`, `ClaimReview`.
- **[C3]** `src/artifacts/package.ts:113-154` — retrieved-ref and direct-claim excerpt containment gates; `src/artifacts/provenance.ts:7-21`.
- **[C4]** `server/agent.ts:249,372-380` — citation rewriting and containment before the client sees a tool result.
- **[C5]** `server/document-intelligence/retrieval-tool.ts:6-16` — course-bound retrieval tool contract.
- **[C6]** `src/artifacts/ArtifactsPage.tsx:21,216-219` and `server/agent.ts:453` — `#studyai-citation=` source links.

Project documents: `docs/PRODUCT_ROADMAP.md:11,101,102,109`; `ADR-2026-11-24-course-grounding-rule.md`; `ADR-2026-11-23-artifact-breadth-reuse.md`; `ADR-2026-11-20-openai-compatible-provider.md`.

## 11. Limits and verification note

This is a document-only ADR. No host was probed, no model was downloaded, no inference was run and no license was cleared. All external figures are attributed; all deployment numbers are deferred to Phase 1. The `50+ languages` and `170x realtime` claims are recorded as marketplace claims and are explicitly not used as acceptance criteria.
