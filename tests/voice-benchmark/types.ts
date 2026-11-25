/**
 * Shared contracts for the reproducible voice-tutor benchmark.
 *
 * The harness never imports a speech engine directly: every engine is reached
 * through one of these adapters, so candidates are interchangeable and the
 * boundary recorder sees the same pipeline for all of them.
 */

export type BoundaryName =
  | "speech_end"
  | "final_transcript"
  | "llm_request"
  | "llm_first_token"
  | "tts_first_audio"
  | "playback_start";

export interface BoundaryEvent {
  turnId: string;
  name: BoundaryName;
  atMs: number;
}

export type PromptKind = "course" | "refusal" | "interrupted";

export interface BenchmarkPrompt {
  id: string;
  kind: PromptKind;
  text: string;
  /** Course-facing label, never a fabricated fact or citation. */
  sourceLabel: string;
  expectsRefusal: boolean;
}

export interface TranscriptChunk {
  text: string;
  final: boolean;
  atMs: number;
}

export interface AudioChunk {
  samples: Float32Array;
  atMs: number;
}

export interface STTAdapter {
  streamTranscript(input: AsyncIterable<AudioChunk>): AsyncIterable<TranscriptChunk>;
  cancel(): void;
}

export interface VADAdapter {
  isSpeech(chunk: AudioChunk): boolean;
}

export interface TurnDetector {
  detectTurnEnd(input: { chunk: TranscriptChunk; lastSpeechAtMs: number; nowMs: number }): boolean;
}

export interface TTSAdapter {
  synthesizeStream(text: AsyncIterable<string>, signal: AbortSignal): AsyncIterable<AudioChunk>;
  cancel(): void;
}

export interface TransportAdapter {
  play(chunk: AudioChunk): void;
  stop(): void;
  /** Seconds of audio actually played; drives history trimming after a barge-in. */
  playbackPosition(): number;
}

export interface HistoryEntry {
  role: "student" | "tutor";
  text: string;
}

export interface TutorTurnInput {
  text: string;
  sourceRefs: string[];
  history: HistoryEntry[];
  signal: AbortSignal;
}

export interface TutorLLM {
  stream(input: TutorTurnInput): AsyncIterable<string>;
}

export interface TurnObservation {
  /** Seconds of speech the TTS engine produced. */
  synthesizedAudioSeconds: number;
  /** Wall time from first audio to synthesis completion. */
  ttsWallMs: number;
  /** Last-voice-to-detected-end gap; null when VAD was not exercised. */
  endpointMs: number | null;
  peakRssMb: number | null;
  /** 0..1 share of a core stolen by other work; null when not sampled. */
  cpuContention: number | null;
}

export interface TurnMetrics {
  /** speech_end -> tts_first_audio: the primary metric. */
  ttfaMs: number | null;
  /** speech_end -> playback_start. */
  e2eMs: number | null;
  /** speech_end -> final_transcript. */
  sttMs: number | null;
  endpointMs: number | null;
  /** llm_request -> llm_first_token. */
  llmTtftMs: number | null;
  /** llm_first_token -> tts_first_audio (includes sentence buffering). */
  ttsTtfaMs: number | null;
  /** tts_first_audio -> playback_start. */
  handoffMs: number | null;
  /** produced audio seconds / synthesis wall seconds. */
  rtf: number | null;
  peakRssMb: number | null;
  cpuContention: number | null;
}

export interface TurnResult {
  turnId: string;
  promptId: string;
  candidate: string;
  kind: PromptKind;
  repetition: number;
  status: "measured" | "unmeasured" | "interrupted" | "failed";
  events: BoundaryEvent[];
  metrics: TurnMetrics;
  note?: string;
}

export interface MetricSummary {
  n: number;
  p50: number | null;
  p95: number | null;
  max: number | null;
}

export type MetricName = keyof TurnMetrics;
