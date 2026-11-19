import type { CanvasProviderId } from "./providers.js";

export type CanvasProviderUsage = {
  provider: CanvasProviderId;
  calls: number;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
};

const usage = new Map<CanvasProviderId, CanvasProviderUsage>();

export function recordProviderUsage(provider: CanvasProviderId, value: { promptTokens?: number; completionTokens?: number; costUsd?: number }) {
  const current = usage.get(provider) ?? { provider, calls: 0, promptTokens: 0, completionTokens: 0, costUsd: 0 };
  current.calls += 1;
  current.promptTokens += finite(value.promptTokens);
  current.completionTokens += finite(value.completionTokens);
  current.costUsd += finite(value.costUsd);
  usage.set(provider, current);
}

export function providerUsageSnapshot(): CanvasProviderUsage[] {
  return [...usage.values()].map((entry) => ({ ...entry, costUsd: Number(entry.costUsd.toFixed(6)) }));
}

export function consumeProviderUsage(): CanvasProviderUsage[] {
  const result = providerUsageSnapshot();
  usage.clear();
  return result;
}

export function resetProviderUsage() {
  usage.clear();
}

export function resetProviderUsageForTests() {
  usage.clear();
}

function finite(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
