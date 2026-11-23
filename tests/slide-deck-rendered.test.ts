import { describe, expect, it } from "vitest";
import { validateRenderedSlides } from "../server/presentations/validate";

describe("validateRenderedSlides", () => {
  it("flags truncated titles, bodies, and spelling errors", () => {
    const slides = [
      { title: "Solving Linked Models by", body: "This method is useful in bioenginee" },
      { title: "Step 1: Solve for y in the", body: "isolating a variable in one of," },
      { title: "Substituion", body: "Error Prevention: High." },
    ];
    const report = validateRenderedSlides(slides);
    const validators = report.problems.map((problem) => problem.validator);
    expect(validators).toContain("rendered-truncation");
    expect(validators).toContain("rendered-spelling");
  });

  it("accepts complete rendered fields", () => {
    const report = validateRenderedSlides([{ title: "Forces on an Incline", body: "Forces oppose motion." }]);
    expect(report.ok).toBe(true);
  });
});
