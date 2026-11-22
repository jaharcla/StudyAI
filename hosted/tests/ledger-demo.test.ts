import { describe, it, expect, beforeEach } from "vitest";
import {
  createWallet,
  grantDailyDemo,
  getWallet,
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
    const current = this.wallets.get(wallet.id);
    if (!current) throw new Error("Wallet not found");
    if (current.version !== wallet.version - 1) throw new Error("Version conflict");
    this.wallets.set(wallet.id, { ...wallet });
  }
  async getCode(code: string) { return this.codes.get(code); }
  async markCodeRedeemed() {}
  async getReservation(id: string) { return this.reservations.get(id); }
  async insertReservation(r: ReservationRow) { this.reservations.set(r.id, { ...r }); }
  async insertEntry(e: Omit<LedgerEntry, "id">) { this.entries.push(e); }
}

let store: FakeStore;
const WALLET = "wallet-demo";

beforeEach(async () => {
  store = new FakeStore();
  await createWallet(WALLET, store);
});

describe("daily demo grant", () => {
  it("starts with no demo day", async () => {
    expect((await getWallet(WALLET, store)).demo_day).toBe("");
  });

  it("grants once per UTC day and records the reason", async () => {
    const first = await grantDailyDemo(WALLET, "2026-11-22", 20_000, store);
    const second = await grantDailyDemo(WALLET, "2026-11-22", 20_000, store);
    expect(first).toBe(true);
    expect(second).toBe(false);
    expect((await getWallet(WALLET, store)).balance_micros).toBe(20_000);
    expect(store.entries).toHaveLength(1);
    expect(store.entries[0].reason).toBe(`demo_grant:${WALLET}:2026-11-22`);
  });

  it("grants again on a new UTC day", async () => {
    await grantDailyDemo(WALLET, "2026-11-22", 20_000, store);
    const next = await grantDailyDemo(WALLET, "2026-11-23", 20_000, store);
    expect(next).toBe(true);
    expect((await getWallet(WALLET, store)).balance_micros).toBe(40_000);
    expect(store.entries).toHaveLength(2);
  });
});
