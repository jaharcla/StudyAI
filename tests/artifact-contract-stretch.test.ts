import { describe, expect, it } from "vitest";
import { COMPONENT_OWNERS, componentOwner, type ArtifactRenderer } from "../src/artifacts/contracts";
import type { GenerationContext, RenderContext } from "../src/artifacts/context";
import { parseArtifactPackage, type ArtifactComponent } from "../src/artifacts/package";
import { OWNED_KINDS, projectPackage } from "../src/artifacts/project";

const REF = "studyai://document/module-1/text/4?chunk=0";
const CHUNK = { ref: REF, text: "Friction opposes the motion down the slope." };

const componentShapes: Record<ArtifactComponent["kind"], Record<string, unknown>> = {
  explanation: { text: "Friction opposes motion." },
  "worked-example": { prompt: "Find friction.", steps: ["Step"], answer: "Uphill." },
  diagram: { title: "Forces", forces: [{ label: "g", components: [0, -9.8] }] },
  equation: { expression: "F=m*a" },
  graph: { expression: "x", xRange: [-1, 1] },
  question: { prompt: "Which way?" },
  flashcard: { front: "F?", back: "B." },
  "mind-map": { title: "M", nodes: [{ id: "n", label: "N" }] },
  "interactive-exercise": { prompt: "I", exercise: { mode: "force-motion", massKg: 2, forcesN: [4] } },
  summary: { title: "S", sections: [{ heading: "H", body: "B." }] },
};

const components = OWNED_KINDS.map((kind, index) => ({ id: `c${index}`, kind, sourceRefs: [REF], ...componentShapes[kind] }));
const makePackage = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: 1, id: "stretch", objective: "Friction", courseId: "c1", lessonId: "l1", components, ...overrides,
});

describe("Phase A shared context/citation contract", () => {
  it("carries evidence, concept state and layout anchors as arguments only", () => {
    const generation: GenerationContext = {
      courseId: "c1", lessonId: "l1", objective: "Friction", intent: "explain", format: "infographic",
      evidence: [CHUNK], concepts: [{ conceptId: "friction", mastery: 0.4, dueCount: 2 }],
      canvasAnchors: [{ x: 0, y: 0, width: 100, height: 100 }],
    };
    const pkg = parseArtifactPackage(makePackage({ format: "infographic" }), [REF], [CHUNK]);
    const render: RenderContext = { pkg, preferences: { showCitations: true, language: "en" } };
    expect(generation.evidence[0]?.ref).toBe(REF);
    expect(render.pkg.format).toBe("infographic");
  });

  it("rejects a claim whose sourceRef was never retrieved", () => {
    const pkg = makePackage({
      components: [{ id: "e", kind: "explanation", text: "Prose", sourceRefs: [REF], claims: [{ claim: "x", sourceRef: "invented#p99", excerpt: "x", relationship: "direct" }] }],
    });
    expect(() => parseArtifactPackage(pkg, [REF], [CHUNK])).toThrow(/Claim sourceRef.*not retrieved/i);
  });

  it("rejects a direct claim whose excerpt is not contained in its retrieved chunk", () => {
    const pkg = makePackage({
      components: [{ id: "e", kind: "explanation", text: "Prose", sourceRefs: [REF], claims: [{ claim: "x", sourceRef: REF, excerpt: "not in the chunk", relationship: "direct" }] }],
    });
    expect(() => parseArtifactPackage(pkg, [REF], [CHUNK])).toThrow(/no excerpt containment/i);
  });

  it("accepts a contained direct claim and keeps labelled interpretation reviewable", () => {
    const pkg = makePackage({
      components: [{ id: "e", kind: "explanation", text: "Prose", sourceRefs: [REF], claims: [
        { claim: "a", sourceRef: REF, excerpt: "Friction opposes", relationship: "direct" },
        { claim: "b", sourceRef: REF, excerpt: "not in the chunk", relationship: "interpretation" },
      ] }],
    });
    expect(parseArtifactPackage(pkg, [REF], [CHUNK]).components[0]?.claims).toHaveLength(2);
  });

  it("assigns every advertised component kind to exactly one renderer", () => {
    expect([...OWNED_KINDS].sort()).toEqual(Object.keys(COMPONENT_OWNERS).sort());
    const rendered: ArtifactRenderer[] = ["canvas", "studio", "learning"];
    const pkg = parseArtifactPackage(makePackage(), [REF]);
    const projection = projectPackage(pkg);
    for (const component of pkg.components) {
      const owners = rendered.filter((renderer) => projection[renderer].includes(component.id));
      expect(owners).toHaveLength(1);
      expect(owners[0]).toBe(componentOwner(component.kind));
    }
    for (const id of OWNED_KINDS) expect(componentOwner(id)).toBeDefined();
  });

  it("routes a diagram to studio only for the infographic format", () => {
    expect(componentOwner("diagram")).toBe("canvas");
    expect(componentOwner("diagram", "infographic")).toBe("studio");
    const pkg = parseArtifactPackage({ ...makePackage(), components: [components[2]], format: "infographic" }, [REF]);
    const projection = projectPackage(pkg);
    expect(projection.canvas).toEqual([]);
    expect(projection.studio).toEqual(["c2"]);
  });
});
