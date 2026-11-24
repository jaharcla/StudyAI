import { newId } from "../../src/canvas/model";
import { artifactBriefSchema, compileArtifactBrief, DEFAULT_VIEWPORT, type ArtifactBrief, type CompiledArtifact } from "../../src/canvas/ai/teaching-scene";
import type { LayoutRect } from "../../src/canvas/ai/layout";
import { validateCompiled } from "../../src/artifacts/validate";
import type { ValidationReport } from "../../src/artifacts/contracts";
import type { ArtifactPackage } from "../../src/artifacts/package";
import { componentsOfKind, projectPackage } from "../../src/artifacts/project";
import type { InfographicContent, StudioArtifact, StudyGuideContent } from "../studio/contracts";
import { ActivitySpecSchema, type ActivitySpec } from "../../src/learning/activities/contracts";

export type CompilePackageContext = {
  courseId: string;
  lessonId: string;
  boardId: string;
  occupancy: readonly LayoutRect[];
  viewport?: LayoutRect;
  anchors?: ReadonlyMap<string, LayoutRect>;
  retrievedRefs: readonly string[];
  retrievedChunks: ReadonlyArray<{ ref: string; text: string }>;
};

export type CompiledPackage = {
  canvas?: CompiledArtifact;
  studio?: StudioArtifact;
  learning?: ActivitySpec;
  outcome?: ArtifactPackage["outcome"];
  report: ValidationReport;
};

function deriveBrief(pkg: ArtifactPackage, ctx: CompilePackageContext): ArtifactBrief {
  const questions = componentsOfKind(pkg, ["question"]);
  const worked = componentsOfKind(pkg, ["worked-example"]);
  const cards = componentsOfKind(pkg, ["flashcard"]);
  const explanation = componentsOfKind(pkg, ["explanation"])[0];
  const diagram = componentsOfKind(pkg, ["diagram"])[0];
  const graph = componentsOfKind(pkg, ["graph"])[0];
  const equation = componentsOfKind(pkg, ["equation"])[0];
  const mindmap = componentsOfKind(pkg, ["mind-map"])[0];

  let figure: ArtifactBrief["artifact"]["figure"];
  if (diagram && pkg.format !== "infographic") {
    figure = {
      kind: "freebody", title: diagram.title,
      forces: diagram.forces?.map((force) => ({
        label: force.label,
        components: force.components,
        ...(force.position ? { position: force.position } : {}),
      })),
      ...(diagram.surfaceAngleDeg === undefined ? {} : { context: { surfaceAngleDeg: diagram.surfaceAngleDeg } }),
    };
  } else if (graph) figure = { kind: "graph", title: pkg.objective.slice(0, 120), expression: graph.expression, xRange: graph.xRange };
  else if (equation) figure = { kind: "equation", title: pkg.objective.slice(0, 120), expression: equation.expression };
  else if (mindmap) figure = { kind: "mindmap", title: mindmap.title, ...(mindmap.nodes.length ? { concepts: mindmap.nodes.map((node) => node.label).slice(0, 8) } : {}) };

  const shared = {
    boardId: ctx.boardId,
    topic: pkg.objective,
    artifact: { concepts: explanation?.concepts ?? [], figure, citationLabel: ctx.retrievedRefs[0] },
    placement: { relation: "clear-area" as const },
    sourceRefs: [...new Set(pkg.components.flatMap((component) => component.sourceRefs))],
    reason: explanation?.text ?? pkg.objective,
  };

  if (questions.length > 1) {
    if (questions.length > 8) throw new Error("A package may compose at most 8 questions in one Canvas revision.");
    return artifactBriefSchema.parse({
      ...shared,
      artifact: {
        ...shared.artifact,
        kind: "problem-set", count: questions.length,
        prompt: questions[0].prompt,
        items: questions.map((question) => ({
          prompt: question.prompt,
          ...(question.answer ? { answer: question.answer } : {}),
          ...(question.scenario ? { scenario: question.scenario } : {}),
          ...(question.sourceRefs[0] ? { sourceRef: question.sourceRefs[0] } : {}),
        })),
      },
    });
  }
  if (questions.length === 1) {
    return artifactBriefSchema.parse({
      ...shared,
      artifact: {
        ...shared.artifact, kind: "question", count: 1, prompt: questions[0].prompt,
        ...(questions[0].answer ? { answer: questions[0].answer } : {}),
        ...(questions[0].scenario ? { scenario: questions[0].scenario } : {}),
      },
    });
  }
  if (worked.length) {
    const item = worked[0];
    return artifactBriefSchema.parse({
      ...shared,
      artifact: { ...shared.artifact, kind: "worked-example", count: 1, prompt: item.prompt, answer: item.answer },
    });
  }
  if (cards.length) {
    if (cards.length > 8) throw new Error("A package may compose at most 8 flashcards in one Canvas revision.");
    return artifactBriefSchema.parse({
      ...shared,
      artifact: {
        ...shared.artifact, kind: "deck", count: cards.length, prompt: cards[0].front,
        items: cards.map((card) => ({ prompt: card.front, answer: card.back, ...(card.sourceRefs[0] ? { sourceRef: card.sourceRefs[0] } : {}) })),
      },
    });
  }
  return artifactBriefSchema.parse({
    ...shared,
    artifact: {
      ...shared.artifact,
      kind: figure ? "figure" : "question",
      count: 1,
      prompt: explanation?.text ?? pkg.objective,
      ...(explanation?.text ? { answer: explanation.text } : {}),
    },
  });
}

