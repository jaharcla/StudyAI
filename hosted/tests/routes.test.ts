import { describe, it, expect } from "vitest";
import {
  createWallet,
  redeemCode,
  type LedgerStore,
  type WalletRow,
  type CodeRow,
  type ReservationRow,
  type LedgerEntry,
} from "../src/ledger.js";
import { hashToken } from "../src/token.js";
import { makeFetch, type WorkerEnv } from "../src/index.js";

const TOKEN = "abcdef0123456789abcdef0123456789";
const CLIENT = "client-token";

class FakeStore implements LedgerStore {
  wallets = new Map<string, WalletRow>();
  codes = new Map<string, CodeRow>();
  reservations = new Map<string, ReservationRow>();
  async getWallet(id: string): Promise<WalletRow | undefined> {
    return this.wallets.get(id);
  }
  async insertWallet(wallet: WalletRow): Promise<void> {
    this.wallets.set(wallet.id, { ...wallet });
  }
  async updateWallet(wallet: WalletRow): Promise<void> {
    const existing = this.wallets.get(wallet.id);
    if (!existing) throw new Error("Wallet not found");
    if (existing.version !== wallet.version - 1) throw new Error("Version conflict");
    this.wallets.set(wallet.id, { ...wallet });
  }
  async getCode(code: string): Promise<CodeRow | undefined> {
    return this.codes.get(code);
  }
  async markCodeRedeemed(code: string, walletId: string): Promise<void> {
    const row = this.codes.get(code);
    if (!row) throw new Error("Code not found");
    row.redeemed_by = walletId;
    this.codes.set(code, row);
  }
  async getReservation(id: string): Promise<ReservationRow | undefined> {
    return this.reservations.get(id);
  }
  async insertReservation(reservation: ReservationRow): Promise<void> {
    this.reservations.set(reservation.id, { ...reservation });
  }
  async insertEntry(_entry: Omit<LedgerEntry, "id">): Promise<void> {}
}

function env(): WorkerEnv {
  return {
    GROQ_API_KEY: "key",
    STUDYAI_CLIENT_TOKEN: CLIENT,
    STUDYAI_ORIGIN: "https://studyai.example",
  };
}

function request(path: string, init: RequestInit = {}, token: string | null = TOKEN): Request {
  const headers = new Headers(init.headers);
  headers.set("x-studyai-client", CLIENT);
  if (token !== null) headers.set("authorization", `Bearer ${token}`);
  return new Request(`https://credits.example${path}`, { ...init, headers });
}

describe("worker routes", () => {
  it("delegates chat requests to handleChat", async () => {
    const store = new FakeStore();
    const res = await makeFetch(store, env())(request("/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "openai/gpt-oss-120b", messages: [{ role: "user", content: "hi" }] }),
    }));
    // No wallet row exists, so the delegated handler rejects with insufficient credits.
    expect(res.status).toBe(402);
  });

  it("returns the wallet balance and creates a first-time wallet", async () => {
    const store = new FakeStore();
    const res = await makeFetch(store, env())(request("/v1/wallet"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ balanceMicros: 0 });
    const walletId = await hashToken(TOKEN);
    expect(store.wallets.has(walletId)).toBe(true);
  });

  it("rejects wallet requests without a token", async () => {
    const res = await makeFetch(new FakeStore(), env())(request("/v1/wallet", {}, null));
    expect(res.status).toBe(401);
  });

  it("redeems a code once and rejects a second redemption", async () => {
    const store = new FakeStore();
    const walletId = await hashToken(TOKEN);
    await createWallet(walletId, store);
    store.codes.set("CODE", { code: "CODE", value_micros: 100_000, redeemed_by: null });
    const handler = makeFetch(store, env());
    const body = JSON.stringify({ code: "CODE" });
    const first = await handler(request("/v1/redeem", {
      method: "POST", headers: { "content-type": "application/json" }, body,
    }));
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ creditedMicros: 100_000 });
    const second = await handler(request("/v1/redeem", {
      method: "POST", headers: { "content-type": "application/json" }, body,
    }));
    expect(second.status).toBe(400);
  });

  it("rejects a missing client marker with 403", async () => {
    const req = new Request("https://credits.example/v1/wallet", {
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    const res = await makeFetch(new FakeStore(), env())(req);
    expect(res.status).toBe(403);
  });

  it("returns 404 for an unknown path", async () => {
    const res = await makeFetch(new FakeStore(), env())(request("/nope"));
    expect(res.status).toBe(404);
  });
});
