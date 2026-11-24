import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { z } from "zod";
import { findDeckTemplate } from "./templates";
import { compileSlideDeck, type PresentonGenerateRequest } from "./compile";
import type { RenderedDeck } from "./renderer";
import { sanitizeCourseText } from "./sanitize";
import { validateDeckText, validateRenderedSlides } from "./validate";
import { decideRepair } from "./repair";
import { initializeStudioSchema } from "../studio/schema";
import { buildGrounding } from "../studio/grounding";
import type { Grounding } from "../studio/contracts";
import type { SlideDeckComponent } from "../../src/artifacts/package";
import { sourceLabel } from "../../src/studio/api";

export const SlideDeckGenerateSchema = z.object({
  courseId: z.string().min(1).max(512),
  lessonId: z.string().min(1).max(512),
  focus: z.string().trim().min(1).max(500).optional().default("Key concepts and mechanisms"),
  templateId: z.string().min(1).max(80).optional().default("general-en"),
}).strict();

export type SlideDeckArtifact = {
  id: string;
  courseId: string;
  lessonId: string;
  kind: "slide_deck";
  title: string;
  content: SlideDeckComponent;
  sourceRefs: string[];
  createdAt: string;
  collection: string;
  filePath: string;
};

export type SlideDeckDeps = {
  renderer: (request: PresentonGenerateRequest) => Promise<RenderedDeck>;
  readDeckText: (path: string) => Promise<string>;
  ground?: (db: Database.Database, courseId: string, lessonId: string, focus: string) => Grounding;
  inspect?: (presentationId: string) => Promise<Array<Record<string, unknown>>>;
};

type Row = {
  id: string; course_id: string; lesson_id: string; kind: string; title: string;
  content: string; source_refs: string; created_at: string; collection: string; file_path: string;
};

function toArtifact(row: Row): SlideDeckArtifact {
  return {
    id: row.id,
    courseId: row.course_id,
    lessonId: row.lesson_id,
    kind: "slide_deck",
    title: row.title,
    content: JSON.parse(row.content) as SlideDeckComponent,
    sourceRefs: JSON.parse(row.source_refs) as string[],
    createdAt: row.created_at,
    collection: row.collection,
    filePath: row.file_path,
  };
}

function buildComponent(grounding: Grounding, templateId: string, objective: string): SlideDeckComponent {
  const refs: string[] = [];
  const retrieved = new Map<string, string>();
  for (const source of grounding.sources.slice(0, 5)) {
    refs.push(source.ref);
    retrieved.set(source.ref, source.excerpt);
  }
  const slides: SlideDeckComponent["slides"] = [{ role: "title", title: grounding.focus, claims: [] }];
  for (const source of grounding.sources.slice(0, 5)) {
    const excerpt = sanitizeCourseText(source.excerpt).slice(0, 3000);
    slides.push({
      role: "mechanism",
      title: source.title.slice(0, 120) || "Course evidence",
      claims: [{
        claim: excerpt.slice(0, 500),
        sourceRef: source.ref,
        excerpt,
        relationship: "direct",
      }],
      notes: source.location,
    });
  }
  if (slides.length < 2) slides.push({ role: "summary", title: "Review", claims: [], notes: "Recall the key idea in your own words." });
  return {
    id: `deck-${randomUUID()}`,
    kind: "slide_deck",
    sourceRefs: refs,
    claims: [],
    objective,
    templateId,
    language: "en",
    slides,
  };
}

export async function generateSlideDeck(db: Database.Database, rawInput: unknown, deps: SlideDeckDeps): Promise<SlideDeckArtifact> {
  initializeStudioSchema(db);
  const input = SlideDeckGenerateSchema.parse(rawInput);
  const grounding = (deps.ground ?? buildGrounding)(db, input.courseId, input.lessonId, input.focus);
  if (!grounding.sources.length && !grounding.concepts.length && !grounding.canvas.length) {
    throw new Error("No course sources, concepts or canvas knowledge are available for this lesson yet.");
  }

  const component = buildComponent(grounding, input.templateId, grounding.focus);
  const template = findDeckTemplate(component.templateId);
  let request = compileSlideDeck(component, template);
  let rendered: RenderedDeck | undefined;
  for (let generation = 1; generation <= 2; generation++) {
    rendered = await deps.renderer(request);
    const text = await deps.readDeckText(rendered.pptxPath);
    const retrieved = new Map(component.slides.flatMap((slide) => (slide.claims ?? []).map((claim) => [claim.sourceRef, claim.excerpt] as const)));
    const labels = new Map(component.sourceRefs.map((ref) => [sourceLabel(ref), ref] as const));
    const report = validateDeckText(text, component, retrieved, labels);
    if (deps.inspect) {
      const renderedSlides = await deps.inspect(rendered.presentationId);
      report.problems.push(...validateRenderedSlides(renderedSlides).problems);
      report.ok = report.problems.length === 0;
    }
    const decision = decideRepair(report, generation);
    if (report.ok) break;
    if (!decision.needsRepair) throw new Error("Deck validation failed after repair.");
    request = {
      ...request,
      content: decision.report.problems.map((item) => `${item.validator}: ${item.requestedCorrection}`).join("\n"),
    };
  }
  if (!rendered) throw new Error("Deck generation failed.");

  const id = randomUUID();
  db.prepare(`INSERT INTO studio_artifacts (id, course_id, lesson_id, kind, title, content, source_refs, created_at, collection, file_path)
    VALUES (?, ?, ?, 'slide_deck', ?, ?, ?, CURRENT_TIMESTAMP, ?, ?)`)
    .run(id, input.courseId, input.lessonId, component.objective.slice(0, 200), JSON.stringify(component), JSON.stringify(component.sourceRefs), "", rendered.pptxPath);
  const row = db.prepare("SELECT * FROM studio_artifacts WHERE id = ?").get(id) as Row;
  return toArtifact(row);
}

export function listSlideDecks(db: Database.Database, courseId: string): SlideDeckArtifact[] {
  initializeStudioSchema(db);
  const rows = db.prepare("SELECT * FROM studio_artifacts WHERE course_id = ? AND kind = 'slide_deck' ORDER BY created_at DESC").all(courseId) as Row[];
  return rows.map(toArtifact);
}

export function getSlideDeck(db: Database.Database, id: string, courseId: string): SlideDeckArtifact | undefined {
  const row = db.prepare("SELECT * FROM studio_artifacts WHERE id = ? AND course_id = ? AND kind = 'slide_deck'").get(id, courseId) as Row | undefined;
  return row ? toArtifact(row) : undefined;
}
