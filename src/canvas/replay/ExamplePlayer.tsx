import { useEffect } from "react";
import type { CompiledExampleState } from "../ai/teaching-scene";
import { stateAt, type PlayerEvent, type PlayerState } from "./example-player";

type Props = {
  player: PlayerState;
  states: readonly CompiledExampleState[];
  mode: "replay" | "editing";
  onEvent: (event: PlayerEvent) => void;
  onTakeover: () => void;
};

/**
 * View-only step rail over compiler-produced states. It never calls a board write: navigation is
 * local view state, and Take over is a mode switch that leaves the saved revision untouched.
 */
export function ExamplePlayer({ player, states, mode, onEvent, onTakeover }: Props) {
  const total = states.length;
  const state = stateAt(states, player.stepIndex);

  useEffect(() => {
    if (mode !== "replay" || !player.playing || total < 2) return;
    if (player.stepIndex >= total - 1) { onEvent("pause"); return; }
    const timer = window.setTimeout(() => onEvent("next"), 1600 / player.speed);
    return () => window.clearTimeout(timer);
  }, [mode, player.playing, player.stepIndex, player.speed, total, onEvent]);

  return (
    <section className="steppable-rail" data-testid="steppable-rail" role="region" aria-label="Worked example step rail">
      <div className="steppable-head">
        <h2>Worked example</h2>
        <span className="steppable-mode" role="status">{mode === "editing" ? "Your turn — editing" : "Replay"}</span>
        {mode === "replay" && (
          player.playing
            ? <button type="button" className="button-soft" data-testid="steppable-pause" onClick={() => onEvent("pause")}>Pause</button>
            : <button type="button" className="button-soft" data-testid="steppable-play" onClick={() => onEvent("play")} disabled={total < 2}>Play</button>
        )}
      </div>

      <div className="steppable-controls">
        <div className="steppable-timeline" aria-hidden="true">
          {states.map((step, index) => <span key={step.id} className={`steppable-tick${index <= player.stepIndex ? " reached" : ""}${index === player.stepIndex ? " current" : ""}`} />)}
        </div>
        <output className="steppable-label" data-testid="steppable-step-label" aria-live="polite">Step {player.stepIndex + 1} of {total}</output>
        <div className="steppable-buttons">
          <button type="button" className="button-soft" data-testid="steppable-prev" aria-label="Previous step" disabled={player.stepIndex === 0} onClick={() => onEvent("prev")}>‹ Prev</button>
          <label className="steppable-jump-label">Jump
            <select data-testid="steppable-jump" aria-label="Jump to step" value={player.stepIndex} onChange={(event) => onEvent({ jump: Number(event.target.value) })}>
              {states.map((step, index) => <option key={step.id} value={index}>{index + 1}. {step.id}</option>)}
            </select>
          </label>
          <button type="button" className="button-soft" data-testid="steppable-next" aria-label="Next step" disabled={player.stepIndex === total - 1} onClick={() => onEvent("next")}>Next ›</button>
        </div>
      </div>

      <p className="steppable-narration" data-testid="steppable-narration">{state.narration}</p>
      <div className="steppable-provenance">
        <span className="artifact-provenance" data-testid="generated-unverified">generated, not verified</span>
        {state.sourceRefs.map((ref) => <a key={ref} href={`#studyai-citation=${encodeURIComponent(ref)}`}>course excerpt</a>)}
        <button type="button" className="button-soft" data-testid="steppable-takeover" disabled={mode === "editing"} onClick={onTakeover}>
          {mode === "editing" ? "Taken over" : "Take over"}
        </button>
      </div>
    </section>
  );
}
