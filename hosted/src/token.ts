// Token utilities for anonymous wallets
// Generates a random token, hashes it to an identifier, and provides recovery code handling.

/** Convert a Uint8Array or ArrayBuffer to a hex string */
function bytesToHex(bytes: Uint8Array | ArrayBuffer): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Generate a new wallet token and its hashed id.
 *  The token is at least 32 random hex characters (16 bytes).
 *  The id is a 32‑character hex string derived from SHA‑256 of the token.
 */
export async function newWalletToken(): Promise<{ token: string; id: string }> {
  const randomBytes = new Uint8Array(16); // 16 bytes => 32 hex chars
  crypto.getRandomValues(randomBytes);
  const token = bytesToHex(randomBytes);
  const id = await hashToken(token);
  return { token, id };
}

/** Compute the SHA‑256 hash of a token and return the first 32 hex characters. */
export async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const fullHex = bytesToHex(hashBuffer);
  // Truncate to 32 characters (16 bytes) for the wallet id
  return fullHex.slice(0, 32);
}

/** Create a human‑readable recovery code from a token.
 *  Format: "RC-xxxx-xxxx-..." where groups are 4 hex characters.
 */
export function recoveryCode(token: string): string {
  const groups = token.match(/.{1,4}/g) ?? [token];
  return `R-${groups.join("-")}`;
}

/** Parse a recovery code back to the original token.
 *  Strips any non‑hex characters, validates length, and returns the token.
 *  Throws if the code is malformed.
 */
export function parseRecoveryCode(code: string): string {
  const hex = code.replace(/[^0-9a-f]/gi, "").toLowerCase();
  if (hex.length < 32) {
    throw new Error("Invalid recovery code");
  }
  return hex;
}
