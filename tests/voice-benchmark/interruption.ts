import type { HistoryEntry } from "./types.js";

/** Trims tutor history to the words the student actually heard before a barge-in. */
export function trimHistoryToSpokenWords(history: readonly HistoryEntry[], spokenWords: number): HistoryEntry[] {
  const trimmed = history.map((entry) => ({ ...entry }));
  for (let index = trimmed.length - 1; index >= 0; index -= 1) {
    if (trimmed[index]!.role !== "tutor") continue;
    const words = trimmed[index]!.text.trim().split(/\s+/).filter(Boolean);
    if (spokenWords >= words.length) return trimmed;
    const kept = words.slice(0, Math.max(0, spokenWords)).join(" ");
    if (kept) trimmed[index] = { ...trimmed[index]!, text: kept };
    else trimmed.splice(index, 1);
    return trimmed;
  }
  return trimmed;
}

export interface TurnControllerDeps {
  now: () => number;
  history: HistoryEntry[];
  onAbortLLM: () => void;
  onCancelTTS: () => void;
  onDropAudio: () => void;
}

/** Owns cancellation state for one conversation turn and its generations. */
export class TurnController {
  private readonly abort = new AbortController();
  private readonly deps: TurnControllerDeps;
  private entries: HistoryEntry[];
  private generation = 0;
  private cancelled = false;

  constructor(deps: TurnControllerDeps) {
    this.deps = deps;
    this.entries = deps.history.map((entry) => ({ ...entry }));
  }

  get signal(): AbortSignal { return this.abort.signal; }
  get isCancelled(): boolean { return this.cancelled; }

  startGeneration(): number {
    this.generation += 1;
    return this.generation;
  }

  isObsolete(generation: number): boolean {
    return this.cancelled || generation !== this.generation;
  }

  append(entry: HistoryEntry): void {
    this.entries.push({ ...entry });
  }

  history(): HistoryEntry[] {
    return this.entries.map((entry) => ({ ...entry }));
  }

  bargeIn(spokenWords: number): void {
    if (this.cancelled) return;
    this.cancelled = true;
    this.generation += 1;
    this.abort.abort();
    this.deps.onAbortLLM();
    this.deps.onCancelTTS();
    this.deps.onDropAudio();
    this.entries = trimHistoryToSpokenWords(this.entries, spokenWords);
  }
}
