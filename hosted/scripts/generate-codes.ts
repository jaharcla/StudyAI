import { randomBytes } from "node:crypto";

const MAX_PACK_MICROS = 20_000_000; // $20 cap from the plan
const DEFAULT_PREFIX = "SC";

/**
 * Generate unique, single-use credit codes offline. Codes are opaque to clients;
 * the ledger validates them at redemption time.
 */
export function generateCodes(count: number, valueMicros: number, prefix: string = DEFAULT_PREFIX): string[] {
  if (!Number.isInteger(count) || count <= 0) throw new Error("count must be a positive integer");
  if (!Number.isInteger(valueMicros) || valueMicros <= 0) throw new Error("valueMicros must be a positive integer");
  if (valueMicros > MAX_PACK_MICROS) throw new Error("value exceeds the $20 pack cap");

  const codes = new Set<string>();
  while (codes.size < count) {
    const hex = randomBytes(8).toString("hex");
    const grouped = hex.match(/.{4}/g)?.join("-") ?? hex;
    codes.add(`${prefix}-${grouped}`);
  }
  return [...codes];
}

// CLI: node generate-codes.ts <count> <valueMicros> [prefix] > codes.csv
if (process.argv[1]?.endsWith("generate-codes.ts")) {
  const count = Number(process.argv[2] ?? 0);
  const value = Number(process.argv[3] ?? 0);
  const prefix = process.argv[4] ?? DEFAULT_PREFIX;
  for (const code of generateCodes(count, value, prefix)) {
    console.log(`${code},${value}`);
  }
}
