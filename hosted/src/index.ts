import {
  createWallet,
  getWallet,
  redeemCode,
  CodeError,
  type LedgerStore,
  type WalletRow,
  type CodeRow,
  type ReservationRow,
} from "./ledger.js";
import { handleChat } from "./gateway.js";
import { hashToken } from "./token.js";
import {
  createCheckoutSession,
  createStripeCheckoutClient,
  type StripeCheckoutClient,
  type CheckoutParams,
} from "./stripe.js";
import {
  handleStripeWebhook,
  verifyStripeSignature,
  type StripeEvent,
  type StripeEventStore,
} from "./stripe-webhook.js";

/** Minimal structural D1 types: avoids adding a Workers type dependency to this repo. */
export interface D1StatementLike {
  bind(...values: unknown[]): D1StatementLike;
  all(): Promise<{ results: Array<Record<string, unknown>> }>;
  run(): Promise<{ meta?: { changes?: number } }>;
}
export interface D1DatabaseLike {
  prepare(sql: string): D1StatementLike;
}

export interface WorkerEnv {
  CREDITS_DB?: D1DatabaseLike;
  GROQ_API_KEY: string;
  STUDYAI_CLIENT_TOKEN: string;
  STUDYAI_ORIGIN?: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function walletRow(row: Record<string, unknown>): WalletRow {
  return {
    id: String(row.id),
    balance_micros: Number(row.balance_micros),
    version: Number(row.version),
    daily_cap_micros: Number(row.daily_cap_micros),
    spent_today_micros: Number(row.spent_today_micros),
    day: String(row.day),
  };
}

/** D1-backed LedgerStore. Only the statements this app needs are implemented. */
export function createD1Store(db: D1DatabaseLike): LedgerStore {
  const one = async (sql: string, ...values: unknown[]): Promise<Record<string, unknown> | undefined> => {
    const result = await db.prepare(sql).bind(...values).all();
    return result.results[0];
  };
  return {
    async getWallet(id) {
      const row = await one("SELECT * FROM wallets WHERE id = ?", id);
      return row ? walletRow(row) : undefined;
    },
    async insertWallet(wallet) {
      await db.prepare(
        "INSERT INTO wallets (id, balance_micros, version, daily_cap_micros, spent_today_micros, day) VALUES (?, ?, ?, ?, ?, ?)",
      ).bind(wallet.id, wallet.balance_micros, wallet.version, wallet.daily_cap_micros, wallet.spent_today_micros, wallet.day).run();
    },
    async updateWallet(wallet) {
      const result = await db.prepare(
        "UPDATE wallets SET balance_micros = ?, version = ?, daily_cap_micros = ?, spent_today_micros = ?, day = ? WHERE id = ? AND version = ?",
      ).bind(wallet.balance_micros, wallet.version, wallet.daily_cap_micros, wallet.spent_today_micros, wallet.day, wallet.id, wallet.version - 1).run();
      if (result.meta?.changes === 0) throw new Error("Version conflict");
    },
    async getCode(code) {
      const row = await one("SELECT * FROM codes WHERE code = ?", code);
      if (!row) return undefined;
      return { code: String(row.code), value_micros: Number(row.value_micros), redeemed_by: row.redeemed_by == null ? null : String(row.redeemed_by) } satisfies CodeRow;
    },
    async markCodeRedeemed(code, walletId) {
      await db.prepare("UPDATE codes SET redeemed_by = ? WHERE code = ? AND redeemed_by IS NULL").bind(walletId, code).run();
    },
    async getReservation(id) {
      const row = await one("SELECT * FROM reservations WHERE id = ?", id);
      if (!row) return undefined;
      return {
        id: String(row.id),
        wallet_id: String(row.wallet_id),
        amount_micros: Number(row.amount_micros),
        request_id: String(row.request_id),
        state: String(row.state) as ReservationRow["state"],
      };
    },
    async insertReservation(reservation) {
      await db.prepare(
        "INSERT INTO reservations (id, wallet_id, amount_micros, request_id, state) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET state = excluded.state",
      ).bind(reservation.id, reservation.wallet_id, reservation.amount_micros, reservation.request_id, reservation.state).run();
    },
    async insertEntry(entry) {
      await db.prepare(
        "INSERT INTO ledger_entries (wallet_id, delta_micros, reason, created_at) VALUES (?, ?, ?, ?)",
      ).bind(entry.wallet_id, entry.delta_micros, entry.reason, entry.created_at).run();
    },
  };
}

/** D1-backed Stripe event store for webhook replay protection. */
function createD1EventStore(db: D1DatabaseLike): StripeEventStore {
  return {
    async hasEvent(id) {
      const row = await db.prepare("SELECT event_id FROM stripe_events WHERE event_id = ?").bind(id).all();
      return row.results.length > 0;
    },
    async recordEvent(id, kind, createdAt) {
      await db.prepare("INSERT OR IGNORE INTO stripe_events (event_id, kind, created_at) VALUES (?, ?, ?)").bind(id, kind, createdAt).run();
    },
  };
}

function walletToken(request: Request): string | null {
  const match = /^Bearer ([0-9a-f]{32,})$/i.exec(request.headers.get("authorization") ?? "");
  return match ? match[1].toLowerCase() : null;
}

function withCors(response: Response, request: Request, env: WorkerEnv): Response {
  const origin = request.headers.get("origin");
  if (!origin || origin !== env.STUDYAI_ORIGIN) return response;
  const headers = new Headers(response.headers);
  headers.set("access-control-allow-origin", origin);
  headers.set("vary", "Origin");
  headers.set("access-control-allow-methods", "GET, POST, OPTIONS");
  headers.set("access-control-allow-headers", "content-type, authorization, x-studyai-client");
  return new Response(response.body, { status: response.status, headers });
}

export interface RouteDeps {
  stripe?: StripeCheckoutClient;
  constructEvent?: (body: string, signature: string, secret: string) => StripeEvent | Promise<StripeEvent>;
  events?: StripeEventStore;
}

function memoryEventStore(): StripeEventStore {
  const seen = new Set<string>();
  return {
    async hasEvent(id) { return seen.has(id); },
    async recordEvent(id) { seen.add(id); },
  };
}

function integrationIdentifier(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return `studyai-${Array.from(bytes, (b) => String.fromCharCode(97 + (b % 26))).join("")}`;
}

/** Route handler with injectable dependencies, so it can be tested without D1 or Stripe. */
export function makeFetch(store: LedgerStore, env: WorkerEnv, deps: RouteDeps = {}): (request: Request) => Promise<Response> {
  return async (request) => {
    const path = new URL(request.url).pathname;
    if (path === "/v1/stripe/webhook" && request.method === "POST") {
      return handleStripeWebhook(
        request,
        {
          STRIPE_WEBHOOK_SECRET: env.STRIPE_WEBHOOK_SECRET,
          store,
          events: deps.events ?? memoryEventStore(),
        },
        deps.constructEvent ?? verifyStripeSignature,
      );
    }

    if (request.headers.get("x-studyai-client") !== env.STUDYAI_CLIENT_TOKEN) {
      return json(403, { error: "invalid_client" });
    }
    if (request.method === "OPTIONS") {
      return withCors(new Response(null, { status: 204 }), request, env);
    }

    let response: Response;
    if (path === "/v1/chat/completions" && request.method === "POST") {
      response = await handleChat(request, { GROQ_API_KEY: env.GROQ_API_KEY, store });
    } else if (path === "/v1/checkout" && request.method === "POST") {
      const token = walletToken(request);
      if (!token) {
        response = json(401, { error: "invalid_wallet_token" });
      } else {
        let kind = "";
        let choice = "";
        try {
          const body = (await request.json()) as { kind?: string; choice?: string };
          kind = body.kind ?? "";
          choice = body.choice ?? "";
        } catch {
          response = json(400, { error: "invalid_request" });
          return withCors(response, request, env);
        }
        if ((kind !== "donation" && kind !== "credits") || !choice) {
          response = json(400, { error: "invalid_request" });
        } else {
          try {
            const stripe = deps.stripe ?? createStripeCheckoutClient(env.STRIPE_SECRET_KEY);
            const session = await createCheckoutSession(
              {
                kind,
                choice,
                walletId: await hashToken(token),
                origin: env.STUDYAI_ORIGIN ?? "",
                integrationIdentifier: integrationIdentifier(),
              },
              stripe,
            );
            response = json(200, session);
          } catch {
            response = json(400, { error: "invalid_checkout" });
          }
        }
      }
    } else if (path === "/v1/wallet" && request.method === "GET") {
      const token = walletToken(request);
      if (!token) {
        response = json(401, { error: "invalid_wallet_token" });
      } else {
        const id = await hashToken(token);
        const existing = await getWallet(id, store).catch(() => undefined);
        const wallet = existing ?? await createWallet(id, store);
        response = json(200, { balanceMicros: wallet.balance_micros });
      }
    } else if (path === "/v1/redeem" && request.method === "POST") {
      const token = walletToken(request);
      if (!token) {
        response = json(401, { error: "invalid_wallet_token" });
      } else {
        let code = "";
        try {
          const body = (await request.json()) as { code?: string };
          code = body.code ?? "";
        } catch {
          response = json(400, { error: "invalid_request" });
          return withCors(response, request, env);
        }
        if (!code) {
          response = json(400, { error: "invalid_request" });
        } else {
          try {
            const result = await redeemCode(code, await hashToken(token), store);
            response = json(200, { creditedMicros: result.creditedMicros });
          } catch (error) {
            response = error instanceof CodeError ? json(400, { error: "invalid_code" }) : json(400, { error: "redeem_failed" });
          }
        }
      }
    } else {
      response = json(404, { error: "not_found" });
    }
    return withCors(response, request, env);
  };
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    if (!env.CREDITS_DB) return json(500, { error: "credits_db_unavailable" });
    return makeFetch(createD1Store(env.CREDITS_DB), env, { events: createD1EventStore(env.CREDITS_DB) })(request);
  },
};
