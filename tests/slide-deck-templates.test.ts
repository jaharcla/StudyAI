import { describe, expect, it } from "vitest";
import { deckTemplates, findDeckTemplate } from "../server/presentations/templates";

describe("slide deck template manifest", () => {
  it("contains only English, licence-clean templates", () => {
    expect(deckTemplates.length).toBeGreaterThan(0);
    expect(deckTemplates.length).toBeLessThanOrEqual(12);
    for (const template of deckTemplates) {
      expect(template.language).toBe("en");
      expect(["CC0", "CC BY"]).toContain(template.licence);
      expect(template.id).toMatch(/^[a-z0-9-]+$/);
      expect(template.attribution.length).toBeGreaterThan(0);
    }
  });

  it("finds the general English template", () => {
    expect(findDeckTemplate("general-en").name).toBeTruthy();
  });

  it("rejects an unknown or non-English template", () => {
    expect(() => findDeckTemplate("ru-seminar")).toThrow(/Unknown slide deck template/);
  });
});
