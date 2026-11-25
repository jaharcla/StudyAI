import { BoundaryRecorder, formatSummary, summarizeTurn } from "./boundary-recorder.js";
import { TurnController } from "./interruption.js";
import { PROMPTS } from "./prompts.js";
import { SentenceBuffer } from "./sentence-buffer.js";
import type {
  AudioChunk, BoundaryName, BenchmarkPrompt, STTAdapter, TTSAdapter, TransportAdapter,
  TurnDetector, TurnResult, TutorLLM, VADAdapter,
} from "./types.js";

export interface ResourceSample {
  endpointMs: number | null;
  peakRssMb: number | null;
  cpuContention: number | null;
}

export interface PipelineDeps {
  clock: () => number;
  stt: STTAdapter;
  tts: TTSAdapter;
  transport: TransportAdapter;
  vad: VADAdapter;
  turnDetector: TurnDetector;
  llm: TutorLLM;
  resources: ResourceSample;
  /** Words spoken before a scripted barge-in; present only for interrupted turns. */
  bargeInAfterWords?: number;
}

const SAMPLE_RATE = 24_000;

function emptyAudio(): AsyncIterable<AudioChunk> {
  return (async function* () {})();
}

async function* oneSegment(segment: string): AsyncIterable<string> {
  yield segment;
}

const SELF_TEST_WORDS = "Ground-state atoms fill orbitals in increasing energy order with two electrons each.".split(" ");

/** Deterministic in-process adapters used to prove the harness without downloads. */
export function createSelfTestDeps(): PipelineDeps {
  let now = 0;
  const clock = () => now;
  const played: AudioChunk[] = [];
  return {
    clock,
    stt: {
      async *streamTranscript(): AsyncIterable<{ text: string; final: boolean; atMs: number }> {
        now += 100;
        yield { text: "Ground-state atoms", final: false, atMs: now };
        yield { text: SELF_TEST_WORDS.join(" "), final: true, atMs: now };
      },
      cancel() {},
    },
    tts: {
      async *synthesizeStream(text: AsyncIterable<string>, signal: AbortSignal): AsyncIterable<AudioChunk> {
        for await (const segment of text) {
          if (signal.aborted) return;
          now += 400;
          yield { samples: new Float32Array(SAMPLE_RATE), atMs: now };
          now += 100;
        }
      },
      cancel() {},
    },
    transport: {
      play(chunk: AudioChunk): void { played.push(chunk); },
      stop(): void { played.length = 0; },
      playbackPosition(): number { return played.length; },
    },
    vad: { isSpeech(): boolean { return true; } },
    turnDetector: {
      detectTurnEnd(input): boolean { return input.chunk.final; },
    },
    llm: {
      async *stream(): AsyncIterable<string> {
        now += 200;
        for (const word of SELF_TEST_WORDS) {
          yield `${word} `;
          now += 50;
        }
      },
    },
    resources: { endpointMs: 120, peakRssMb: 640, cpuContention: 0.1 },
  };
}

