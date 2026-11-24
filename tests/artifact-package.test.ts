import { describe, expect, it } from "vitest";
import { parseArtifactPackage } from "../src/artifacts/package";

const REF = "studyai://document/module-1/text/4?chunk=0";
const retrievedRefs = [REF];

const component = (kind: string, id: string, extra: Record<string, unknown> = {}) => ({
  id, kind, sourceRefs: [REF], ...extra,
});

const validSlideDeck = () => ({
  id: "sd1", kind: "slide_deck", sourceRefs: [REF],
  objective: "Understand friction", templateId: "general-en", language: "en",
  slides: [
    {
      role: "title", title: "Friction", claims: [], notes: "Introduce the topic.",
    },
    {
      role: "mechanism", title: "Friction opposes motion",
      claims: [{ claim: "Friction opposes motion.", sourceRef: REF, excerpt: "Friction opposes motion.", relationship: "direct" }],
      visual: { kind: "diagram", altText: "Force arrows on an inclined plane" },
      notes: "Explain the direction.",
    },
  ],
});

const allKinds = [
  validSlideDeck(),
  component("explanation", "e1", { text: "Friction opposes motion.", concepts: ["friction"] }),
  component("worked-example", "we1", { prompt: "Find the friction direction.", steps: ["Identify motion", "Oppose it"], answer: "Uphill." }),
  component("diagram", "d1", { title: "Forces", surfaceAngleDeg: 0, forces: [{ label: "gravity", components: [0, -9.8] }] }),
  component("equation", "eq1", { expression: "F = m*a", variables: { m: 2, a: 3 } }),
  component("graph", "g1", { expression: "x^2", xRange: [-2, 2], xLabel: "x", yLabel: "y" }),
  component("question", "q1", { prompt: "Which way does friction act?", answer: "Uphill." }),
  component("flashcard", "fc1", { front: "Friction direction?", back: "Opposes motion." }),
  component("mind-map", "mm1", { title: "Forces", nodes: [{ id: "root", label: "Forces" }, { id: "f", label: "Friction" }], edges: [{ from: "root", to: "f" }] }),
  component("interactive-exercise", "ix1", {
    prompt: "Read the graph.",
    exercise: { mode: "graph-interpretation", slope: 2, intercept: 0, xRange: [-1, 1], atX: 1 },
  }),
  component("summary", "s1", { title: "Forces recap", sections: [{ heading: "Friction", body: "Opposes motion." }] }),
];

const makePackage = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  id: "pkg-1",
  objective: "Understand friction",
  courseId: "chem-120",
  lessonId: "lesson-03",
  components: allKinds,
  relations: [{ from: "e1", to: "q1", relation: "explains" }],
  ...overrides,
});

describe("cycle 4 additive schema", () => {
  it("accepts a first-class insufficient-source outcome with no components", () => {
    const pkg = parseArtifactPackage({
      schemaVersion: 1,
      id: "refusal",
      objective: "Exam topics",
      courseId: "c1",
      lessonId: "l1",
      components: [],
      outcome: {
        status: "insufficient-source",
        missing: ["final exam announcement"],
        nextStep: "Upload the announcement or course outline.",
      },
    }, []);
    expect(pkg.outcome?.status).toBe("insufficient-source");
    expect(pkg.components).toEqual([]);
  });

  it("rejects an empty package with no outcome", () => {
    expect(() => parseArtifactPackage({
      schemaVersion: 1, id: "empty", objective: "Nothing", courseId: "c1", lessonId: "l1", components: [],
    }, [])).toThrow(/component/i);
  });

  it("accepts an application point on a diagram force", () => {
    const pkg = parseArtifactPackage({
      schemaVersion: 1, id: "torque", objective: "Torque", courseId: "c1", lessonId: "l1",
      components: [{
        id: "d1", kind: "diagram", title: "Beam", sourceRefs: [REF],
        forces: [{ label: "applied", components: [0, -10], position: { x: 20, y: 100 } }],
      }],
    }, [REF]);
    expect(pkg.components[0]).toMatchObject({ forces: [{ position: { x: 20, y: 100 } }] });
  });
});

describe("parseArtifactPackage", () => {
  it("round-trips one component of every advertised kind", () => {
    const pkg = parseArtifactPackage(makePackage(), retrievedRefs);
    expect(pkg.components.map((component) => component.kind)).toEqual(allKinds.map((component) => component.kind));
    expect(pkg.schemaVersion).toBe(1);
    expect(pkg.acceptance.decision).toBe("pending");
  });

  it("rejects a relation with an unknown endpoint", () => {
    expect(() => parseArtifactPackage(makePackage({
      relations: [{ from: "e1", to: "missing", relation: "tests" }],
    }), retrievedRefs)).toThrow(/unknown endpoint/i);
  });

  it("rejects a cycle in component relations", () => {
    expect(() => parseArtifactPackage(makePackage({
      relations: [{ from: "e1", to: "q1", relation: "explains" }, { from: "q1", to: "e1", relation: "tests" }],
    }), retrievedRefs)).toThrow(/cycle/i);
  });

  it("rejects a sourceRef that was not retrieved", () => {
    const components = allKinds.map((component, index) => index === 0
      ? { ...component, sourceRefs: ["invented#p99"] }
      : component);
    expect(() => parseArtifactPackage(makePackage({ components }), retrievedRefs)).toThrow(/not retrieved/i);
  });

  it("rejects duplicate component ids", () => {
    const components = [...allKinds, { ...allKinds[0] }];
    expect(() => parseArtifactPackage(makePackage({ components }), retrievedRefs)).toThrow(/duplicate/i);
  });
});

describe("slide_deck component", () => {
  const deckPackage = (deck: unknown) => makePackage({ components: [deck], relations: [] });

  it("accepts a semantic deck with claims and visual intent", () => {
    const pkg = parseArtifactPackage(deckPackage(validSlideDeck()), retrievedRefs);
    expect(pkg.components[0].kind).toBe("slide_deck");
  });

  it("rejects a coordinate field on the component", () => {
    expect(() => parseArtifactPackage(deckPackage({ ...validSlideDeck(), left: 10 }), retrievedRefs)).toThrow();
  });

  it("rejects a shape id on a slide", () => {
    const deck = validSlideDeck();
    expect(() => parseArtifactPackage(deckPackage({
      ...deck, slides: [{ ...deck.slides[0], shapeId: 4 }, deck.slides[1]],
    }), retrievedRefs)).toThrow();
  });

  it("rejects a sourceRef that was not retrieved", () => {
    expect(() => parseArtifactPackage(deckPackage({
      ...validSlideDeck(), sourceRefs: ["invented#p9"],
    }), retrievedRefs)).toThrow(/not retrieved/i);
  });
});
