/**
 * Node has no `OffscreenCanvas`, and @quickdrawjs/core only reaches for `document.createElement`
 * when it is absent — which the `environment: "node"` vitest project also lacks. That made any code
 * path measuring text (note and label bounds, arrow highlight geometry, line wrapping) impossible to
 * exercise in unit tests.
 *
 * This installs a small deterministic measurer at exactly the seam the library already checks, so:
 *
 * - unit tests cover the geometry logic that depends on text extent, not just shapes with
 *   hard-coded width and height;
 * - bounds are reproducible across machines and fonts instead of depending on whatever the
 *   developer's browser rasterises;
 * - the estimate uses the same glyph ratio as `shapeBounds` in `src/canvas/ai/canvas-context.ts`,
 *   so occupancy and highlight geometry agree inside tests rather than drifting apart.
 *
 * Real font metrics are still only proven in a browser: this makes the logic testable, it does not
 * make it a substitute for the Playwright suite.
*/

/** Matches the 0.62 per-character estimate the tutor's own shape bounds use. */
const GLYPH_WIDTH_RATIO = 0.62;
const WEIGHT_RATIO = 500 / 400;

type Metrics = {
  width: number;
  actualBoundingBoxAscent: number;
  actualBoundingBoxDescent: number;
  fontBoundingBoxAscent: number;
  fontBoundingBoxDescent: number;
};

class NodeTextMeasurer {
  font = "500 20px sans";

  private get fontSize(): number {
    const match = /(\d+(?:\.\d+)?)px/.exec(this.font);
    return match ? Number(match[1]) : 20;
  }

  measureText(text: string): Metrics {
    const width = String(text ?? "").length * this.fontSize * GLYPH_WIDTH_RATIO * WEIGHT_RATIO;
    return {
      width,
      actualBoundingBoxAscent: this.fontSize * 0.75,
      actualBoundingBoxDescent: this.fontSize * 0.25,
      fontBoundingBoxAscent: this.fontSize * 0.8,
      fontBoundingBoxDescent: this.fontSize * 0.2,
    };
  }

  /** Layout queries the library's bounds path; drawing is out of scope for a bounds test double. */
  save(): void {}
  restore(): void {}
  translate(): void {}
  scale(): void {}
  fillRect(): void {}
  fillText(): void {}
  strokeText(): void {}
  beginPath(): void {}
  closePath(): void {}
}

class NodeOffscreenCanvas {
  readonly width: number;
  readonly height: number;
  private readonly context = new NodeTextMeasurer();

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  getContext(kind: string): NodeTextMeasurer | null {
    return kind === "2d" ? this.context : null;
  }
}

if (typeof globalThis.OffscreenCanvas === "undefined") {
  Object.defineProperty(globalThis, "OffscreenCanvas", { value: NodeOffscreenCanvas, writable: true, configurable: true });
}
