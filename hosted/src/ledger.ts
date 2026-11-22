import { randomUUID } from 'node:crypto';

/**
 * Types and errors for the credit pack ledger.
 */
export type WalletRow = {
  id: string;
  balance_micros: number;
  version: number;
  daily_cap_micros: number;
  spent_today_micros: number;
  day: string; // YYYY-MM-DD UTC
};

export type CodeRow = {
  code: string;
  value_micros: number;
  redeemed_by?: string | null;
};

export type ReservationRow = {
  id: string;
  wallet_id: string;
  amount_micros: number;
  request_id: string;
  state: 'pending' | 'captured' | 'released';
};

export type LedgerEntry = {
  id: number;
  wallet_id: string;
  delta_micros: number;
  reason: string;
  created_at: string;
};

export class InsufficientCredits extends Error {}
export class CodeError extends Error {}

/** Interface that abstracts the persistence layer. */
export interface LedgerStore {
  // Wallet operations
  getWallet(id: string): Promise<WalletRow | undefined>;
  insertWallet(wallet: WalletRow): Promise<void>;
  updateWallet(wallet: WalletRow): Promise<void>;

  // Code operations
  getCode(code: string): Promise<CodeRow | undefined>;
  markCodeRedeemed(code: string, walletId: string): Promise<void>;

  // Reservation operations
  getReservation(id: string): Promise<ReservationRow | undefined>;
  insertReservation(res: ReservationRow): Promise<void>;

  // Ledger entry logging
  insertEntry(entry: Omit<LedgerEntry, 'id'>): Promise<void>;
}

/** Hard caps (micros) */
const MAX_PACK_VALUE = 20_000_000; // $20
const DAILY_CAP = 1_000_000; // $1 per wallet per day
const PER_REQUEST_MAX = 50_000; // $0.05 per request
/** Exported so the gateway can reserve exactly the maximum permitted per-request cost. */
export const PER_REQUEST_MAX_MICROS = PER_REQUEST_MAX;

