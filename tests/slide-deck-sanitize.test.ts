import { describe, expect, it } from "vitest";
import { sanitizeCourseText } from "../server/presentations/sanitize";

describe("sanitizeCourseText", () => {
  it("maps Wingdings threshold symbols to readable physics notation", () => {
    expect(sanitizeCourseText("For    o , the kinetic energy increased")).toBe("For ν ≥ ν₀, the kinetic energy increased");
  });

  it("maps the frequency glyph inside equations", () => {
    expect(sanitizeCourseText("E h photon = ")).toBe("E h photon = ν");
  });

  it("preserves real Greek and mathematical characters", () => {
    expect(sanitizeCourseText("wavelength λ and π with − and × stays")).toBe("wavelength λ and π with − and × stays");
  });

  it("collapses doubled mathematical italic glyphs from PDF extraction", () => {
    expect(sanitizeCourseText("𝑥𝑥 + 𝑦𝑦 = 60 8 ∗ 𝑥𝑥 + 12 ∗ 𝑦𝑦 = 600")).toBe("x + y = 60 8 * x + 12 * y = 600");
  });

  it("leaves ordinary course prose unchanged", () => {
    expect(sanitizeCourseText("Friction opposes motion.")).toBe("Friction opposes motion.");
  });
});
