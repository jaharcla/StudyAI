import { describe, expect, it } from "vitest";
import { compileArtifactBrief, type ArtifactBrief } from "../src/canvas/ai/teaching-scene";
import { proposeArtifactBrief } from "../src/canvas/tutor";
import { emptyCanvasDocument } from "../src/canvas/model";

const sourceRef = "studyai://document/module-1/text/4?chunk=0";

const workedBrief = (states?: ArtifactBrief["artifact"]["states"], steps: string[] = ["legacy step"]): ArtifactBrief => ({
  boardId: "board-1",
  topic: "friction from module 1",
  artifact: {
    kind: "worked-example",
    count: 1,
    prompt: "Draw the three forces on the block.",
    answer: "Friction opposes the motion down the slope.",
    concepts: ["friction"],
    ...(states ? { states } : {}),
    steps,
    // steppable compiler reads artifact.states; legacy narration stays in package steps.
    figure: {
      kind: "freebody",
      title: "Forces on the block",
      forces: [
        { label: "gravity", components: [0, -9.8] },
        { label: "normal", components: [3, 5] },
        { label: "friction", components: [-4, 0] },
      ],
    },
  },
  placement: { relation: "clear-area" },
  sourceRefs: [sourceRef],
  reason: "A replayable worked example.",
}) as ArtifactBrief;

const authoredStates: NonNullable<ArtifactBrief["artifact"]["states"]> = [
  { id: "setup", narration: "Set up the problem.", reveal: ["question"], highlight: ["question"] },
  { id: "gravity", narration: "Add gravity.", reveal: ["gravity"], highlight: ["gravity"], focus: "question" },
  { id: "forces", narration: "Add normal and friction.", reveal: ["normal", "friction"], highlight: ["friction"] },
];

describe("compile worked-example steps into canvas states (Task 1.2)", () => {
  it("authored step intents compile to cumulative states over one object set", () => {
    const compiled = compileArtifactBrief(workedBrief(authoredStates));
    expect(compiled.states).toHaveLength(3);
    const [setup, gravity, forces] = compiled.states!;
    expect(setup.objectIds).toHaveLength(1);
    expect(gravity.objectIds).toHaveLength(2);
    expect(forces.objectIds).toHaveLength(4);
    expect(gravity.objectIds[0]).toBe(setup.objectIds[0]);
    expect(forces.objectIds).toEqual(expect.arrayContaining([setup.objectIds[0], gravity.objectIds[1]]));
    expect(setup.sourceRefs).toEqual([sourceRef]);
    expect(gravity.highlightIds).toEqual([gravity.objectIds[1]]);
    expect(forces.objectIds).toHaveLength(compiled.objects.length);
  });

  it("throws Unknown alias before returning any object", () => {
    const bad = compileArtifactBrief.bind(null, workedBrief([
      { id: "bad", narration: "n", reveal: ["not-a-real-object"], highlight: [] },
    ]));
    expect(bad).toThrow(/Unknown alias/);
  });

  it("a worked-example without states compiles legacy steps, final state reveals all objects", () => {
    const compiled = compileArtifactBrief(workedBrief(undefined, ["Identify", "Oppose", "Result"]));
    expect(compiled.states).toHaveLength(3);
    expect(compiled.states!.every((state) => state.objectIds.length > 0)).toBe(true);
    const final = compiled.states!.at(-1)!;
    expect(final.objectIds).toHaveLength(compiled.objects.length);
    expect(compiled.states!.map((state) => state.narration)).toEqual(["Identify", "Oppose", "Result"]);
  });

  it("every state object id resolves to a compiled object and layout is computed once", () => {
    const brief = workedBrief(authoredStates);
    const compiled = compileArtifactBrief(brief);
    const again = compileArtifactBrief(brief);
    const ids = new Set(compiled.objects.map((object) => object.id));
    for (const state of compiled.states!) {
      for (const id of state.objectIds) expect(ids.has(id)).toBe(true);
    }
    const positions = compiled.objects.map((object) => [object.x, object.y, object.width, object.height]);
    const positionsAgain = again.objects.map((object) => [object.x, object.y, object.width, object.height]);
    expect(positions).toEqual(positionsAgain);
  });

  it("states survive proposeArtifactBrief unchanged", () => {
    const compiled = compileArtifactBrief(workedBrief(authoredStates));
    const proposal = proposeArtifactBrief({
      boardId: "board-1", courseId: "CHEM-120", lessonId: "quantum", revision: 3,
      objects: [],
    }, workedBrief(authoredStates));
    expect(proposal.states?.map((state) => [state.index, state.id, state.narration])).toEqual(
      compiled.states?.map((state) => [state.index, state.id, state.narration]),
    );
    expect(proposal.states?.at(-1)?.objectIds).toHaveLength(proposal.objects.length);
    expect(emptyCanvasDocument().version).toBe(1);
  });
});
