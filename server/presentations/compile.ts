import type { SlideDeckComponent, SlideDeckSlide } from "../../src/artifacts/package";
import { sourceLabel } from "../../src/studio/api";
import type { DeckTemplate } from "./templates";
import { chartTable, explainSolution } from "./math";

export type PresentonGenerateRequest = {
  content: string;
  slides_markdown: string[];
  n_slides: number;
  template: string;
  language: "English";
  export_as: "pptx";
  include_title_slide: boolean;
};

export type ImageIntent = {
  kind: "diagram" | "photo" | "illustration";
  altText: string;
  query?: string;
  prompt?: string;
  credit?: string;
};

const GROUNDING_PROMPT = [
  "Build a course-grounded study deck.",
  "Use only the claims and source lines supplied below; do not add outside facts, examples, definitions or numbers.",
  'Keep every "> Source:" line verbatim on the slide it belongs to, directly below its claim.',
  "Draw an instructional diagram when a visual is described; do not add decorative or stock imagery.",
  "Put speaker notes in the notes lines, not on the slide itself.",
  "Do not leave placeholder text.",
].join(" ");

function cleanTitle(title: string): string {
  return title.replace(/[*_`#]+$/g, "").trim();
}

function slideMarkdown(slide: SlideDeckSlide): string {
  const lines = [`# ${cleanTitle(slide.title)}`];
  if (slide.math) {
    const solved = explainSolution(slide.math.equations, slide.math.variables);
    for (const step of solved.steps) lines.push(`- ${step}`);
    for (const check of solved.checks) lines.push(`- Check: ${check}`);
    const table = chartTable(slide.math.equations, slide.math.variables);
    if (table.length) {
      lines.push("> Chart instruction: Plot two lines on an x-y plane using the numeric table below. Label axes x and y, label each line with its equation, and mark the intersection.");
      lines.push(...table);
    }
    if (slide.notes) lines.push(`> Notes: ${slide.notes}`);
    return lines.join("\n");
  }
  for (const claim of slide.claims ?? []) {
    lines.push(`- ${claim.claim}`);
    if (claim.relationship === "direct") lines.push(`> Source: ${sourceLabel(claim.sourceRef)}`);
  }
  if (slide.notes) lines.push(`> Notes: ${slide.notes}`);
  return lines.join("\n");
}

export function compileSlideDeck(component: SlideDeckComponent, template: DeckTemplate): PresentonGenerateRequest {
  const visuals = imagePlan(component).map((intent) => intent.altText).join("; ");
  return {
    content: visuals ? `${GROUNDING_PROMPT} Visuals to draw: ${visuals}.` : GROUNDING_PROMPT,
    slides_markdown: component.slides.map(slideMarkdown),
    n_slides: component.slides.length,
    template: template.presentonTemplate,
    language: "English",
    export_as: "pptx",
    include_title_slide: false,
  };
}

export function imagePlan(component: SlideDeckComponent): ImageIntent[] {
  const intents: ImageIntent[] = [];
  for (const slide of component.slides) {
    const visual = slide.visual;
    if (!visual || visual.kind === "none") continue;
    intents.push({
      kind: visual.kind,
      altText: visual.altText,
      ...(visual.query ? { query: visual.query } : {}),
      ...(visual.prompt ? { prompt: visual.prompt } : {}),
      ...(visual.credit ? { credit: visual.credit } : {}),
    });
  }
  return intents;
}
