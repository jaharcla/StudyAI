import type Database from "better-sqlite3";
import type { CanvasProviderId } from "./providers.js";

type BudgetState = { day: string; counts: Map<CanvasProviderId, number> };

const state: BudgetState = { day: utcDay(), counts: new Map() };
let budgetDb: Database.Database | null = null;

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

function ensureTable(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS canvas_provider_budgets (
      day TEXT NOT NULL,
      provider TEXT NOT NULL,
      used INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (day, provider)
    );
  `);
}

function syncFromDb(day: string) {
  if (!budgetDb) return;
  try {
    ensureTable(budgetDb);
    const rows = budgetDb.prepare("SELECT provider, used FROM canvas_provider_budgets WHERE day=?").all(day) as Array<{ provider: CanvasProviderId; used: number }>;
    state.counts.clear();
    for (const row of rows) {
      if (Number.isInteger(row.used) && row.used >= 0) state.counts.set(row.provider, row.used);
    }
  } catch {
    /* fallback to in-memory state if db is closed */
  }
}

export function configureProviderBudgetDatabase(db: Database.Database | null) {
  budgetDb = db;
  state.day = utcDay();
  state.counts.clear();
  if (budgetDb) syncFromDb(state.day);
}

function roll(now = Date.now()) {
  const day = utcDay(now);
  if (state.day !== day) {
    state.day = day;
    state.counts.clear();
    if (budgetDb) syncFromDb(day);
  }
}

function currentUsed(provider: CanvasProviderId): number {
  if (budgetDb) {
    try {
      ensureTable(budgetDb);
      const row = budgetDb.prepare("SELECT used FROM canvas_provider_budgets WHERE day=? AND provider=?").get(state.day, provider) as { used: number } | undefined;
      const used = row && Number.isInteger(row.used) && row.used >= 0 ? row.used : 0;
      state.counts.set(provider, used);
      return used;
    } catch {
      /* fallback to memory */
    }
  }
  return state.counts.get(provider) ?? 0;
}

export function providerBudgetRemaining(provider: CanvasProviderId, env: NodeJS.ProcessEnv = process.env): number {
  roll();
  return Math.max(0, limitFor(provider, env) - currentUsed(provider));
}

export function allowProviderRequest(provider: CanvasProviderId, env: NodeJS.ProcessEnv = process.env): boolean {
  roll();
  const limit = limitFor(provider, env);
  if (!Number.isFinite(limit)) return true;
  const used = currentUsed(provider);
  if (used >= limit) return false;
  const next = used + 1;
  state.counts.set(provider, next);
  if (budgetDb) {
    try {
      ensureTable(budgetDb);
      budgetDb.prepare("INSERT INTO canvas_provider_budgets(day,provider,used,updated_at) VALUES(?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(day,provider) DO UPDATE SET used=excluded.used,updated_at=CURRENT_TIMESTAMP").run(state.day, provider, next);
    } catch {
      /* fallback to memory */
    }
  }
  return true;
}

export function providerBudgetSnapshot(env: NodeJS.ProcessEnv = process.env): Record<string, { used: number; limit: number | null }> {
  roll();
  const result: Record<string, { used: number; limit: number | null }> = {};
  for (const provider of ["opencode-go", "openrouter"] as const) {
    const limit = limitFor(provider, env);
    result[provider] = { used: currentUsed(provider), limit: Number.isFinite(limit) ? limit : null };
  }
  return result;
}

export function resetProviderBudgetsForTests() {
  state.day = utcDay();
  state.counts.clear();
  if (budgetDb) {
    try {
      ensureTable(budgetDb);
      budgetDb.prepare("DELETE FROM canvas_provider_budgets").run();
    } catch {
      /* ignore */
    }
  }
}
