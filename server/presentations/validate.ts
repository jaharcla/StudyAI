import type { SlideDeckComponent } from "../../src/artifacts/package";
import type { ValidationProblem, ValidationReport } from "../../src/artifacts/contracts";

export type DeckValidationReport = ValidationReport & { preserve: string[] };

const PLACEHOLDER = /TODO|lorem ipsum|Click to add title/i;
const SOURCE_LINE = /^>\s*Source:\s*(\S+)\s*$/;

function problem(componentId: string, validator: string, message: string, requestedCorrection: string): ValidationProblem {
  return { componentId, validator, message, requestedCorrection };
}

/** Validates the rendered deck text, not the model's JSON. */
export function validateDeckText(
  text: string,
  component: SlideDeckComponent,
  retrieved: ReadonlyMap<string, string>,
): DeckValidationReport {
  const problems: ValidationProblem[] = [];
  const seenTitles = new Set<string>();
  for (const slide of component.slides) {
    if (seenTitles.has(slide.title)) {
      problems.push(problem(slide.title, "slide-titles", `Duplicate slide title: ${slide.title}.`, `Give each slide a unique title; rename this one.`));
    }
    seenTitles.add(slide.title);

    for (const claim of slide.claims) {
      const chunk = retrieved.get(claim.sourceRef);
      if (!chunk) {
        problems.push(problem(slide.title, "citation-containment", `sourceRef ${claim.sourceRef} was not retrieved.`, `Remove or replace the unsupported citation on slide ${slide.title}.`));
      } else if (claim.relationship === "direct" && !chunk.includes(claim.excerpt)) {
        problems.push(problem(slide.title, "citation-containment", `The excerpt for ${claim.sourceRef} is not contained in the retrieved chunk.`, `Quote an excerpt that appears in the course evidence, or label this as an interpretation.`));
      }
    }

    if (slide.visual && slide.visual.kind !== "none" && slide.visual.altText.trim() === "") {
      problems.push(problem(slide.title, "alt-text", `A ${slide.visual.kind} visual has no alt text.`, `Describe the visual on slide ${slide.title}.`));
    }
  }

  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index++) {
    const match = SOURCE_LINE.exec(lines[index]);
    if (!match) continue;
    const ref = match[1];
    if (!retrieved.has(ref)) {
      problems.push(problem("bundle", "citation-containment", `Rendered deck cites ${ref}, which was not retrieved.`, `Remove the invented citation from the deck.`));
      continue;
    }
    const preceding = [...lines.slice(0, index)].reverse().find((line) => line.trim() && !line.startsWith(">") && !line.startsWith("#"));
    const chunk = retrieved.get(ref) ?? "";
    const claimText = preceding?.trim().replace(/^[-*]\s+/, "") ?? "";
    if (claimText && !chunk.includes(claimText)) {
      problems.push(problem("bundle", "citation-containment", `A rendered claim above ${ref} is not supported by the retrieved chunk.`, `Restate the claim using only the course evidence, or label it as an interpretation.`));
    }
  }

  if (PLACEHOLDER.test(text)) {
    problems.push(problem("bundle", "placeholder-text", "The deck contains leftover template placeholder text.", "Replace or remove the placeholder text before delivery."));
  }

  const badSlides = new Set(problems.map((item) => item.componentId));
  return {
    ok: problems.length === 0,
    problems,
    preserve: component.slides.filter((slide) => !badSlides.has(slide.title)).map((slide) => slide.title),
  };
}
