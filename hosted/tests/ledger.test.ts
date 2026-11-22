import { describe, it, expect, beforeEach } from 'vitest';
import {
  WalletRow,
  InsufficientCredits,
  CodeError,
  LedgerStore,
  ReservationRow,
  createWallet,
  getWallet,
  redeemCode,
  reserve,
  capture,
  release,
} from '../src/ledger.js';

/** Simple in‑memory implementation of LedgerStore for tests */
class InMemoryLedgerStore implements LedgerStore {
  wallets = new Map<string, WalletRow>();
  codes = new Map<string, { code: string; value_micros: number; redeemed_by?: string | null }>();
  reservations = new Map<string, ReservationRow>(); // id -> reservation

  async getWallet(id: string) {
    return this.wallets.get(id);
  }
  async insertWallet(wallet: WalletRow) {
    this.wallets.set(wallet.id, { ...wallet });
  }
  async updateWallet(wallet: WalletRow) {
    const existing = this.wallets.get(wallet.id);
    if (!existing) throw new Error('Wallet not found');
    if (existing.version !== wallet.version - 1) {
      // Simulate version conflict
      throw new Error('Version conflict');
    }
    this.wallets.set(wallet.id, { ...wallet });
  }
  async getCode(code: string) {
    return this.codes.get(code);
  }
  async markCodeRedeemed(code: string, walletId: string) {
    const c = this.codes.get(code);
    if (!c) throw new Error('Code not found');
    c.redeemed_by = walletId;
    this.codes.set(code, c);
  }
  async getReservation(id: string) {
    return this.reservations.get(id);
  }
  async insertReservation(reservation: ReservationRow) {
    this.reservations.set(reservation.id, { ...reservation });
  }
  async insertEntry(entry: any) {
    // No‑op for tests; could push to an array if needed.
  }
}

let store: InMemoryLedgerStore;
const walletId = 'wallet1';
const codeValue = 100_000; // $0.10
const code = 'CODE123';

beforeEach(async () => {
  store = new InMemoryLedgerStore();
  // preload a code for redemption tests
  store.codes.set(code, { code, value_micros: codeValue, redeemed_by: null });
});

describe('Ledger module', () => {
  it('createWallet starts at zero balance', async () => {
    const w = await createWallet(walletId, store);
    expect(w.balance_micros).toBe(0);
    expect(w.daily_cap_micros).toBe(1_000_000);
  });

  it('redeemCode credits the wallet and is idempotent', async () => {
    await createWallet(walletId, store);
    const res = await redeemCode(code, walletId, store);
    expect(res.creditedMicros).toBe(codeValue);
    const w = await getWallet(walletId, store);
    expect(w.balance_micros).toBe(codeValue);
    // second redemption should throw CodeError
    await expect(redeemCode(code, walletId, store)).rejects.toThrow(CodeError);
  });

  it('reserve reduces balance and respects daily cap', async () => {
    await createWallet(walletId, store);
    await redeemCode(code, walletId, store);
    const amount = 30_000; // $0.03
    const res = await reserve(walletId, amount, 'req1', store);
    expect(res.amountMicros).toBe(amount);
    const w = await getWallet(walletId, store);
    expect(w.balance_micros).toBe(codeValue - amount);
    expect(w.spent_today_micros).toBe(amount);
  });

  it('parallel reserves enforce balance', async () => {
    await createWallet(walletId, store);
    await redeemCode(code, walletId, store);
    const amt = 60_000; // $0.06, exceeds per‑request max but we test balance only
    const p1 = reserve(walletId, 40_000, 'r1', store);
    const p2 = reserve(walletId, 40_000, 'r2', store);
    const results = await Promise.allSettled([p1, p2]);
    const fulfilled = results.filter(r => r.status === 'fulfilled') as any[];
    const rejected = results.filter(r => r.status === 'rejected') as any[];
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(InsufficientCredits);
  });

  it('idempotent reserve with same requestId does not double debit', async () => {
    await createWallet(walletId, store);
    await redeemCode(code, walletId, store);
    const amount = 20_000;
    const first = await reserve(walletId, amount, 'dupReq', store);
    const second = await reserve(walletId, amount, 'dupReq', store);
    expect(second.id).toBe(first.id);
    const w = await getWallet(walletId, store);
    expect(w.balance_micros).toBe(codeValue - amount);
  });

  it('capture adjusts balance correctly', async () => {
    await createWallet(walletId, store);
    await redeemCode(code, walletId, store);
    const amount = 30_000;
    const { id } = await reserve(walletId, amount, 'capReq', store);
    // capture with higher actual amount (effective = min(40k,30k)=30k)
    await capture(id, 40_000, store);
    const w1 = await getWallet(walletId, store);
    expect(w1.balance_micros).toBe(codeValue - 30_000); // 100_000 - 30_000
    // capture with lower actual amount (effective = min(20k,30k)=20k, net +10k)
    const { id: id2 } = await reserve(walletId, amount, 'capReq2', store);
    await capture(id2, 20_000, store);
    const w2 = await getWallet(walletId, store);
    // after second capture: balance = (codeValue - 30k) - 30k + 20k = codeValue - 50k
    expect(w2.balance_micros).toBe(codeValue - 50_000);
  });

  it('release restores full amount', async () => {
    await createWallet(walletId, store);
    await redeemCode(code, walletId, store);
    const amount = 25_000;
    const { id } = await reserve(walletId, amount, 'relReq', store);
    await release(id, store);
    const w = await getWallet(walletId, store);
    expect(w.balance_micros).toBe(codeValue);
  });

  it('reservation cannot be captured twice', async () => {
    await createWallet(walletId, store);
    await redeemCode(code, walletId, store);
    const { id } = await reserve(walletId, 10_000, 'once', store);
    await capture(id, 10_000, store);
    await expect(capture(id, 10_000, store)).rejects.toThrow();
  });
});