/** Helper to get current UTC day string */
function utcDay(): string {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

/** Ensure the wallet's daily counters are reset if day changed */
async function refreshDaily(wallet: WalletRow): Promise<WalletRow> {
  const today = utcDay();
  if (wallet.day !== today) {
    wallet.day = today;
    wallet.spent_today_micros = 0;
  }
  return wallet;
}

/** Create a new wallet with zero balance */
export async function createWallet(id: string, store: LedgerStore): Promise<WalletRow> {
  const existing = await store.getWallet(id);
  if (existing) return existing;
  const wallet: WalletRow = {
    id,
    balance_micros: 0,
    version: 0,
    daily_cap_micros: DAILY_CAP,
    spent_today_micros: 0,
    day: utcDay(),
  };
  await store.insertWallet(wallet);
  return wallet;
}

/** Retrieve a wallet */
export async function getWallet(walletId: string, store: LedgerStore): Promise<WalletRow> {
  const w = await store.getWallet(walletId);
  if (!w) throw new Error('Wallet not found');
  return refreshDaily(w);
}

/** Redeem a credit code, adding its value to the wallet */
export async function redeemCode(
  rawCode: string,
  walletId: string,
  store: LedgerStore,
): Promise<{ creditedMicros: number }> {
  const code = await store.getCode(rawCode);
  if (!code) throw new CodeError('Invalid code');
  if (code.redeemed_by) throw new CodeError('Code already redeemed');
  if (code.value_micros > MAX_PACK_VALUE) throw new CodeError('Code value exceeds max pack');

  const wallet = await getWallet(walletId, store);
  // Update wallet balance and version atomically (optimistic)
  const newBalance = wallet.balance_micros + code.value_micros;
  const updated: WalletRow = { ...wallet, balance_micros: newBalance, version: wallet.version + 1 };
  await store.updateWallet(updated);
  await store.markCodeRedeemed(rawCode, walletId);
  await store.insertEntry({
    wallet_id: walletId,
    delta_micros: code.value_micros,
    reason: 'code_redeem',
    created_at: new Date().toISOString(),
  });
  return { creditedMicros: code.value_micros };
}

/** Reserve an amount for a request, respecting caps and idempotency */
export async function reserve(
  walletId: string,
  amountMicros: number,
  requestId: string,
  store: LedgerStore,
): Promise<{ id: string; amountMicros: number }> {
  if (amountMicros > PER_REQUEST_MAX) throw new InsufficientCredits('Exceeds per‑request max');

  // Idempotent: use requestId as reservation id
  const existing = await store.getReservation(requestId);
  if (existing) {
    if (existing.wallet_id !== walletId) throw new InsufficientCredits('Reservation belongs to another wallet');
    return { id: existing.id, amountMicros: existing.amount_micros };
  }

  const wallet = await getWallet(walletId, store);
  // Enforce daily cap
  if (wallet.spent_today_micros + amountMicros > wallet.daily_cap_micros) {
    throw new InsufficientCredits('Daily cap exceeded');
  }
  if (wallet.balance_micros < amountMicros) {
    throw new InsufficientCredits('Insufficient balance');
  }

  const updatedWallet: WalletRow = {
    ...wallet,
    balance_micros: wallet.balance_micros - amountMicros,
    spent_today_micros: wallet.spent_today_micros + amountMicros,
    version: wallet.version + 1,
  };
  try {
    await store.updateWallet(updatedWallet);
  } catch (e) {
    if (e instanceof Error && e.message.includes('Version conflict')) {
      throw new InsufficientCredits('Version conflict');
    }
    throw e;
  }

  const reservation: ReservationRow = {
    id: requestId,
    wallet_id: walletId,
    amount_micros: amountMicros,
    request_id: requestId,
    state: 'pending',
  };
  await store.insertReservation(reservation);
  await store.insertEntry({
    wallet_id: walletId,
    delta_micros: -amountMicros,
    reason: 'reserve',
    created_at: new Date().toISOString(),
  });
  return { id: reservation.id, amountMicros };
}

/** Capture a reservation, possibly adjusting the final amount */
export async function capture(
  reservationId: string,
  actualMicros: number,
  store: LedgerStore,
): Promise<void> {
  const reservation = await store.getReservation(reservationId);
  if (!reservation) throw new Error('Reservation not found');
  if (reservation.state !== 'pending') throw new Error('Reservation already settled');

  const walletBefore = await getWallet(reservation.wallet_id, store);
  // Clamp the actual amount to the reserved amount
  const effective = Math.min(actualMicros, reservation.amount_micros);

  // Compute final balance: undo the reservation debit and apply the effective amount
  const finalBalance = walletBefore.balance_micros + reservation.amount_micros - effective;
  if (finalBalance < 0) throw new InsufficientCredits('Insufficient balance for capture');

  // Adjust spent_today to reflect the net effect of the capture
  const spentDelta = effective - reservation.amount_micros; // may be negative
  const newSpentToday = Math.max(0, walletBefore.spent_today_micros + spentDelta);

  const updated: WalletRow = {
    ...walletBefore,
    balance_micros: finalBalance,
    spent_today_micros: newSpentToday,
    version: walletBefore.version + 1,
  };
  await store.updateWallet(updated);

  await store.insertEntry({
    wallet_id: walletBefore.id,
    delta_micros: -effective,
    reason: 'capture',
    created_at: new Date().toISOString(),
  });

  // Mark reservation captured
  reservation.state = 'captured';
  await store.insertReservation(reservation);
}

/** Release a reservation, refunding the full amount */
export async function release(reservationId: string, store: LedgerStore): Promise<void> {
  const reservation = await store.getReservation(reservationId);
  if (!reservation) throw new Error('Reservation not found');
  if (reservation.state !== 'pending') throw new Error('Reservation already settled');

  const walletBefore = await getWallet(reservation.wallet_id, store);
  const updated: WalletRow = {
    ...walletBefore,
    balance_micros: walletBefore.balance_micros + reservation.amount_micros,
    // Reduce spent_today by the reservation amount, clamped at zero
    spent_today_micros: Math.max(0, walletBefore.spent_today_micros - reservation.amount_micros),
    version: walletBefore.version + 1,
  };
  await store.updateWallet(updated);
  await store.insertEntry({
    wallet_id: walletBefore.id,
    delta_micros: reservation.amount_micros,
    reason: 'release',
    created_at: new Date().toISOString(),
  });
  reservation.state = 'released';
  await store.insertReservation(reservation);
}
