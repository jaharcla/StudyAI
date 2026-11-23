import { describe, expect, it } from "vitest";
import { artifactBriefSchema, compileArtifactBrief } from "../src/canvas/ai/teaching-scene";
import { applyArtifactBriefProposal, proposeArtifactBrief } from "../src/canvas/tutor";
import { emptyCanvasDocument, parseCanvasDocument, type ScientificObject } from "../src/canvas/model";
import type { LayoutRect } from "../src/canvas/ai/layout";

const viewport: LayoutRect = { x: 0, y: 0, width: 4000, height: 3000 };

const frictionBrief = {
  boardId: "board-a",
  topic: "friction from module 1",
  artifact: {
    kind: "question",
    count: 1,
    prompt: "Draw the forces on the block and state the friction direction.",
    answer: "Friction opposes the motion down the slope.",
    citationLabel: "Module 1 · p. 4",
    concepts: ["friction", "free-body diagram"],
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
  sourceRefs: ["module-1#p4"],
  reason: "The student asked for a friction question with a diagram.",
};

const aliasedBrief = { ...frictionBrief, placement: { near: "#block", relation: "beside" } as const };

describe("ArtifactBrief schema", () => {
  it("accepts a semantic brief and exposes no coordinate field", () => {
    const brief = artifactBriefSchema.parse(frictionBrief);
    expect(brief.artifact.prompt).toContain("forces");
    expect(Object.keys(brief)).not.toContain("x");
    expect(Object.keys(brief)).not.toContain("y");
    expect(() => artifactBriefSchema.parse({ ...frictionBrief, x: 100 })).toThrow();
  });

  it("validates count 1-8 instead of clamping it", () => {
    expect(artifactBriefSchema.parse({ ...frictionBrief, artifact: { ...frictionBrief.artifact, count: 8 } }).artifact.count).toBe(8);
    expect(() => artifactBriefSchema.parse({ ...frictionBrief, artifact: { ...frictionBrief.artifact, count: 0 } })).toThrow();
    expect(() => artifactBriefSchema.parse({ ...frictionBrief, artifact: { ...frictionBrief.artifact, count: 9 } })).toThrow();
  });

  it("rejects duplicate source refs", () => {
    expect(() => artifactBriefSchema.parse({ ...frictionBrief, sourceRefs: ["a", "a"] })).toThrow(/unique/i);
  });
});

describe("compileArtifactBrief", () => {
  it("compiles a freebody question into a question plus labelled force objects, clear of occupancy", () => {
    const occupancy: LayoutRect[] = [{ x: 100, y: 100, width: 300, height: 220 }];
    const compiled = compileArtifactBrief(artifactBriefSchema.parse(frictionBrief), { occupancy, viewport });
    expect(compiled.objects.map((object) => object.kind)).toEqual(["question", "force", "force", "force"]);
    const labels = compiled.objects.filter((object) => object.kind === "force").map((object) => (object as { label: string }).label);
    expect(labels).toEqual(["gravity", "normal", "friction"]);
    expect(compiled.objects.every((object) => object.provenance?.status === "generated-unverified")).toBe(true);
    for (const object of compiled.objects) {
      expect(object.x >= occupancy[0].x + occupancy[0].width + 60 || object.y >= occupancy[0].y + occupancy[0].height + 60).toBe(true);
    }
    expect(compiled.description).toMatch(/generated, not verified/i);
    expect(compiled.description).toContain("Module 1 · p. 4");
  });

  it("returns a conflict with a suggestion and places nothing when the board is crowded", () => {
    expect(() => compileArtifactBrief(artifactBriefSchema.parse(frictionBrief), {
      occupancy: [viewport],
      viewport,
    })).toThrow(/no clear|suggested free area/i);
  });

  it("resolves transient #aliases against board anchors and never persists them", () => {
    const anchors = new Map<string, LayoutRect>([["#block", { x: 100, y: 100, width: 300, height: 220 }]]);
    const compiled = compileArtifactBrief(artifactBriefSchema.parse(aliasedBrief), {
      occupancy: [anchors.get("#block")!],
      viewport,
      anchors,
    });
    const saved = parseCanvasDocument({ ...emptyCanvasDocument(), objects: compiled.objects });
    const strings: string[] = [];
    const collect = (value: unknown): void => {
      if (typeof value === "string") strings.push(value);
      else if (Array.isArray(value)) value.forEach(collect);
      else if (value && typeof value === "object") Object.values(value).forEach(collect);
    };
    collect(saved);
    expect(strings.some((value) => value.startsWith("#"))).toBe(false);
    expect(strings.some((value) => value.includes("#block"))).toBe(false);
  });

  it("rejects an unresolved alias rather than placing blindly", () => {
    expect(() => compileArtifactBrief(artifactBriefSchema.parse(aliasedBrief), { occupancy: [], viewport, anchors: new Map() })).toThrow(/unknown alias/i);
  });

  it("uses the existing mindmap kind as an authorable figure target", () => {
    const brief = artifactBriefSchema.parse({
      ...frictionBrief,
      artifact: { ...frictionBrief.artifact, kind: "figure", figure: { kind: "mindmap", title: "Friction map" } },
    });
    const compiled = compileArtifactBrief(brief, { occupancy: [], viewport });
    const map = compiled.objects.find((object) => object.kind === "mindmap") as Extract<ScientificObject, { kind: "mindmap" }> | undefined;
    expect(map?.title).toBe("Friction map");
    expect(map?.nodes.length).toBeGreaterThan(0);
  });
});

describe("artifact.kind dispatch", () => {
  const briefFor = (kind: string) => artifactBriefSchema.parse({
    ...frictionBrief,
    artifact: { ...frictionBrief.artifact, kind },
  });

  it("question compiles to a question plus its figure", () => {
    const compiled = compileArtifactBrief(briefFor("question"), { viewport });
    expect(compiled.objects.map((object) => object.kind)).toEqual(["question", "force", "force", "force"]);
  });

  it("figure compiles to figure objects only, with no question", () => {
    const compiled = compileArtifactBrief(briefFor("figure"), { viewport });
    expect(compiled.objects.map((object) => object.kind)).toEqual(["force", "force", "force"]);
    expect(compiled.objects.some((object) => object.kind === "question")).toBe(false);
  });

  it("worked-example compiles to a worked question carrying steps plus its figure", () => {
    const compiled = compileArtifactBrief(briefFor("worked-example"), { viewport });
    expect(compiled.objects.map((object) => object.kind)).toEqual(["question", "force", "force", "force"]);
    const worked = compiled.objects.find((object) => object.kind === "question") as Extract<ScientificObject, { kind: "question" }>;
    expect(worked.answer).toContain("Friction opposes");
  });

  it("deck compiles to one flashcard per count rather than questions", () => {
    const brief = artifactBriefSchema.parse({
      ...frictionBrief,
      artifact: { ...frictionBrief.artifact, kind: "deck", count: 3, figure: undefined },
    });
    const compiled = compileArtifactBrief(brief, { viewport });
    expect(compiled.objects.map((object) => object.kind)).toEqual(["flashcard", "flashcard", "flashcard"]);
    const cards = compiled.objects as Array<Extract<ScientificObject, { kind: "flashcard" }>>;
    expect(cards.every((card) => card.front.length > 0 && card.back.length > 0)).toBe(true);
  });

  it("problem-set compiles to count question objects", () => {
    const brief = artifactBriefSchema.parse({
      ...frictionBrief,
      artifact: { ...frictionBrief.artifact, kind: "problem-set", count: 2, figure: undefined },
    });
    const compiled = compileArtifactBrief(brief, { viewport });
    expect(compiled.objects.map((object) => object.kind)).toEqual(["question", "question"]);
  });
});

describe("ArtifactBrief proposal", () => {
  const context = { boardId: "board-a", courseId: "chem-120", lessonId: "lesson-03", revision: 7, objects: [] as ScientificObject[] };

  it("proposes one verified-transaction bundle and applies it as one object set", () => {
    const proposal = proposeArtifactBrief(context, frictionBrief, 7);
    expect(proposal.verification).toBe("generated-unverified");
    expect(proposal.sourceRefs).toEqual(["module-1#p4"]);
    const applied = applyArtifactBriefProposal(context, proposal);
    expect(applied).toHaveLength(4);
    expect(() => parseCanvasDocument({ ...emptyCanvasDocument(), objects: applied })).not.toThrow();
  });

  it("applies each advertised kind as exactly its compiled bundle and stays parseable", () => {
    const cases: Array<{ kind: string; count: number; expected: string[] }> = [
      { kind: "question", count: 1, expected: ["question", "force", "force", "force"] },
      { kind: "problem-set", count: 2, expected: ["question", "question"] },
      { kind: "figure", count: 1, expected: ["force", "force", "force"] },
      { kind: "worked-example", count: 1, expected: ["question", "force", "force", "force"] },
      { kind: "deck", count: 2, expected: ["flashcard", "flashcard"] },
    ];
    for (const testCase of cases) {
      const brief = artifactBriefSchema.parse({
        ...frictionBrief,
        artifact: {
          ...frictionBrief.artifact,
          kind: testCase.kind,
          count: testCase.count,
          figure: testCase.kind === "problem-set" || testCase.kind === "deck" ? undefined : frictionBrief.artifact.figure,
        },
      });
      const proposal = proposeArtifactBrief(context, brief, 7);
      const applied = applyArtifactBriefProposal(context, proposal);
      expect(applied.map((object) => object.kind)).toEqual(testCase.expected);
      expect(applied.map((object) => object.id)).toEqual(proposal.objects.map((object) => object.id));
      expect(applied.every((object) => object.provenance?.status === "generated-unverified")).toBe(true);
      expect(() => parseCanvasDocument({ ...emptyCanvasDocument(), objects: applied })).not.toThrow();
    }
  });

  it("refuses a stale revision and a changed board", () => {
    const proposal = proposeArtifactBrief(context, frictionBrief, 7);
    expect(() => applyArtifactBriefProposal({ ...context, revision: 8 }, proposal)).toThrow(/stale|revision/i);
    expect(() => applyArtifactBriefProposal({ ...context, objects: [proposal.objects[0]] }, proposal)).toThrow(/stale/i);
  });

  it("cannot present a cited-but-unsupported claim as course fact", () => {
    const proposal = proposeArtifactBrief(context, { ...frictionBrief, sourceRefs: [] }, 7);
    expect(proposal.objects.every((object) => object.provenance?.status === "generated-unverified")).toBe(true);
    expect(proposal.description).toContain("generated, not verified");
    expect(proposal.description).not.toMatch(/^verified/i);
  });
});
