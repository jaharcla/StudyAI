import type { AudioChunk, STTAdapter, TTSAdapter, TransportAdapter, TranscriptChunk, TurnDetector, VADAdapter } from "../types.js";

/** Minimal structural types: no speech-recognition typings dependency is added. */
export interface BrowserRecognitionResult { transcript: string; isFinal: boolean }
export interface BrowserRecognitionEvent { resultIndex: number; results: ArrayLike<BrowserRecognitionResult> }
export interface BrowserRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: BrowserRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
export interface BrowserUtterance {
  text: string;
  lang: string;
  onstart?: () => void;
  onend?: () => void;
}
export interface BrowserSpeechWindow {
  SpeechRecognition?: new () => BrowserRecognition;
  webkitSpeechRecognition?: new () => BrowserRecognition;
  speechSynthesis: { speak(utterance: BrowserUtterance): void; cancel(): void; speaking: boolean };
}

export interface BrowserBaseline {
  stt: STTAdapter;
  tts: TTSAdapter;
  transport: TransportAdapter;
  vad: VADAdapter;
  turnDetector: TurnDetector;
}

function onAbort(signal: AbortSignal): Promise<never> {
  return new Promise((_resolve, reject) => {
    if (signal.aborted) { reject(new DOMException("aborted", "AbortError")); return; }
    signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
  });
}

/**
 * Zero-download fallback. Web Speech owns the microphone and the output
 * device, so the harness can observe events and boundaries but cannot capture
 * samples; playbackPosition is an approximation from local wall time.
 */
export function createBrowserBaseline(window: BrowserSpeechWindow, now: () => number): BrowserBaseline {
  const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
  if (!Ctor) throw new Error("This browser has no Web Speech recognition API.");
  const recognition = new Ctor();
  recognition.lang = "en-US";
  recognition.continuous = true;
  recognition.interimResults = true;

  const state = { ended: false, speechEndAtMs: 0, playStartedAtMs: 0 };
  recognition.onend = () => { state.ended = true; state.speechEndAtMs = now(); };

  return {
    stt: {
      streamTranscript(_input: AsyncIterable<AudioChunk>): AsyncIterable<TranscriptChunk> {
        const queue: TranscriptChunk[] = [];
        let wake: (() => void) | null = null;
        const push = (chunk: TranscriptChunk) => { queue.push(chunk); wake?.(); wake = null; };
        recognition.onresult = (event) => {
          for (let index = event.resultIndex; index < event.results.length; index += 1) {
            const result = event.results[index]!;
            push({ text: result.transcript, final: result.isFinal, atMs: now() });
          }
        };
        recognition.start();
        return (async function* () {
          try {
            while (true) {
              while (queue.length) yield queue.shift()!;
              if (state.ended) return;
              await new Promise<void>((resolve) => { wake = resolve; });
            }
          } finally {
            recognition.abort();
          }
        })();
      },
      cancel(): void { recognition.abort(); },
    },
    tts: {
      async *synthesizeStream(text: AsyncIterable<string>, signal: AbortSignal): AsyncIterable<AudioChunk> {
        for await (const segment of text) {
          if (signal.aborted) return;
          const started = new Promise<void>((resolve) => {
            const utterance: BrowserUtterance = { text: segment, lang: "en-US", onstart: () => resolve() };
            window.speechSynthesis.speak(utterance);
          });
          await Promise.race([started, onAbort(signal)]);
          if (signal.aborted) return;
          yield { samples: new Float32Array(0), atMs: now() };
        }
      },
      cancel(): void { window.speechSynthesis.cancel(); },
    },
    transport: {
      play(_chunk: AudioChunk): void { if (!state.playStartedAtMs) state.playStartedAtMs = now(); },
      stop(): void { window.speechSynthesis.cancel(); },
      playbackPosition(): number { return state.playStartedAtMs ? (now() - state.playStartedAtMs) / 1000 : 0; },
    },
    vad: { isSpeech(_chunk: AudioChunk): boolean { return !state.ended; } },
    turnDetector: {
      detectTurnEnd(input): boolean {
        return state.ended && state.speechEndAtMs >= input.lastSpeechAtMs;
      },
    },
  };
}
