-- Migration: Ledger schema for Cloudflare D1
-- Table: wallets
CREATE TABLE wallets (
  id TEXT PRIMARY KEY,
  balance_micros INTEGER NOT NULL,
  version INTEGER NOT NULL,
  daily_cap_micros INTEGER NOT NULL,
  spent_today_micros INTEGER NOT NULL,
  day TEXT NOT NULL
);

-- Table: codes
CREATE TABLE codes (
  code TEXT PRIMARY KEY,
  value_micros INTEGER NOT NULL,
  redeemed_by TEXT
);

-- Table: reservations
CREATE TABLE reservations (
  id TEXT PRIMARY KEY,
  wallet_id TEXT NOT NULL,
  amount_micros INTEGER NOT NULL,
  request_id TEXT UNIQUE NOT NULL,
  state TEXT NOT NULL
);

-- Table: ledger_entries
CREATE TABLE ledger_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet_id TEXT NOT NULL,
  delta_micros INTEGER NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL
);
