/**
 * Local math API route. Validates the model's typed proposal with a shared Zod
 * schema, then delegates all computation to the deterministic evaluator.
 * No provider call, network egress, persistence or model-generated code.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import { evaluateMath } from "../../src/math/evaluator.js";

export type JsonHelper = (res: ServerResponse, status: number, data: unknown) => void;
export type BodyHelper = (req: IncomingMessage, limit?: number) => Promise<string>;

const reason = z.string().max(280).optional();

/** Shared with the Tutor frontend tool: the model may propose these shapes only. */
export const mathEnvelopeSchema = z.discriminatedUnion("operation", [
  z.strictObject({
    operation: z.literal("solve"),
    arguments: z.strictObject({ expression: z.string(), variable: z.string().optional() }),
    reason,
  }),
  z.strictObject({
    operation: z.literal("simplify"),
    arguments: z.strictObject({ expression: z.string() }),
    reason,
  }),
  z.strictObject({
    operation: z.literal("check_equivalence"),
    arguments: z.strictObject({ left: z.string(), right: z.string() }),
    reason,
  }),
  z.strictObject({
    operation: z.literal("unit_convert"),
    arguments: z.strictObject({ value: z.union([z.string(), z.number()]), from: z.string(), to: z.string() }),
    reason,
  }),
]);

export type MathEnvelope = z.infer<typeof mathEnvelopeSchema>;

/** Returns true when this request belonged to the math route. */
export async function handleMathRequest(
  req: IncomingMessage,
  res: ServerResponse,
  json: JsonHelper,
  body: BodyHelper,
): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (req.method !== "POST" || url.pathname !== "/api/math/evaluate") return false;

  let raw: string;
  try {
    raw = await body(req, 64_000);
  } catch {
    json(res, 400, { error: "Invalid JSON." });
    return true;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    json(res, 400, { error: "Invalid JSON." });
    return true;
  }

  const validated = mathEnvelopeSchema.safeParse(parsed);
  if (!validated.success) {
    json(res, 200, {
      status: "error",
      reason: validated.error.issues[0]?.message ?? "Invalid math request.",
    });
    return true;
  }

  json(res, 200, evaluateMath(validated.data));
  return true;
}
