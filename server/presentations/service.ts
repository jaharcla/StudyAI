import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { z } from "zod";
import { findDeckTemplate } from "./templates";
import { compileSlideDeck, type PresentonGenerateRequest } from "./compile";
import { PresentationRendererUnavailable, type RenderedDeck } from "./renderer";
import { sanitizeCourseText } from "./sanitize";
import { validateDeckText, validateRenderedSlides } from "./validate";
import { decideRepair } from "./repair";
import { initializeStudioSchema } from "../studio/schema";
import { buildGrounding } from "../studio/grounding";
import type { Grounding, StudioSource } from "../studio/contracts";
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
  notice?: string;
};

export const DECK_RENDER_NOTICE = "Your deck's slides and citations are ready. The .pptx download needs the local presentation service (Presenton), which isn't running. Start it and build again to export.";
export const DECK_DOWNLOAD_NOTICE = "This deck has no .pptx file because the local presentation service (Presenton) was not running when it was built. Start the service and build the deck again to download.";

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

const FILE_LIKE = /\.[\w]{2,5}$|^[a-z]+\d*[-_][\w-]+$/i;

function humanSlideTitle(source: StudioSource, objective: string, used: Set<string>): string {
  const firstSentence = source.excerpt.trim().split(/[.!?]/, 1)[0]?.trim() ?? "";
  const claimText = firstSentence.split(/\s+/).filter(Boolean).slice(0, 12).join(" ");
  const base = claimText && !FILE_LIKE.test(claimText) ? claimText : objective;
  const stem = (base || "Course evidence").slice(0, 120);
  let title = stem;
  if (used.has(title)) title = `${stem.slice(0, 100)} · ${source.location}`.slice(0, 120);
  let suffix = 2;
  while (used.has(title)) title = `${stem.slice(0, 100)} · ${source.location} (${suffix++})`.slice(0, 120);
  used.add(title);
  return title;
}

function buildComponent(grounding: Grounding, templateId: string, objective: string): SlideDeckComponent {
  const refs: string[] = [];
  const retrieved = new Map<string, string>();
  for (const source of grounding.sources.slice(0, 5)) {
    refs.push(source.ref);
    retrieved.set(source.ref, source.excerpt);
  }
  const usedTitles = new Set<string>([grounding.focus]);
  const slides: SlideDeckComponent["slides"] = [{ role: "title", title: grounding.focus, claims: [] }];
  for (const source of grounding.sources.slice(0, 5)) {
    const excerpt = sanitizeCourseText(source.excerpt).slice(0, 3000);
    slides.push({
      role: "mechanism",
      title: humanSlideTitle(source, objective, usedTitles),
      claims: [{
        claim: excerpt.slice(0, 500),
        sourceRef: source.ref,
        excerpt,
        relationship: "direct",
      }],
      notes: [source.title, source.location].filter(Boolean).join(" · "),
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
  let notice: string | undefined;
  try {
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
  } catch (error) {
    const missing = error instanceof PresentationRendererUnavailable
      || error instanceof Error && /fetch failed|ECONNREFUSED|network/i.test(error.message);
    if (!missing) throw error;
    notice = DECK_RENDER_NOTICE;
    rendered = undefined;
  }

  const id = randomUUID();
  db.prepare(`INSERT INTO studio_artifacts (id, course_id, lesson_id, kind, title, content, source_refs, created_at, collection, file_path)
    VALUES (?, ?, ?, 'slide_deck', ?, ?, ?, CURRENT_TIMESTAMP, ?, ?)`)
    .run(id, input.courseId, input.lessonId, component.objective.slice(0, 200), JSON.stringify(component), JSON.stringify(component.sourceRefs), "", rendered?.pptxPath ?? "");
  const row = db.prepare("SELECT * FROM studio_artifacts WHERE id = ?").get(id) as Row;
  return notice ? { ...toArtifact(row), notice } : toArtifact(row);
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
