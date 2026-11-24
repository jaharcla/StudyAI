import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/overrides.css", "utf8");
const studio = readFileSync("src/canvas/CanvasStudio.tsx", "utf8");

describe("lab-notebook visual tokens", () => {
  it("uses dotted notebook paper on the canvas viewport", () => {
    expect(css).toMatch(/\.canvas-viewport\.lab-paper\s*\{[^}]*radial-gradient/);
    expect(css).toMatch(/\.dark\s+\.canvas-viewport\.lab-paper\s*\{/);
    expect(studio).toContain('className="canvas-viewport lab-paper"');
  });

  it("draws the graph plot on the paper, not on a white card", () => {
    const rule = css.match(/\.graph-surface\s*\{[^}]*\}/)?.[0] ?? "";
    expect(rule).toBeTruthy();
    expect(rule).toMatch(/fill:\s*(transparent|none)/);
    expect(rule).not.toMatch(/fill:\s*#[0-9a-f]{3,8}/i);
  });

  it("defines the Lewis sidebar, radial actions, and notebook editor surfaces", () => {
    expect(css).toContain(".lewis-sidebar");
    expect(css).toContain(".radial-actions");
    expect(css).toContain(".notebook-editor");
    expect(css).toMatch(/\.scene-atom[^{]*\{[^}]*fill:\s*#[0-9a-f]{3,8}/i);
    expect(css).not.toMatch(/\.scene-atom[^{]*\{[^}]*fill:\s*transparent/);
  });
});
