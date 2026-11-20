import type Database from "better-sqlite3";
import type { CanvasProviderId } from "./providers.js";

export type CanvasProviderUsage = {
  provider: CanvasProviderId;
  calls: number;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  backoffs?: number;
  backoffMs?: number;
};

export type CanvasProviderCircuitState = {
  provider: CanvasProviderId;
  state: "closed" | "open" | "half-open";
  consecutiveFailures: number;
  totalFailures: number;
  tripCount: number;
  openedAt: number | null;
  lastError: string | null;
  backoffs: number;
  backoffMs: number;
};

const ALL_PROVIDERS: readonly CanvasProviderId[] = ["groq", "opencode-go", "openrouter", "gemini", "ollama"];
const usage = new Map<CanvasProviderId, CanvasProviderUsage>();
const circuits = new Map<CanvasProviderId, CanvasProviderCircuitState>();
let usageDb: Database.Database | null = null;

function utcDay(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

function ensureUsageTable(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS canvas_provider_usage (
      day TEXT NOT NULL,
      provider TEXT NOT NULL,
      calls INTEGER NOT NULL DEFAULT 0,
      prompt_tokens INTEGER NOT NULL DEFAULT 0,
      completion_tokens INTEGER NOT NULL DEFAULT 0,
      cost_usd REAL NOT NULL DEFAULT 0,
      failures INTEGER NOT NULL DEFAULT 0,
      backoffs INTEGER NOT NULL DEFAULT 0,
      backoff_ms INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (day, provider)
    );
  `);
}

export function configureProviderUsageDatabase(db: Database.Database | null) {
  usageDb = db;
  if (usageDb) {
    try {
      ensureUsageTable(usageDb);
    } catch {
      /* ignore if db not ready */
    }
  }
}

export function recordProviderUsage(provider: CanvasProviderId, value: { promptTokens?: number; completionTokens?: number; costUsd?: number }) {
  const promptTokens = finite(value.promptTokens);
  const completionTokens = finite(value.completionTokens);
  const costUsd = finite(value.costUsd);
  const current = usage.get(provider) ?? { provider, calls: 0, promptTokens: 0, completionTokens: 0, costUsd: 0 };
  current.calls += 1;
  current.promptTokens += promptTokens;
  current.completionTokens += completionTokens;
  current.costUsd += costUsd;
  usage.set(provider, current);
  if (usageDb) {
    try {
      ensureUsageTable(usageDb);
      usageDb.prepare(`
        INSERT INTO canvas_provider_usage(day,provider,calls,prompt_tokens,completion_tokens,cost_usd,updated_at)
        VALUES(?,?,1,?,?,?,CURRENT_TIMESTAMP)
        ON CONFLICT(day,provider) DO UPDATE SET
          calls = canvas_provider_usage.calls + 1,
          prompt_tokens = canvas_provider_usage.prompt_tokens + excluded.prompt_tokens,
          completion_tokens = canvas_provider_usage.completion_tokens + excluded.completion_tokens,
          cost_usd = canvas_provider_usage.cost_usd + excluded.cost_usd,
          updated_at = CURRENT_TIMESTAMP
      `).run(utcDay(), provider, promptTokens, completionTokens, costUsd);
    } catch {
      /* fallback to memory */
    }
  }
}

export function recordProviderBackoff(provider: CanvasProviderId, delayMs: number) {
  const ms = Math.max(0, Math.round(finite(delayMs)));
  const current = usage.get(provider);
  if (current) {
    current.backoffs = (current.backoffs ?? 0) + 1;
    current.backoffMs = (current.backoffMs ?? 0) + ms;
  }
  const circuit = getCircuit(provider);
  circuit.backoffs += 1;
  circuit.backoffMs += ms;
  if (usageDb) {
    try {
      ensureUsageTable(usageDb);
      usageDb.prepare(`
        INSERT INTO canvas_provider_usage(day,provider,backoffs,backoff_ms,updated_at)
        VALUES(?,?,1,?,CURRENT_TIMESTAMP)
        ON CONFLICT(day,provider) DO UPDATE SET
          backoffs = canvas_provider_usage.backoffs + 1,
          backoff_ms = canvas_provider_usage.backoff_ms + excluded.backoff_ms,
          updated_at = CURRENT_TIMESTAMP
      `).run(utcDay(), provider, ms);
    } catch {
      /* fallback to memory */
    }
  }
}

function getCircuit(provider: CanvasProviderId): CanvasProviderCircuitState {
  let state = circuits.get(provider);
  if (!state) {
    state = { provider, state: "closed", consecutiveFailures: 0, totalFailures: 0, tripCount: 0, openedAt: null, lastError: null, backoffs: 0, backoffMs: 0 };
    circuits.set(provider, state);
  }
  return state;
}

function circuitThreshold(env: NodeJS.ProcessEnv = process.env): number {
  const parsed = Number(env.CANVAS_PROVIDER_CIRCUIT_THRESHOLD ?? 3);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : 3;
}

function circuitCooldownMs(env: NodeJS.ProcessEnv = process.env): number {
  const parsed = Number(env.CANVAS_PROVIDER_CIRCUIT_COOLDOWN_MS ?? 30_000);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 30_000;
}

export function isProviderCircuitOpen(provider: CanvasProviderId, now = Date.now(), env: NodeJS.ProcessEnv = process.env): boolean {
  const circuit = getCircuit(provider);
  if (circuit.state !== "open") return false;
  if (circuit.openedAt !== null && now - circuit.openedAt >= circuitCooldownMs(env)) {
    circuit.state = "half-open";
    return false;
  }
  return true;
}

export function recordProviderSuccess(provider: CanvasProviderId) {
  const circuit = getCircuit(provider);
  circuit.state = "closed";
  circuit.consecutiveFailures = 0;
  circuit.openedAt = null;
}

export function recordProviderFailure(provider: CanvasProviderId, errorMessage: string, now = Date.now(), env: NodeJS.ProcessEnv = process.env) {
  const circuit = getCircuit(provider);
  circuit.consecutiveFailures += 1;
  circuit.totalFailures += 1;
  circuit.lastError = String(errorMessage).slice(0, 200);
  if (circuit.consecutiveFailures >= circuitThreshold(env)) {
    if (circuit.state !== "open") circuit.tripCount += 1;
    circuit.state = "open";
    circuit.openedAt = now;
  }
  if (usageDb) {
    try {
      ensureUsageTable(usageDb);
      usageDb.prepare(`
        INSERT INTO canvas_provider_usage(day,provider,failures,updated_at)
        VALUES(?,?,1,CURRENT_TIMESTAMP)
        ON CONFLICT(day,provider) DO UPDATE SET
          failures = canvas_provider_usage.failures + 1,
          updated_at = CURRENT_TIMESTAMP
      `).run(utcDay(now), provider);
    } catch {
      /* fallback to memory */
    }
  }
}

export function providerCircuitSnapshot(now = Date.now(), env: NodeJS.ProcessEnv = process.env): Record<CanvasProviderId, CanvasProviderCircuitState> {
  const result = {} as Record<CanvasProviderId, CanvasProviderCircuitState>;
  for (const provider of ALL_PROVIDERS) {
    isProviderCircuitOpen(provider, now, env);
    result[provider] = { ...getCircuit(provider) };
  }
  return result;
}

export function persistedProviderUsageSnapshot(day = utcDay()): Array<CanvasProviderUsage & { failures: number; backoffs: number; backoffMs: number }> {
  if (!usageDb) return providerUsageSnapshot().map((entry) => ({ ...entry, failures: getCircuit(entry.provider).totalFailures, backoffs: entry.backoffs ?? 0, backoffMs: entry.backoffMs ?? 0 }));
  try {
    ensureUsageTable(usageDb);
    const rows = usageDb.prepare("SELECT provider,calls,prompt_tokens,completion_tokens,cost_usd,failures,backoffs,backoff_ms FROM canvas_provider_usage WHERE day=? ORDER BY provider").all(day) as Array<{ provider: CanvasProviderId; calls: number; prompt_tokens: number; completion_tokens: number; cost_usd: number; failures: number; backoffs: number; backoff_ms: number }>;
    return rows.map((row) => ({
      provider: row.provider,
      calls: row.calls,
      promptTokens: row.prompt_tokens,
      completionTokens: row.completion_tokens,
      costUsd: Number(Number(row.cost_usd).toFixed(6)),
      failures: row.failures,
      backoffs: row.backoffs,
      backoffMs: row.backoff_ms,
    }));
  } catch {
    return [];
  }
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
  if (usageDb) {
    try {
      ensureUsageTable(usageDb);
      usageDb.prepare("DELETE FROM canvas_provider_usage").run();
    } catch {
      /* ignore */
    }
  }
}

export function resetProviderCircuitsForTests() {
  circuits.clear();
}

function finite(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
