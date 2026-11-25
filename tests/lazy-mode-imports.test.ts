import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");

const surfaces = [
  ["StudioSurface", "./studio/StudioSurface"],
  ["StudyStage", "./lab/StudyStage"],
  ["ConceptGraphView", "./studio/ConceptGraphView"],
  ["VegaChartToolRenderer", "./charts/VegaChartTool"],
  ["FlashcardReview", "./learning/FlashcardReview"],
  ["ActivityLibrary", "./learning/ActivityLibrary"],
  ["ActivityTaskPanel", "./learning/ActivityTaskPanel"],
] as const;

describe("lazy mode-gated surfaces", () => {
  it("does not statically import mode-gated surfaces into the entry chunk", () => {
    for (const [name, modulePath] of surfaces) {
      const staticImport = new RegExp(`^import\\s+(?!type\\b)[^;]*\\bfrom\\s+["']${modulePath.replace(/\//g, "\\/")}["']`, "m");
      expect(app, `${name} must not be a static import`).not.toMatch(staticImport);
    }
  });

  it("loads each surface through a dynamic import", () => {
    for (const [name, modulePath] of surfaces) {
      expect(app, `${name} must be loaded with lazy()`).toContain(`import("${modulePath}")`);
    }
  });
});
