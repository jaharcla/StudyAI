import { z } from "zod";
import { OCRResultSchema } from "./types.js";

const allowedKinds = new Set(["word", "symbol", "number", "equation", "unknown"]);
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" ? value as Record<string, unknown> : {};

export function normalizeOCRResponse(value: unknown, raw: string) {
  const root = record(value);
  const sourceItems = Array.isArray(root.items) ? root.items : [];
  const items = sourceItems.flatMap((item) => {
    const entry = record(item);
    if (typeof entry.text !== "string" || !entry.text.trim()) return [];
    const suppliedKind = String(entry.kind ?? "").toLowerCase();
    const kind = allowedKinds.has(suppliedKind) ? suppliedKind : /^[\p{L}\p{N}\s]+$/u.test(entry.text) ? "word" : "unknown";
    const numericConfidence = typeof entry.confidence === "number" ? entry.confidence : typeof entry.confidence === "string" && entry.confidence.trim() ? Number(entry.confidence) : NaN;
    const confidence = Number.isFinite(numericConfidence) ? Math.max(0, Math.min(1, numericConfidence)) : null;
    const imageRegion = boundsOrNull(entry.imageRegion);
    return [{ text: entry.text.trim(), kind, confidence, alternatives: Array.isArray(entry.alternatives) ? entry.alternatives.filter((item): item is string => typeof item === "string") : [], sourceIds: Array.isArray(entry.sourceIds) ? entry.sourceIds.filter((id): id is string => typeof id === "string") : [], imageRegion, sourceRegionId: typeof entry.sourceRegionId === "string" ? entry.sourceRegionId : null, worldRegion: boundsOrNull(entry.worldRegion), locationPrecision: imageRegion ? "item" as const : "unknown" as const, uncertain: confidence === null || confidence < 0.8 || !imageRegion }];
  });
  const uncertain = (typeof root.uncertain === "boolean" && root.uncertain) || !items.length || items.length < sourceItems.length || items.some((item) => item.uncertain || item.alternatives.length > 0);
  return OCRResultSchema.parse({ items, uncertain, raw: typeof root.raw === "string" ? root.raw : raw });
}

export function normalizeOCRText(raw: string) {
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { parsed = undefined; }
  if (parsed && typeof parsed === "object") return normalizeOCRResponse(parsed, raw);
  const texts = raw.split(/\r?\n/).map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim()).filter(Boolean);
  const items = texts.map((text) => ({ text, kind: /[=<>^]/.test(text) ? "equation" as const : /^[-+]?\d+(?:[.,]\d+)?(?:\s*[a-z%]+)?$/i.test(text) ? "number" as const : /^[\p{L}\p{N}\s]+$/u.test(text) ? "word" as const : "unknown" as const, confidence: null, alternatives: [], sourceIds: [], imageRegion: null, sourceRegionId: null, worldRegion: null, locationPrecision: "unknown" as const, uncertain: true }));
  return OCRResultSchema.parse({ items, uncertain: !items.length || items.some((item) => item.uncertain) || /\b(?:unclear|illegible|uncertain|possibly|maybe)\b|\?/i.test(raw), raw });
}

function boundsOrNull(value: unknown): z.infer<typeof OCRResultSchema>["items"][number]["imageRegion"] {
  if (value === null || value === undefined) return null;
  const parsed = z.object({ x: z.number().finite(), y: z.number().finite(), width: z.number().finite().nonnegative(), height: z.number().finite().nonnegative() }).safeParse(value);
  return parsed.success ? parsed.data : null;
}
