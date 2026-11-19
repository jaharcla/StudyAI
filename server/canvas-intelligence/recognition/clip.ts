import { resolve } from "node:path";
import {
  CanvasRecognitionResultSchema,
  RECOGNITION_LIMITS,
  type CanvasRecognitionAdapter,
  type CanvasRecognitionCandidate,
  type CanvasRecognitionInput,
  type CanvasRecognitionResult,
} from "./types.js";

export const DEFAULT_CLIP_MODEL = "onnx-community/CLIP-ViT-B-32-laion2B-s34B-b79K-ONNX";

export const DEFAULT_RECOGNITION_LABELS = [
  "arrow", "line", "circle", "square", "rectangle", "triangle", "star", "cross", "check mark", "dot",
  "graph", "coordinate axes", "table", "chart", "molecule", "atom", "chemical bond", "spring", "pulley",
  "inclined plane", "circuit", "battery", "resistor", "wave", "angle", "force arrow", "velocity arrow",
  "free body diagram", "freehand diagram", "label", "text", "box", "cloud", "person", "eye", "hand",
  "sum", "integral", "fraction", "partial derivative", "nabla", "equals sign", "parenthesis", "square root",
  "subscript", "superscript", "vector", "set notation", "matrix", "sigma",
] as const;

const PROMPT_TEMPLATES = [
  "a drawing of a {}",
  "a sketch of a {}",
  "a doodle of a {}",
  "a hand-drawn symbol for a {}",
  "a whiteboard diagram of a {}",
];

const PROTOTYPE_BLEND_K = 3;
const TEMPERATURE = 100;

type ClipTensor = { data: Float32Array | number[]; dims: number[] };

type ClipRuntime = {
  tokenizer: { (texts: string[], options: { padding: boolean; truncation: boolean }): Promise<Record<string, unknown>> };
  processor: { (image: unknown): Promise<Record<string, unknown>> };
  model: { (inputs: Record<string, unknown>): Promise<Record<string, ClipTensor>> };
  RawImage: { fromBlob(blob: Blob): Promise<unknown> };
};

let runtimePromise: Promise<ClipRuntime> | null = null;
let queue: Promise<unknown> = Promise.resolve();

function serialize<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.then(() => undefined, () => undefined);
  return run;
}

function toRows(value: ClipTensor | undefined): Float32Array[] {
  if (!value) throw new Error("CLIP returned no embedding.");
  const data = value.data as ArrayLike<number>;
  const rows = value.dims.length > 1 ? value.dims[0] : 1;
  const width = value.dims.length > 1 ? value.dims[value.dims.length - 1] : value.dims[0] ?? data.length;
  if (!Number.isInteger(rows) || rows < 1 || width < 1 || data.length < rows * width) throw new Error("CLIP returned a malformed embedding.");
  const result: Float32Array[] = [];
  for (let row = 0; row < rows; row++) {
    const vector = Float32Array.from({ length: width }, (_, index) => Number(data[row * width + index]));
    let norm = 0;
    for (const item of vector) norm += item * item;
    norm = Math.sqrt(norm);
    if (!Number.isFinite(norm) || norm <= 0) throw new Error("CLIP returned an empty embedding.");
    for (let index = 0; index < vector.length; index++) vector[index] /= norm;
    result.push(vector);
  }
  return result;
}

function dot(a: Float32Array, b: Float32Array) {
  if (a.length !== b.length) throw new Error("Embedding dimensions do not match.");
  let sum = 0;
  for (let index = 0; index < a.length; index++) sum += a[index] * b[index];
  return sum;
}

function meanVector(vectors: readonly Float32Array[]): Float32Array {
  if (!vectors.length) throw new Error("No embeddings to average.");
  const mean = new Float32Array(vectors[0].length);
  for (const vector of vectors) for (let index = 0; index < mean.length; index++) mean[index] += vector[index];
  let norm = 0;
  for (let index = 0; index < mean.length; index++) {
    mean[index] /= vectors.length;
    norm += mean[index] * mean[index];
  }
  norm = Math.sqrt(norm);
  if (norm > 0) for (let index = 0; index < mean.length; index++) mean[index] /= norm;
  return mean;
}

