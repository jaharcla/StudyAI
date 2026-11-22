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
import { handleChat } from "../src/gateway.js";

const MODEL = "openai/gpt-oss-120b";
const TOKEN = "0123456789abcdef0123456789abcdef";

class FakeStore implements LedgerStore {
  wallets = new Map<string, WalletRow>();
  codes = new Map<string, CodeRow>();
  reservations = new Map<string, ReservationRow>();
  entries: Array<Omit<LedgerEntry, "id">> = [];

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
  async insertEntry(entry: Omit<LedgerEntry, "id">): Promise<void> {
    this.entries.push(entry);
  }
}

function chatRequest(model: string = MODEL, token: string | null = TOKEN): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token !== null) headers.authorization = `Bearer ${token}`;
  return new Request("https://credits.example/v1/chat/completions", {
    method: "POST",
    headers,
    body: JSON.stringify({ model, messages: [{ role: "user", content: "hi" }] }),
  });
}

function groqResponse(promptTokens: number, completionTokens: number): typeof fetch {
  const body = JSON.stringify({
    choices: [{ message: { content: "answer" } }],
    usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens },
  });
  return async () => new Response(body, { status: 200, headers: { "content-type": "application/json" } });
}

async function fundedStore(): Promise<{ store: FakeStore; walletId: string }> {
  const store = new FakeStore();
  const walletId = await hashToken(TOKEN);
  await createWallet(walletId, store);
  store.codes.set("FUND", { code: "FUND", value_micros: 100_000, redeemed_by: null });
  await redeemCode("FUND", walletId, store);
  return { store, walletId };
}

async function balanceOf(store: FakeStore, walletId: string): Promise<number> {
  return (await store.getWallet(walletId))?.balance_micros ?? -1;
}

describe("metered gateway", () => {
  it("returns 401 when the wallet token is missing or malformed", async () => {
    const { store } = await fundedStore();
    const res = await handleChat(
      chatRequest(MODEL, null),
      { GROQ_API_KEY: "key", store },
      groqResponse(1_000, 500),
    );
    expect(res.status).toBe(401);
  });

  it("returns 402 naming insufficient credits when the wallet is empty", async () => {
    const store = new FakeStore();
    const res = await handleChat(
      chatRequest(),
      { GROQ_API_KEY: "key", store },
      groqResponse(1_000, 500),
    );
    expect(res.status).toBe(402);
    expect((await res.json() as { error: string }).error).toContain("credit");
  });

  it("debits exactly the usage cost and returns text plus balance", async () => {
    const { store, walletId } = await fundedStore();
    const res = await handleChat(
      chatRequest(),
      { GROQ_API_KEY: "key", store },
      groqResponse(1_000, 500),
    );
    expect(res.status).toBe(200);
    // 1000 prompt tokens -> 150 micros; 500 completion tokens -> 300 micros.
    expect(await res.json()).toEqual({ text: "answer", balanceMicros: 100_000 - 450 });
    expect(await balanceOf(store, walletId)).toBe(99_550);
  });

  it("releases the hold when Groq fails, leaving the balance unchanged", async () => {
    const { store, walletId } = await fundedStore();
    const failingFetch: typeof fetch = async () => new Response("boom", { status: 500 });
    const res = await handleChat(chatRequest(), { GROQ_API_KEY: "key", store }, failingFetch);
    expect(res.status).toBe(502);
    expect(await balanceOf(store, walletId)).toBe(100_000);
    expect([...store.reservations.values()].every((r) => r.state === "released")).toBe(true);
    const wallet = await store.getWallet(walletId);
    expect(wallet?.spent_today_micros).toBe(0);
  });

  it("never debits more than the reserved amount when usage exceeds the estimate", async () => {
    const { store, walletId } = await fundedStore();
    const res = await handleChat(
      chatRequest(),
      { GROQ_API_KEY: "key", store },
      groqResponse(1_000_000, 1_000_000),
    );
    expect(res.status).toBe(200);
    expect(await balanceOf(store, walletId)).toBe(50_000);
  });

  it("rejects an unknown model with 400 before any reservation", async () => {
    const { store, walletId } = await fundedStore();
    const res = await handleChat(
      chatRequest("not-a-model"),
      { GROQ_API_KEY: "key", store },
      groqResponse(0, 0),
    );
    expect(res.status).toBe(400);
    expect(store.reservations.size).toBe(0);
    expect(await balanceOf(store, walletId)).toBe(100_000);
  });
});