export async function runTurn(input: { prompt: BenchmarkPrompt; candidate: string; repetition: number; deps: PipelineDeps }): Promise<TurnResult> {
  const { prompt, candidate, repetition, deps } = input;
  const turnId = `${prompt.id}-${candidate}-${repetition}`;
  const recorder = new BoundaryRecorder(turnId, deps.clock);
  const marks: Array<{ name: BoundaryName; atMs: number }> = [];
  const controller = new TurnController({
    now: deps.clock,
    history: [],
    onAbortLLM: () => {},
    onCancelTTS: () => deps.tts.cancel(),
    onDropAudio: () => deps.transport.stop(),
  });

  let finalText = "";
  let finalAt: number | null = null;
  let speechEndAt: number | null = null;
  for await (const chunk of deps.stt.streamTranscript(emptyAudio())) {
    if (!deps.vad.isSpeech({ samples: new Float32Array(0), atMs: chunk.atMs })) continue;
    if (!chunk.final) continue;
    finalText += chunk.text;
    finalAt = chunk.atMs;
    if (deps.turnDetector.detectTurnEnd({ chunk, lastSpeechAtMs: chunk.atMs, nowMs: deps.clock() })) speechEndAt = deps.clock();
  }

  const emptyObservation = { synthesizedAudioSeconds: 0, ttsWallMs: 0, ...deps.resources };
  if (!finalText.trim() || speechEndAt === null) {
    return {
      turnId, promptId: prompt.id, candidate, kind: prompt.kind, repetition,
      status: "failed", events: [], metrics: summarizeTurn([], emptyObservation),
      note: "No final transcript or detected speech end; no audio was measured.",
    };
  }

  marks.push({ name: "speech_end", atMs: speechEndAt });
  marks.push({ name: "final_transcript", atMs: finalAt ?? speechEndAt });
  controller.append({ role: "student", text: finalText.trim() });
  marks.push({ name: "llm_request", atMs: deps.clock() });

  const generation = controller.startGeneration();
  const buffer = new SentenceBuffer();
  let firstTokenSeen = false;
  let firstAudioAt: number | null = null;
  let playbackAt: number | null = null;
  let audioSeconds = 0;
  let interrupted = false;
  let wordsSeen = 0;

  const speak = async (segment: string): Promise<void> => {
    if (controller.isObsolete(generation)) return;
    for await (const audio of deps.tts.synthesizeStream(oneSegment(segment), controller.signal)) {
      if (controller.isObsolete(generation)) return;
      if (firstAudioAt === null) {
        firstAudioAt = deps.clock();
        marks.push({ name: "tts_first_audio", atMs: firstAudioAt });
      }
      audioSeconds += audio.samples.length / SAMPLE_RATE;
      deps.transport.play(audio);
      if (playbackAt === null) {
        playbackAt = deps.clock();
        marks.push({ name: "playback_start", atMs: playbackAt });
      }
    }
  };

  for await (const token of deps.llm.stream({
    text: finalText.trim(),
    sourceRefs: [],
    history: controller.history(),
    signal: controller.signal,
  })) {
    if (!firstTokenSeen) {
      firstTokenSeen = true;
      marks.push({ name: "llm_first_token", atMs: deps.clock() });
    }
    wordsSeen += token.trim().split(/\s+/).filter(Boolean).length;
    if (deps.bargeInAfterWords !== undefined && wordsSeen >= deps.bargeInAfterWords) {
      controller.bargeIn(deps.bargeInAfterWords);
      interrupted = true;
      break;
    }
    for (const segment of buffer.push(token)) await speak(segment);
  }
  if (!interrupted) {
    for (const segment of buffer.flush()) await speak(segment);
  }

  for (const mark of marks.sort((a, b) => a.atMs - b.atMs)) recorder.markAt(mark.name, mark.atMs);
  const observation = {
    synthesizedAudioSeconds: audioSeconds,
    ttsWallMs: firstAudioAt === null ? 0 : deps.clock() - firstAudioAt,
    ...deps.resources,
  };
  return {
    turnId, promptId: prompt.id, candidate, kind: prompt.kind, repetition,
    status: interrupted ? "interrupted" : "measured",
    events: recorder.snapshot(),
    metrics: summarizeTurn(recorder.snapshot(), observation),
    note: interrupted ? "Barge-in cancelled the obsolete LLM stream and TTS task; history trimmed to spoken words." : undefined,
  };
}

/**
 * Self-test driver only: deterministic adapters, fixed prompts, one warm-up
 * and five counted repetitions. Real engines are resolved by the CLI, which
 * records "unmeasured" until a candidate is installed and benchmarked.
 */
export async function runBenchmark(options: {
  candidate: string;
  kinds?: BenchmarkPrompt["kind"][];
  limitPrompts?: number;
  repetitions?: number;
  warmup?: number;
}): Promise<{ turns: TurnResult[]; summary: string }> {
  const kinds = options.kinds ?? ["course", "refusal", "interrupted"];
  const repetitions = options.repetitions ?? 5;
  const warmup = options.warmup ?? 1;
  let prompts = PROMPTS.filter((prompt) => kinds.includes(prompt.kind));
  if (options.limitPrompts) prompts = prompts.slice(0, options.limitPrompts);
  const turns: TurnResult[] = [];
  for (const prompt of prompts) {
    for (let index = 0; index < repetitions + warmup; index += 1) {
      const isWarmup = index < warmup;
      const deps = createSelfTestDeps();
      if (prompt.kind === "interrupted") deps.bargeInAfterWords = 4;
      const turn = await runTurn({
        prompt,
        candidate: options.candidate,
        repetition: isWarmup ? 0 : index - warmup + 1,
        deps,
      });
      if (isWarmup) turn.note = "Warm-up: excluded from the reported distribution.";
      turns.push(turn);
    }
  }
  return { turns, summary: formatSummary(turns) };
}
