import { describe, expect, it } from "vitest";
import { runCondition, scoreArtifact, type ArtifactGenerator, type ArtifactTask } from "./visual";

const task: ArtifactTask = {
  id: "molecule-ethanol",
  kind: "molecular-structure",
  prompt: "Draw ethanol with labelled bonds",
  expectedObjects: 9,
  expectedRelationships: 8,
};

const rubric = {
  checks: [
    { id: "textTruncation" },
    { id: "overlap" },
    { id: "arrowCrossing" },
    { id: "arrowLabelOverlap" },
    { id: "spacing" },
    { id: "readability" },
    { id: "zoneLabelPlacement" },
    { id: "labelToElementAssociation" },
    { id: "stemSymbolCorrectness" },
    { id: "chemistryBondOrder" },
    { id: "vectorArrowDirection" },
  ],
};

describe("scoreArtifact", () => {
  it("counts all seven upstream checks plus STEM extensions separately", () => {
    const result = scoreArtifact(
      {
        task,
        observation: {
          overlap: 1,
          textTruncation: 1,
          arrowLabelOverlap: 1,
          chemistryBondOrder: 1,
          vectorArrowDirection: 1,
          objects: 9,
          relationships: 8,
        },
      },
      rubric
    );

    expect(result.byCheck.overlap).toBe(1);
    expect(result.byCheck.textTruncation).toBe(1);
    expect(result.byCheck.arrowLabelOverlap).toBe(1);
    expect(result.byCheck.chemistryBondOrder).toBe(1);
    expect(result.byCheck.vectorArrowDirection).toBe(1);
    expect(result.byCheck.labelToElementAssociation).toBe(0);
    expect(result.total).toBe(5);
    expect(result.structuralCorrect).toBe(true);
    expect(result.stemCorrect).toBe(false);
  });
});

describe("runCondition", () => {
  it("A stops after one generation; B inspects, corrects and re-inspects", async () => {
    const generator: ArtifactGenerator = async (_task, phase) => ({
      observation: phase === "initial"
        ? { overlap: 2, textTruncation: 1, objects: 3, relationships: 2 }
        : { objects: 3, relationships: 2 },
      screenshots: [`/tmp/${_task.id}-${phase}.png`],
      tokens: 100,
      toolCalls: 2,
      durationMs: 50,
    });

    const a = await runCondition(task, "A", generator);
    const b = await runCondition(task, "B", generator);

    expect(a.iterations).toBe(1);
    expect(a.defectsAfter).toBe(a.defectsBefore);
    expect(b.iterations).toBe(2);
    expect(b.defectsBefore).toBe(3);
    expect(b.defectsAfter).toBe(0);
    expect(b.corrected).toBe(true);
    expect(b.tokens).toBe(200);
    expect(b.toolCalls).toBe(4);
    expect(b.evidencePaths.length).toBe(2);
  });
});