function consumedCanvasIds(pkg: ArtifactPackage, brief: ArtifactBrief): string[] {
  const consumed = new Set<string>();
  const explanation = componentsOfKind(pkg, ["explanation"])[0];
  if (explanation) consumed.add(explanation.id);
  const questions = componentsOfKind(pkg, ["question"]);
  const worked = componentsOfKind(pkg, ["worked-example"]);
  const cards = componentsOfKind(pkg, ["flashcard"]);
  if (brief.artifact.kind === "question" || brief.artifact.kind === "problem-set") questions.forEach((item) => consumed.add(item.id));
  else if (brief.artifact.kind === "worked-example") worked.slice(0, 1).forEach((item) => consumed.add(item.id));
  else if (brief.artifact.kind === "deck") cards.forEach((item) => consumed.add(item.id));
  if (brief.artifact.figure) {
    for (const figure of componentsOfKind(pkg, ["diagram", "graph", "equation", "mind-map"]).slice(0, 1)) consumed.add(figure.id);
  }
  return [...consumed];
}

function buildStudio(pkg: ArtifactPackage, ctx: CompilePackageContext): StudioArtifact | undefined {
  const shared = {
    id: newId("studio-artifact"), courseId: ctx.courseId, lessonId: ctx.lessonId,
    sourceRefs: [...new Set(pkg.components.flatMap((component) => component.sourceRefs))],
    createdAt: new Date().toISOString(),
  };
  const diagrams = componentsOfKind(pkg, ["diagram"]);
  if (pkg.format === "infographic" && diagrams.length) {
    const diagram = diagrams[0];
    const content: InfographicContent = {
      title: diagram.title,
      objective: pkg.objective,
      diagram: {
        title: diagram.title,
        ...(diagram.surfaceAngleDeg === undefined ? {} : { surfaceAngleDeg: diagram.surfaceAngleDeg }),
        forces: diagram.forces ?? [],
      },
      sourceRefs: [...new Set([...diagram.sourceRefs, ...shared.sourceRefs])],
    };
    return { ...shared, kind: "infographic", title: content.title, content };
  }
  const summaries = componentsOfKind(pkg, ["summary"]);
  if (!summaries.length) return undefined;
  const content: StudyGuideContent = {
    title: summaries[0].title,
    overview: pkg.objective,
    sections: summaries.flatMap((summary) => summary.sections.map((section) => ({
      heading: section.heading, body: section.body, sourceRefs: summary.sourceRefs,
    }))),
    keyTerms: [],
  };
  return { ...shared, kind: "study-guide", title: content.title, content };
}