export async function loadClipRuntime(): Promise<ClipRuntime> {
  if (runtimePromise) return runtimePromise;
  runtimePromise = (async () => {
    const transformers = await import("@huggingface/transformers");
    const { AutoProcessor, AutoTokenizer, CLIPModel, RawImage, env } = transformers;
    env.cacheDir = resolve(process.env.CANVAS_MODEL_CACHE || "data/models");
    env.allowLocalModels = true;
    env.allowRemoteModels = process.env.CANVAS_RECOGNITION_ALLOW_DOWNLOAD !== "0";
    const modelId = process.env.CANVAS_CLIP_MODEL || DEFAULT_CLIP_MODEL;
    const [tokenizer, processor, model] = await Promise.all([
      AutoTokenizer.from_pretrained(modelId),
      AutoProcessor.from_pretrained(modelId),
      CLIPModel.from_pretrained(modelId, { dtype: (process.env.CANVAS_CLIP_DTYPE || "q8") as never }),
    ]);
    return {
      tokenizer: tokenizer as unknown as ClipRuntime["tokenizer"],
      processor: processor as unknown as ClipRuntime["processor"],
      model: model as unknown as ClipRuntime["model"],
      RawImage: RawImage as unknown as ClipRuntime["RawImage"],
    };
  })();
  runtimePromise.catch(() => { runtimePromise = null; });
  return runtimePromise;
}

async function imageFromBase64(runtime: ClipRuntime, pngBase64: string) {
  const { default: sharp } = await import("sharp");
  const normalized = await sharp(Buffer.from(pngBase64, "base64"), { limitInputPixels: 40_000_000 })
    .resize(RECOGNITION_LIMITS.imageSize, RECOGNITION_LIMITS.imageSize, { fit: "contain", background: "#ffffff" })
    .png().toBuffer();
  const blob = new Blob([normalized], { type: "image/png" });
  return runtime.RawImage.fromBlob(blob);
}

async function tokenizePrompts(runtime: ClipRuntime, labels: readonly string[]) {
  const prompts = labels.flatMap((label) => PROMPT_TEMPLATES.map((template) => template.replace("{}", label)));
  return { prompts, inputs: await runtime.tokenizer(prompts, { padding: true, truncation: true }) };
}

export async function embedRecognitionImage(pngBase64: string): Promise<Float32Array> {
  const runtime = await loadClipRuntime();
  return serialize(async () => {
    const text = await tokenizePrompts(runtime, ["drawing"]);
    const image = await imageFromBase64(runtime, pngBase64);
    const imageInputs = await runtime.processor(image);
    const output = await runtime.model({ ...text.inputs, ...imageInputs });
    return toRows(output.image_embeds)[0];
  });
}

function kindFor(label: string): CanvasRecognitionCandidate["kind"] {
  if (/^(arrow|line|circle|square|rectangle|triangle|star|cross|dot|box)$/.test(label)) return "shape";
  if (/(graph|axes|table|chart|molecule|atom|bond|spring|pulley|incline|circuit|battery|resistor|wave|angle|diagram)/.test(label)) return "diagram-element";
  return "symbol";
}

function softmax(scores: number[]): number[] {
  if (!scores.length) return [];
  const max = Math.max(...scores.map((score) => score * TEMPERATURE));
  const exponentials = scores.map((score) => Math.exp(score * TEMPERATURE - max));
  const total = exponentials.reduce((sum, value) => sum + value, 0);
  return exponentials.map((value) => value / total);
}

export type ClipAdapterOptions = {
  labels?: readonly string[];
  prototypes?: Record<string, readonly (readonly number[])[]>;
  minConfidence?: number;
  minMargin?: number;
  maxCandidates?: number;
};

export class ClipCanvasRecognitionAdapter implements CanvasRecognitionAdapter {
  readonly id = "clip-vit-b32";
  readonly version = "1";
  private readonly labels: string[];
  private readonly prototypes: Record<string, readonly (readonly number[])[]>;
  private readonly minConfidence: number;
  private readonly minMargin: number;
  private readonly maxCandidates: number;

  constructor(options: ClipAdapterOptions = {}) {
    const configured = (options.labels ?? DEFAULT_RECOGNITION_LABELS)
      .map((label) => label.trim().toLowerCase().slice(0, RECOGNITION_LIMITS.maxLabelChars))
      .filter(Boolean);
    this.prototypes = options.prototypes ?? {};
    this.labels = [...new Set([...configured, ...Object.keys(this.prototypes)])].slice(0, RECOGNITION_LIMITS.maxLabels);
    this.minConfidence = options.minConfidence ?? RECOGNITION_LIMITS.minConfidence;
    this.minMargin = options.minMargin ?? RECOGNITION_LIMITS.minMargin;
    this.maxCandidates = Math.max(1, Math.min(2, options.maxCandidates ?? RECOGNITION_LIMITS.maxCandidates));
  }

