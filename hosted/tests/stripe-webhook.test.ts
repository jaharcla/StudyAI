import { describe, it, expect, beforeEach } from "vitest";
import {
  handleStripeWebhook,
  type StripeEvent,
  type StripeEventStore,
} from "../src/stripe-webhook.js";
import {
  createWallet,
  type LedgerStore,
  type WalletRow,
  type CodeRow,
  type ReservationRow,
  type LedgerEntry,
} from "../src/ledger.js";

class FakeStore implements LedgerStore {
  wallets = new Map<string, WalletRow>();
  codes = new Map<string, CodeRow>();
  reservations = new Map<string, ReservationRow>();
  entries: Array<Omit<LedgerEntry, "id">> = [];
  async getWallet(id: string) { return this.wallets.get(id); }
  async insertWallet(wallet: WalletRow) { this.wallets.set(wallet.id, { ...wallet }); }
  async updateWallet(wallet: WalletRow) {
    const existing = this.wallets.get(wallet.id);
    if (!existing) throw new Error("Wallet not found");
    if (existing.version !== wallet.version - 1) throw new Error("Version conflict");
    this.wallets.set(wallet.id, { ...wallet });
  }
  async getCode(code: string) { return this.codes.get(code); }
  async markCodeRedeemed() {}
  async getReservation(id: string) { return this.reservations.get(id); }
  async insertReservation(r: ReservationRow) { this.reservations.set(r.id, { ...r }); }
  async insertEntry(e: Omit<LedgerEntry, "id">) { this.entries.push(e); }
}

class FakeEvents implements StripeEventStore {
  seen = new Set<string>();
  async hasEvent(id: string) { return this.seen.has(id); }
  async recordEvent(id: string) { this.seen.add(id); }
}

const WALLET = "wallet-webhook";

function event(overrides: Partial<StripeEvent> = {}): StripeEvent {
  return {
    id: "evt_1",
    type: "checkout.session.completed",
    data: {
      object: {
        payment_status: "paid",
        client_reference_id: WALLET,
        metadata: { kind: "credits", credit_micros: "5000000" },
      },
    },
    ...overrides,
  };
}

function request(body = "{}"): Request {
  return new Request("https://credits.example/v1/stripe/webhook", {
    method: "POST",
    headers: { "stripe-signature": "valid" },
    body,
  });
}

let store: FakeStore;
let events: FakeEvents;

beforeEach(async () => {
  store = new FakeStore();
  events = new FakeEvents();
  await createWallet(WALLET, store);
});

describe("Stripe webhook", () => {
  it("rejects a bad signature without touching the ledger", async () => {
    const res = await handleStripeWebhook(
      request(),
      { STRIPE_WEBHOOK_SECRET: "whsec", store, events },
      () => { throw new Error("bad signature"); },
    );
    expect(res.status).toBe(400);
    expect(store.entries).toHaveLength(0);
    expect(events.seen.size).toBe(0);
  });

  it("credits a completed paid credit event once and is idempotent on replay", async () => {
    const verify = () => event();
    const env = { STRIPE_WEBHOOK_SECRET: "whsec", store, events };
    const first = await handleStripeWebhook(request(), env, verify);
    const second = await handleStripeWebhook(request(), env, verify);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(store.entries).toHaveLength(1);
    expect((await store.getWallet(WALLET))?.balance_micros).toBe(5_000_000);
  });

  it("credits async_payment_succeeded when paid", async () => {
    const res = await handleStripeWebhook(
      request(),
      { STRIPE_WEBHOOK_SECRET: "whsec", store, events },
      () => event({ id: "evt_async", type: "checkout.session.async_payment_succeeded" }),
    );
    expect(res.status).toBe(200);
    expect((await store.getWallet(WALLET))?.balance_micros).toBe(5_000_000);
  });

  it("does not credit unpaid, failed, donation, missing-wallet, or unrelated events", async () => {
    const env = { STRIPE_WEBHOOK_SECRET: "whsec", store, events };
    const cases = [
      event({ id: "e_unpaid", data: { object: { payment_status: "unpaid", client_reference_id: WALLET, metadata: { kind: "credits", credit_micros: "5000000" } } } }),
      event({ id: "e_failed", type: "checkout.session.async_payment_failed" }),
      event({ id: "e_donation", data: { object: { payment_status: "paid", client_reference_id: WALLET, metadata: { kind: "donation", credit_micros: "0" } } } }),
      event({ id: "e_nowallet", data: { object: { payment_status: "paid", client_reference_id: null, metadata: { kind: "credits", credit_micros: "5000000" } } } }),
      event({ id: "e_other", type: "payment_intent.created" }),
    ];
    for (const e of cases) {
      const res = await handleStripeWebhook(request(), env, () => e);
      expect(res.status).toBe(200);
    }
    expect(store.entries).toHaveLength(0);
    expect((await store.getWallet(WALLET))?.balance_micros).toBe(0);
    expect(events.seen.size).toBe(cases.length);
  });
});
