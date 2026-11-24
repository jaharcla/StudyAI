import { describe, expect, it } from "vitest";
import { initPlayer, reducePlayer, stateAt, visibleObjects } from "../src/canvas/replay/example-player";
import type { CompiledExampleState } from "../src/canvas/ai/teaching-scene";
import type { CanvasDocument } from "../src/canvas/model";

const states: CompiledExampleState[] = [
  { index: 0, id: "setup", narration: "Setup", objectIds: ["q", "g"], highlightIds: ["g"], sourceRefs: ["ref-1"] },
  { index: 1, id: "forces", narration: "Forces", objectIds: ["q", "g", "n"], highlightIds: ["n"], sourceRefs: ["ref-1"] },
  { index: 2, id: "result", narration: "Result", objectIds: ["q", "g", "n", "f"], highlightIds: [], sourceRefs: ["ref-1"] },
];

const object = (id: string) => ({ id, kind: "question" as const, x: 0, y: 0, width: 10, height: 10, prompt: id, provenance: { status: "generated-unverified" as const, sourceRefs: ["ref-1"] } });
const document: CanvasDocument = {
  version: 1,
  snapshot: { document: { store: {} } },
  objects: [object("f"), object("n"), object("g"), object("q")],
};

describe("pure worked-example player (Task 1.3)", () => {
  it("initPlayer starts at step 0, paused", () => {
    expect(initPlayer("ex-1")).toEqual({ exampleId: "ex-1", stepIndex: 0, playing: false, speed: 1 });
    expect(initPlayer("ex-1", 2).stepIndex).toBe(2);
  });

  it("next at the last step stays and stops playing", () => {
    const atEnd = { ...initPlayer("ex-1"), stepIndex: 2, playing: true };
    expect(reducePlayer(atEnd, "next", 3)).toEqual({ ...atEnd, playing: false });
  });

  it("prev at step 0 stays at 0", () => {
    expect(reducePlayer(initPlayer("ex-1"), "prev", 3).stepIndex).toBe(0);
  });

  it("jump clamps below 0 and above total-1", () => {
    expect(reducePlayer(initPlayer("ex-1"), { jump: -5 }, 3).stepIndex).toBe(0);
    expect(reducePlayer(initPlayer("ex-1"), { jump: 99 }, 3).stepIndex).toBe(2);
  });

  it("play and pause toggle only playing", () => {
    const paused = initPlayer("ex-1");
    expect(reducePlayer(paused, "play", 3)).toEqual({ ...paused, playing: true });
    expect(reducePlayer({ ...paused, playing: true }, "pause", 3)).toEqual(paused);
  });

  it("manual navigation always pauses playback", () => {
    const playing = { ...initPlayer("ex-1"), playing: true };
    expect(reducePlayer(playing, "next", 3).playing).toBe(false);
    expect(reducePlayer(playing, "prev", 3).playing).toBe(false);
    expect(reducePlayer(playing, { jump: 1 }, 3).playing).toBe(false);
  });

  it("stateAt clamps an out-of-range index", () => {
    expect(stateAt(states, -1).id).toBe("setup");
    expect(stateAt(states, 50).id).toBe("result");
  });

  it("visibleObjects returns exact references in reveal order without cloning", () => {
    const visible = visibleObjects(document, states[2]);
    expect(visible).toHaveLength(4);
    expect(visible.map((item) => item.id)).toEqual(["q", "g", "n", "f"]);
    expect(visible[0]).toBe(document.objects[3]);
    expect(visible.every((item) => document.objects.includes(item))).toBe(true);
    expect(visible[0].provenance).toEqual({ status: "generated-unverified", sourceRefs: ["ref-1"] });
    expect(document.objects).toHaveLength(4);
  });
});
