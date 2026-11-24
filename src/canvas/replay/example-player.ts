import type { CompiledExampleState } from "../ai/teaching-scene";
import type { CanvasDocument, ScientificObject } from "../model";

/**
 * A view-only cursor over compiler-produced states. This module is deliberately pure: no React,
 * no DOM, no board read, no persistence. Navigation never writes a canvas revision.
 */
export type PlayerState = {
  exampleId: string;
  stepIndex: number;
  playing: boolean;
  speed: number;
};

export type PlayerEvent = "prev" | "next" | "play" | "pause" | { jump: number };

const clamp = (index: number, total: number): number => Math.max(0, Math.min(total - 1, Math.trunc(Number.isFinite(index) ? index : 0)));

export function initPlayer(exampleId: string, stepIndex = 0): PlayerState {
  return { exampleId, stepIndex: Math.max(0, Math.trunc(Number.isFinite(stepIndex) ? stepIndex : 0)), playing: false, speed: 1 };
}

export function reducePlayer(state: PlayerState, event: PlayerEvent, total: number): PlayerState {
  const count = Math.max(0, total);
  if (event === "play") return count > 1 ? { ...state, playing: true } : state;
  if (event === "pause") return { ...state, playing: false };
  if (event === "next") {
    const stepIndex = clamp(state.stepIndex + 1, count || 1);
    return { ...state, stepIndex: Math.min(stepIndex, Math.max(0, count - 1)), playing: false };
  }
  if (event === "prev") return { ...state, stepIndex: clamp(state.stepIndex - 1, count || 1), playing: false };
  return { ...state, stepIndex: clamp(event.jump, count || 1), playing: false };
}

export function stateAt(states: readonly CompiledExampleState[], index: number): CompiledExampleState {
  if (!states.length) throw new Error("A worked example needs at least one state.");
  return states[clamp(index, states.length)];
}

export function visibleObjects(doc: CanvasDocument, state: CompiledExampleState): ScientificObject[] {
  const byId = new Map(doc.objects.map((object) => [object.id, object]));
  const objects: ScientificObject[] = [];
  for (const id of state.objectIds) {
    const object = byId.get(id);
    if (object) objects.push(object);
  }
  return objects;
}
