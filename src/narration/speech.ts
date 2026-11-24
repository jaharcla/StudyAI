/** Browser-native speech only: no key, no network audio, no dependency. */
export class WebSpeechEngine {
  private active: (() => void) | null = null;

  constructor(private readonly synth?: SpeechSynthesis) {}

  supported(): boolean {
    if (this.synth) return true;
    return typeof window !== "undefined" && Boolean(window.speechSynthesis) && typeof SpeechSynthesisUtterance !== "undefined";
  }

  speak(text: string, rate: number, estimatedMs: number, onEnd: () => void): void {
    this.cancel();
    const synth = this.synth ?? (typeof window !== "undefined" ? window.speechSynthesis : undefined);
    if (!synth || typeof SpeechSynthesisUtterance === "undefined") {
      onEnd();
      return;
    }

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimer();
      this.active = null;
      onEnd();
    };
    // Word boundaries are unreliable across browsers; a bounded timer keeps the cue timeline moving.
    const timer = setTimeout(finish, Math.min(120_000, estimatedMs + 2_000));
    const clearTimer = () => clearTimeout(timer);
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = rate;
    utterance.pitch = 1;
    utterance.lang = "en-US";
    utterance.onend = finish;
    utterance.onerror = finish;
    this.active = () => {
      if (done) return;
      done = true;
      clearTimer();
      utterance.onend = null;
      utterance.onerror = null;
      this.active = null;
      synth.cancel();
      onEnd();
    };
    synth.speak(utterance);
  }

  cancel(): void {
    this.active?.();
  }
}
