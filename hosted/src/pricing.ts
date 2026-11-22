/**
 * Compute the cost in integer micros for a given model and token usage.
 *
 * All prices are pinned to Groq's published per‑million‑token rates for the
 * `openai/gpt-oss-120b` model. The rates are expressed in micros (1 µ = 10⁻⁶ USD).
 *
 * Input tokens: 0.15 USD per 1 M tokens → 150 000 µ per 1 M tokens.
 * Output tokens: 0.60 USD per 1 M tokens → 600 000 µ per 1 M tokens.
 *
 * The calculation uses integer arithmetic and rounds **up** each component
 * separately (i.e. Math.ceil) before summing, matching the brief's specification.
 */
export function costMicros(
  model: string,
  promptTokens: number,
  completionTokens: number,
): number {
  // Supported model rates (micros per 1 M tokens)
  const rates: Record<string, { input: number; output: number }> = {
    "openai/gpt-oss-120b": { input: 150_000, output: 600_000 },
  };

  const rate = rates[model];
  if (!rate) {
    throw new Error(`Unknown model: ${model}`);
  }

  const inputCost = Math.ceil((promptTokens * rate.input) / 1_000_000);
  const outputCost = Math.ceil((completionTokens * rate.output) / 1_000_000);
  return inputCost + outputCost;
}