function buildLearning(pkg: ArtifactPackage, ctx: CompilePackageContext): ActivitySpec | undefined {
  const exercise = componentsOfKind(pkg, ["interactive-exercise"])[0];
  if (!exercise) return undefined;
  const sourceRef = ctx.retrievedRefs[0];
  const excerpt = ctx.retrievedChunks.find((chunk) => chunk.ref === sourceRef)?.text;
  if (!sourceRef || !excerpt) throw new Error("An interactive exercise requires a retrieved source excerpt for its objective.");
  const graph = exercise.exercise.mode === "graph-interpretation" ? exercise.exercise : undefined;
  const motion = exercise.exercise.mode === "force-motion" ? exercise.exercise : undefined;
  const artifacts = graph
    ? [{ id: "graph-1", capabilityId: "canvas.linear-graph", config: { slope: graph.slope, intercept: graph.intercept, xRange: graph.xRange }, editablePaths: [] }]
    : [
        { id: "mass-1", capabilityId: "canvas.measurement", config: { label: "mass", value: motion!.massKg, units: "kg", position: { x: 150, y: 150 } }, editablePaths: [] },
        ...motion!.forcesN.map((force, index) => ({ id: `force-${index}`, capabilityId: "canvas.force-vector", config: { label: `Force ${index + 1}`, components: [force, 0, 0], units: "N", position: { x: 150 + index * 30, y: 150 } }, editablePaths: [] })),
      ];
  const checker = graph
    ? { id: "checker-1", capabilityId: "math.graph-interpretation", config: { mode: "value", graphArtifactId: "graph-1", atX: graph.atX, tolerance: 0.01 } }
    : { id: "checker-1", capabilityId: "physics.force-motion", config: { mode: "acceleration", massArtifactId: "mass-1", forceArtifactIds: motion!.forcesN.map((_, index) => `force-${index}`), tolerance: 0.01 } };
  return ActivitySpecSchema.parse({
    schemaVersion: 1,
    id: `activity-${pkg.id}`,
    version: 1,
    courseId: ctx.courseId,
    lessonId: ctx.lessonId,
    title: pkg.objective.slice(0, 160),
    description: "",
    objectives: [{ id: "obj-1", concept: pkg.objective.slice(0, 160), text: pkg.objective.slice(0, 1000), sourceRefs: [{ sourceRef, excerpt: excerpt.slice(0, 3000) }] }],
    artifacts,
    checkers: [checker],
    tasks: [{ id: "task-1", objectiveId: "obj-1", prompt: exercise.prompt, checkerId: "checker-1", artifactIds: artifacts.map((artifact) => artifact.id), hints: [], assessment: { mastery: "none" } }],
    interactions: { allowMove: false, allowDrawing: false },
  });
}

/** Compile one package into the components each renderer owns. No board reads, no persistence. */
export function compilePackage(pkg: ArtifactPackage, ctx: CompilePackageContext): CompiledPackage {
  if (pkg.outcome) {
    // A first-class refusal compiles to no artifact at all; nothing is proposed for review.
    return { outcome: pkg.outcome, report: { ok: true, problems: [] } };
  }
  const projection = projectPackage(pkg);
  const viewport = ctx.viewport ?? DEFAULT_VIEWPORT;
  let canvas: CompiledArtifact | undefined;
  let report: ValidationReport = { ok: true, problems: [] };
  if (projection.canvas.length) {
    const brief = deriveBrief(pkg, ctx);
    canvas = compileArtifactBrief(brief, { occupancy: ctx.occupancy, viewport, anchors: ctx.anchors });
    report = validateCompiled({ objects: canvas.objects, brief, occupancy: ctx.occupancy, viewport });
    const consumed = new Set(consumedCanvasIds(pkg, brief));
    const dropped = projection.canvas.filter((id) => !consumed.has(id));
    if (dropped.length) {
      report.problems.push({
        componentId: "composition",
        validator: "composition",
        message: `Canvas components not represented in this single revision: ${dropped.join(", ")}.`,
        requestedCorrection: "Split the package into separate revisions or remove the unconsumed components before applying.",
      });
      report = { ok: false, problems: report.problems };
    }
  }
  const studio = projection.studio.length ? buildStudio(pkg, ctx) : undefined;
  const learning = projection.learning.length ? buildLearning(pkg, ctx) : undefined;
  return { ...(canvas ? { canvas } : {}), ...(studio ? { studio } : {}), ...(learning ? { learning } : {}), report };
}

