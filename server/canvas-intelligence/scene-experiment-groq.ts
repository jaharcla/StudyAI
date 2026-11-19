import { Buffer } from "node:buffer";
import { z } from "zod";
import { canvasInferenceProvider, canvasOCRProvider, groqOCRModel } from "./groq.js";
import { exactBase64ByteLength, MAX_SCENE_EXPERIMENT_INPUT_BYTES, SceneExperimentProposalSchema, validateSceneProposal, type SceneConditionPayload } from "./scene-experiment.js";

const SYSTEM = "Analyze the supplied educational canvas. Report visible text and symbols separately from interpretations. State ambiguity instead of guessing. Propose spatial or scientific relationships only when supported by the image and supplied evidence. Every result is provisional. Cite only exact supplied source or candidate references. Do not return coordinates, confidence, timestamps, or other provenance. Return only JSON matching the required output shape.";

export async function groqSceneExperimentCall(options: {
  payload: SceneConditionPayload;
  imageBase64: string;
  mimeType?: "image/png";
  allowedStrokeIds: ReadonlySet<string>;
  allowedSourceObjectIds: ReadonlySet<string>;
  allowedCandidateIds: ReadonlySet<string>;
  fetcher?: typeof fetch;
  signal?: AbortSignal;
}) {
  if (canvasOCRProvider() !== "groq" || canvasInferenceProvider() !== "groq") throw new Error("Whole-board scene experiment requires the currently configured Groq canvas providers.");
  const model = groqOCRModel();
  const mimeType = options.mimeType ?? "image/png";
  if (mimeType !== "image/png") throw new Error("Whole-board scene experiment accepts PNG capture only.");
  if (!options.imageBase64 || !/^[A-Za-z0-9+/]*={0,2}$/.test(options.imageBase64)) throw new Error("Whole-board scene experiment image is not valid base64.");
  const imageBytes = exactBase64ByteLength(options.imageBase64);
  const maxImageBytes = Number(process.env.CANVAS_MAX_IMAGE_BYTES || 8 * 1024 * 1024);
  if (imageBytes > maxImageBytes) throw new Error(`Whole-scene image exceeds CANVAS_MAX_IMAGE_BYTES (${maxImageBytes}).`);
  const prompt = JSON.stringify(options.payload);
  if (Buffer.byteLength(prompt) > MAX_SCENE_EXPERIMENT_INPUT_BYTES) throw new Error(`Whole-board source evidence exceeds ${MAX_SCENE_EXPERIMENT_INPUT_BYTES} bytes; no source strokes were dropped.`);
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey?.trim()) throw new Error("GROQ_API_KEY is not configured.");
  const timeout = Math.min(60_000, Number(process.env.CANVAS_GROQ_TIMEOUT_MS || 20_000));
  const signal = AbortSignal.any([AbortSignal.timeout(timeout), ...(options.signal ? [options.signal] : [])]);
  const response = await (options.fetcher ?? fetch)("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    signal,
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_completion_tokens: Number(process.env.CANVAS_GROQ_MAX_COMPLETION_TOKENS || 4096),
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: `data:${mimeType};base64,${options.imageBase64}` } }] },
      ],
    }),
  });
  if (!response.ok) throw new Error(`Groq whole-board inference HTTP ${response.status}${response.status === 429 ? " (rate limit)" : ""}`);
  const result = await response.json() as { choices?: Array<{ finish_reason?: unknown; message?: { content?: unknown } }> };
  const content = result.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) throw new Error("Groq whole-board inference returned no JSON content.");
  let parsed: unknown;
  try { parsed = JSON.parse(content); } catch { throw new Error("Groq whole-board inference returned invalid JSON."); }
  const finishReason = typeof result.choices?.[0]?.finish_reason === "string" ? result.choices[0].finish_reason : null;
  try {
    const rawProposal = SceneExperimentProposalSchema.parse(parsed);
    const validated = validateSceneProposal(rawProposal, options.allowedStrokeIds, options.allowedSourceObjectIds, options.allowedCandidateIds);
    return { model, rawText: content, finishReason, proposal: validated.proposal, rejectedReferences: validated.rejectedReferences, validationError: null };
  } catch (error) {
    return { model, rawText: content, finishReason, proposal: null, rejectedReferences: [], validationError: error instanceof Error ? error.message : String(error) };
  }
}
