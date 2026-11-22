import { describe, it, expect, beforeEach } from "vitest";
import {
  createWallet,
  redeemCode,
  creditWallet,
  CodeError,
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

let store: FakeStore;
const walletId = "wallet-credit";

beforeEach(async () => {
  store = new FakeStore();
  await createWallet(walletId, store);
});

describe("creditWallet", () => {
  it("adds the exact amount and records one entry with the given reason", async () => {
    const result = await creditWallet(walletId, 500_000, "stripe_event:evt_1", store);
    expect(result.balanceMicros).toBe(500_000);
    const wallet = await store.getWallet(walletId);
    expect(wallet?.balance_micros).toBe(500_000);
    expect(store.entries).toHaveLength(1);
    expect(store.entries[0]).toMatchObject({ wallet_id: walletId, delta_micros: 500_000, reason: "stripe_event:evt_1" });
  });

  it("rejects zero, negative, and over-cap amounts without writing", async () => {
    await expect(creditWallet(walletId, 0, "zero", store)).rejects.toThrow();
    await expect(creditWallet(walletId, -1, "negative", store)).rejects.toThrow();
    await expect(creditWallet(walletId, 20_000_001, "over", store)).rejects.toThrow();
    expect(store.entries).toHaveLength(0);
    expect((await store.getWallet(walletId))?.balance_micros).toBe(0);
  });

  it("redeemCode credits once with reason code_redeem and cannot be replayed", async () => {
    store.codes.set("PACK", { code: "PACK", value_micros: 100_000, redeemed_by: null });
    const result = await redeemCode("PACK", walletId, store);
    expect(result.creditedMicros).toBe(100_000);
    expect(store.entries).toHaveLength(1);
    expect(store.entries[0].reason).toBe("code_redeem");
    await expect(redeemCode("PACK", walletId, store)).rejects.toThrow(CodeError);
    expect((await store.getWallet(walletId))?.balance_micros).toBe(100_000);
  });
});
