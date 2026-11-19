import { RECOGNITION_LIMITS, type CanvasRecognitionPoint } from "./types.js";

export type StrokeRenderOptions = {
  size?: number;
  padding?: number;
  strokeWidth?: number;
};

export type RenderedStrokeGroup = {
  pngBase64: string;
  width: number;
  height: number;
  svg: string;
};

const round = (value: number) => Math.round(value * 1000) / 1000;

function finitePoints(strokes: readonly CanvasRecognitionPoint[][]) {
  return strokes.map((stroke) => stroke.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))).filter((stroke) => stroke.length > 0);
}

/**
 * Deterministic, browser-free rasterization of a stroke group.
 * The same renderer must be used for recognition queries and taught examples.
 */
export function strokeGroupSvg(strokes: readonly CanvasRecognitionPoint[][], options: StrokeRenderOptions = {}): string {
  const size = Math.max(32, Math.min(1024, Math.floor(options.size ?? RECOGNITION_LIMITS.imageSize)));
  const padding = Math.max(0, Math.min(size / 4, options.padding ?? RECOGNITION_LIMITS.padding));
  const strokeWidth = Math.max(1, Math.min(64, options.strokeWidth ?? RECOGNITION_LIMITS.strokeWidth));
  const clean = finitePoints(strokes);
  const all = clean.flat();
  const background = `<rect width="${size}" height="${size}" fill="white"/>`;
  if (!all.length) return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${background}</svg>`;

  const xs = all.map((point) => point.x), ys = all.map((point) => point.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const width = Math.max(maxX - minX, 1e-6), height = Math.max(maxY - minY, 1e-6);
  const scale = (size - 2 * padding) / Math.max(width, height);
  const offsetX = (size - width * scale) / 2;
  const offsetY = (size - height * scale) / 2;
  const project = (point: CanvasRecognitionPoint) => ({
    x: round((point.x - minX) * scale + offsetX),
    y: round((point.y - minY) * scale + offsetY),
  });

  const paths: string[] = [];
  for (const stroke of clean) {
    if (stroke.length === 1) {
      const point = project(stroke[0]);
      paths.push(`<circle cx="${point.x}" cy="${point.y}" r="${round(strokeWidth / 2)}" fill="black"/>`);
      continue;
    }
    const commands = stroke.map((point, index) => {
      const projected = project(point);
      return `${index === 0 ? "M" : "L"}${projected.x} ${projected.y}`;
    }).join(" ");
    paths.push(`<path d="${commands}" fill="none" stroke="black" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/>`);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${background}${paths.join("")}</svg>`;
}

export async function renderStrokeGroupPng(strokes: readonly CanvasRecognitionPoint[][], options: StrokeRenderOptions = {}): Promise<RenderedStrokeGroup> {
  const size = Math.max(32, Math.min(1024, Math.floor(options.size ?? RECOGNITION_LIMITS.imageSize)));
  const svg = strokeGroupSvg(strokes, { ...options, size });
  const { default: sharp } = await import("sharp");
  const buffer = await sharp(Buffer.from(svg)).png({ compressionLevel: 9, palette: false }).toBuffer();
  return { pngBase64: buffer.toString("base64"), width: size, height: size, svg };
}
