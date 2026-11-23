import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { bondOrderGlyph } from "../src/canvas/lewis-bonds.js";

const sidebarSource = () => readFileSync("src/canvas/LewisSidebar.tsx", "utf8");

describe("Lewis sidebar", () => {
  it("renders bond order as literal line glyphs", () => {
    expect(bondOrderGlyph(1)).toBe("—");
    expect(bondOrderGlyph(2)).toBe("—\n—");
    expect(bondOrderGlyph(3)).toBe("—\n—\n—");
    expect(bondOrderGlyph(1.5)).toContain("·");
  });

  it("uses the canvas-tool panel grammar with testable hooks", () => {
    const source = sidebarSource();
    expect(source).toContain('className="lewis-sidebar"');
    expect(source).toContain('className="palette-heading"');
    expect(source).toContain('data-testid="lewis-bond-row"');
    expect(source).toContain('data-testid="lewis-bond-row-toggle"');
    expect(source).toContain('data-testid={`lewis-element-row-${item}`}');
    expect(source).toContain('aria-label="Close Lewis tools"');
    expect(source).toContain('role="toolbar"');
  });
});
