import type { SlideDeckComponent, SlideDeckSlide } from "../../src/artifacts/package";
import type { DeckTemplate } from "./templates";
import { explainSolution } from "./math";

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

function slideMarkdown(slide: SlideDeckSlide): string {
  const lines = [`# ${slide.title}`];
  if (slide.math) {
    const solved = explainSolution(slide.math.equations, slide.math.variables);
    for (const step of solved.steps) lines.push(`- ${step}`);
    for (const check of solved.checks) lines.push(`- Check: ${check}`);
    if (slide.notes) lines.push(`> Notes: ${slide.notes}`);
    return lines.join("\n");
  }
  for (const claim of slide.claims) {
    lines.push(`- ${claim.claim}`);
    if (claim.relationship === "direct") lines.push(`> Source: ${claim.sourceRef}`);
  }
  if (slide.notes) lines.push(`> Notes: ${slide.notes}`);
  return lines.join("\n");
}

export function compileSlideDeck(component: SlideDeckComponent, template: DeckTemplate): PresentonGenerateRequest {
  return {
    content: "",
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
