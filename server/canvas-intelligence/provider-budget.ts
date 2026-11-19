import type { CanvasProviderId } from "./providers.js";

type BudgetState = { day: string; counts: Map<CanvasProviderId, number> };

const state: BudgetState = { day: utcDay(), counts: new Map() };

function utcDay(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

function limitFor(provider: CanvasProviderId, env: NodeJS.ProcessEnv): number {
  if (provider === "opencode-go") return nonNegativeInteger(env.CANVAS_OPENCODE_GO_MAX_REQUESTS_PER_DAY, 20);
  if (provider === "openrouter") return nonNegativeInteger(env.CANVAS_OPENROUTER_MAX_REQUESTS_PER_DAY, 50);
  return Number.POSITIVE_INFINITY;
}

function nonNegativeInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function roll(now = Date.now()) {
  const day = utcDay(now);
  if (state.day !== day) {
    state.day = day;
    state.counts.clear();
  }
}

export function providerBudgetRemaining(provider: CanvasProviderId, env: NodeJS.ProcessEnv = process.env): number {
  roll();
  return Math.max(0, limitFor(provider, env) - (state.counts.get(provider) ?? 0));
}

export function allowProviderRequest(provider: CanvasProviderId, env: NodeJS.ProcessEnv = process.env): boolean {
  roll();
  const limit = limitFor(provider, env);
  if (!Number.isFinite(limit)) return true;
  const used = state.counts.get(provider) ?? 0;
  if (used >= limit) return false;
  state.counts.set(provider, used + 1);
  return true;
}

export function providerBudgetSnapshot(env: NodeJS.ProcessEnv = process.env): Record<string, { used: number; limit: number | null }> {
  roll();
  const result: Record<string, { used: number; limit: number | null }> = {};
  for (const provider of ["opencode-go", "openrouter"] as const) {
    const limit = limitFor(provider, env);
    result[provider] = { used: state.counts.get(provider) ?? 0, limit: Number.isFinite(limit) ? limit : null };
  }
  return result;
}

export function resetProviderBudgetsForTests() {
  state.day = utcDay();
  state.counts.clear();
}