  get labelCount() {
    return this.labels.length;
  }

  async recognize(inputs: readonly CanvasRecognitionInput[]): Promise<CanvasRecognitionResult[]> {
    const empty = (input: CanvasRecognitionInput, reason: string) => CanvasRecognitionResultSchema.parse({ groupId: input.groupId, sourceIds: input.sourceIds.slice(0, 64), bounds: input.bounds, candidates: [], uncertain: true, uncertaintyReasons: [reason] });
    if (!this.labels.length) return inputs.map((input) => empty(input, "No recognition labels are configured."));
    const usable = inputs.filter((input) => typeof input.pngBase64 === "string" && input.pngBase64.length > 0);
    if (!usable.length) return inputs.map((input) => empty(input, "No rendered image was supplied for CLIP recognition."));

    const runtime = await loadClipRuntime();
    const text = await tokenizePrompts(runtime, this.labels);
    const images = await Promise.all(usable.map((input) => imageFromBase64(runtime, input.pngBase64!)));
    const { prompts, inputs: textInputs } = text;
    const output = await serialize(async () => {
      const imageInputs = await runtime.processor(images);
      return runtime.model({ ...textInputs, ...imageInputs });
    });
    const textRows = toRows(output.text_embeds);
    const imageRows = toRows(output.image_embeds);
    if (textRows.length !== prompts.length || imageRows.length !== usable.length) throw new Error("CLIP embedding counts do not match the request.");

    const labelVectors = this.labels.map((label, index) => ({ label, vector: meanVector(textRows.slice(index * PROMPT_TEMPLATES.length, (index + 1) * PROMPT_TEMPLATES.length)) }));
    const prototypeVectors = new Map<string, Float32Array>();
    const referenceWidth = labelVectors[0]?.vector.length ?? 0;
    for (const [label, examples] of Object.entries(this.prototypes)) {
      const vectors = examples.map((embedding) => {
        const vector = Float32Array.from(embedding);
        let norm = 0;
        for (const item of vector) norm += item * item;
        norm = Math.sqrt(norm);
        if (norm > 0) for (let index = 0; index < vector.length; index++) vector[index] /= norm;
        return vector;
      });
      if (vectors.length && referenceWidth > 0 && vectors[0].length === referenceWidth) prototypeVectors.set(label, meanVector(vectors));
    }

    const results: CanvasRecognitionResult[] = [];
    let imageIndex = 0;
    for (const input of inputs) {
      if (!input.pngBase64) { results.push(empty(input, "No rendered image was supplied for CLIP recognition.")); continue; }
      const image = imageRows[imageIndex++];
      const scores = labelVectors.map(({ label, vector }) => {
        const textScore = dot(vector, image);
        const prototype = prototypeVectors.get(label);
        if (!prototype) return textScore;
        const count = this.prototypes[label]?.length ?? 0;
        const blend = count / (count + PROTOTYPE_BLEND_K);
        return (1 - blend) * textScore + blend * dot(prototype, image);
      });
      const probabilities = softmax(scores);
      const ranked = this.labels.map((label, index) => ({ label, probability: probabilities[index] })).sort((a, b) => b.probability - a.probability || a.label.localeCompare(b.label));
      const top = ranked[0], second = ranked[1];
      const accepted = top && top.probability >= this.minConfidence && (!second || top.probability - second.probability >= this.minMargin);
      if (!accepted) {
        results.push(empty(input, "CLIP confidence or margin is below the abstain threshold."));
        continue;
      }
      const alternatives = ranked.slice(1, 5).map((item) => item.label).filter((label) => label !== top.label);
      const candidates: CanvasRecognitionCandidate[] = [{ label: top.label, kind: kindFor(top.label), confidence: Number(top.probability.toFixed(4)), alternatives }];
      if (this.maxCandidates > 1 && second && second.probability >= this.minConfidence) {
        candidates.push({ label: second.label, kind: kindFor(second.label), confidence: Number(second.probability.toFixed(4)), alternatives: [top.label] });
      }
      results.push(CanvasRecognitionResultSchema.parse({
        groupId: input.groupId,
        sourceIds: input.sourceIds.slice(0, 64),
        bounds: input.bounds,
        candidates,
        uncertain: true,
        uncertaintyReasons: ["CLIP similarity is uncalibrated; treat this as a candidate, not a verified label."],
      }));
    }
    return results;
  }
}
