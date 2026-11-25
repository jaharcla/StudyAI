# TTS/STT routes for source-driven audio and a voice tutor (2026-11-25)

Goal: two end states without changing our local-first, BYOK, zero-config posture.

1. A source-driven podcast from the student's course material, in the Studio catalog, playable in the app and exportable.
2. A live voice conversation with the grounded Tutor that can be interrupted.

Constraints: no new dependency, paid service or API key without approval; no `.env` edits; 99.9% of student-facing substance from course material; deterministic validation stays authoritative; one app, shared tokens, honest failure states.

## What Gemini Notebook actually exposes (primary source)

Google's own [Audio Overview help](https://support.google.com/notebooklm/answer/16212820?hl=en) describes a Studio background generation with four formats: Deep Dive (two hosts), Brief (one speaker, under two minutes), Critique (two hosts evaluating material) and Debate (two hosts, multiple perspectives). The student chooses language, length (Shorter/Default/Longer, English only) and a prompt that focuses topics or expertise level. The custom prompt can be read back with "View custom prompt". Generation takes a couple of minutes, runs in the background, and supports download, share and playback while working. Interactive mode lets a student join a newly generated episode by voice, ask a question, get a source-grounded answer, then resume. Google states the hosts are objective reflections of uploaded sources, not independent opinions, and that audio may contain inaccuracies or glitches. [Google's launch post](https://blog.google/technology/ai/notebooklm-audio-overviews/) makes the same grounding caveat.

Google has not published the internal script pipeline. A [Sequoia interview with the NotebookLM team](https://www.sequoiacap.com/podcast/training-data-google-notebooklm/) and [a reported account of host reasoning](https://www.descript.com/blog/article/testing-notebook-for-podcasters) describe a multi-step edit cycle: outline, detailed script, critique, revision, then narration with disfluencies. Treat this as secondary evidence, not an official specification. We should emulate the observable product shape, not claim to replicate hidden prompts.

## STT routes

| Route | Dependency | Local-first | Fit |
| --- | --- | --- | --- |
| A. Browser Web Speech `SpeechRecognition` | none | Only with `processLocally = true` and a downloaded language pack; otherwise Chrome/Safari send audio to their own services | Best first route for zero-config voice input. [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API/Using_the_Web_Speech_API) documents `available()`, `install()`, `phrases` biasing and the `service-not-allowed` error when the pack is missing. Support varies; Firefox Android has none. |
| B. Local model via already-installed `@huggingface/transformers` (Whisper) | none new, but model download | Yes | Higher privacy and consistency across browsers. Model weights are large and this machine has limited RAM; keep behind Advanced until measured. |
| C. BYOK external STT provider | paid/API key | No | Dormant by design; never the default. |

Route A is the one to implement first. It needs an explicit mic gesture, a visible transcript, and an honest notice when on-device recognition is unavailable; never silently send course audio to a third party. Seed `phrases` with course terms so chemistry vocabulary is recognised.

## TTS routes

| Route | Dependency | Streaming | Fit |
| --- | --- | --- | --- |
| A. Browser `SpeechSynthesis` | none | Sentence chunks; `boundary` events can drive word highlighting | Best first route for in-app playback and live Tutor replies. Filter on `voice.localService` when privacy matters; handle `voiceschanged` and always attach an `error` handler. |
| B. Local Piper / Kokoro-class engine | new binary and model download, needs approval | Piper per sentence; Kokoro whole utterance unless split | Needed for downloadable audio files. Community benchmarks put Piper medium far ahead of Kokoro on CPU, with lower memory and first-audio latency; e.g. [HF community comparison](https://huggingface.co/blog/VoxRT/small-cpu-text-to-speech-models-compared-piper-kok) and [CPU measurements](https://github.com/omrylcn/voice-edge-benches). Numbers are environment-specific; benchmark on this machine before choosing. |
| C. BYOK external TTS | paid/API key | Usually yes | Dormant, never default. |

Browser synthesis cannot be reliably captured to a downloadable file, so route A alone gives in-app listening, not a podcast export. Do not promise download until a local engine is approved and measured.

## Recommended shape in our architecture

Podcast generation stays a Studio artifact. Reuse `buildGrounding` in `server/studio/grounding.ts` as the only factual packet; add an audio generator beside the existing one in `server/studio/service.ts`, with the same validation, repair, fallback and `sourceRef` checks. The generator produces an outline, then a turn-by-turn script with `speaker`, `text` and `sourceRef` per turn; a second pass critiques only presentation and grounding completeness, never facts. Formats map directly: Deep Dive (two voices), Brief (one voice), Critique (two voices), Debate (two voices with opposing framing drawn only from source disagreements). Length and the focus prompt feed the existing optional `direction` route. Store the script and the effective direction in plain text with the artifact, and show a background skeleton/progress card, then playable turns with citation chips that open the exact passage. Today's Studio `slide`-style detail pattern is the model; no new navigation.

Live voice Tutor reuses the existing evidence contract, not a second tutor. The loop is: microphone → interim/final transcript → existing Tutor request → streamed answer buffered to sentence/clause boundaries → `SpeechSynthesis` utterances → barge-in cancels queued speech and trims the history to the words actually spoken. Keep the transcript visible, keep source-count and refusal notices authoritative, and degrade to typed input with a plain message when recognition is unavailable. Treat a sub-second reply as an aspiration, not a promise: the free model's time-to-first-token dominates, and the pipeline literature puts a realistic streaming budget near 800 ms–1 s before model latency ([voice-agent architecture](https://soniox.com/wiki/voice-agent-architecture), [latency budget](https://webrtc.ventures/2026/09/voice-ai-latency-budget)).

Do not build a separate orchestration framework. A small state machine in the Tutor surface (listening → thinking → speaking → interrupted) is enough; the hard parts are turn detection, barge-in and history trimming, all of which stay inside that one component.

## Needs approval before implementation

- A local TTS binary and voice model (Piper-class) if downloadable podcast audio is required. No install or download until the user approves.
- Any local STT model route if browser `processLocally` proves insufficient on the target browsers.

## Objections and uncertainties

1. Google never published its script or voice prompts; any "emulation" is of the observable controls and grounding rules, not hidden internals.
2. `SpeechRecognition` is unevenly supported and can be server-side; a local model is the only fully private route, and it costs RAM we may not have.
3. Generation quality depends on the free provider; script critique may return a fallback, so the first honest release may be a short, cited episode with in-app playback only.
