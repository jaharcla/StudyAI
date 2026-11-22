import { describe, it, expect } from 'vitest';
import {
  newWalletToken,
  hashToken,
  recoveryCode,
  parseRecoveryCode,
} from '../src/token.js';

describe('Token module', () => {
  it('generates token and id of correct format', async () => {
    const { token, id } = await newWalletToken();
    expect(token).toMatch(/^[0-9a-f]{32,}$/i);
    expect(id).toMatch(/^[0-9a-f]{32}$/i);
  });

  it('hashToken is deterministic and distinct for different tokens', async () => {
    const { token } = await newWalletToken();
    const h1 = await hashToken(token);
    const h2 = await hashToken(token);
    expect(h1).toBe(h2);
    const { token: token2 } = await newWalletToken();
    const h3 = await hashToken(token2);
    expect(h3).not.toBe(h1);
  });

  it('recovery code round‑trips correctly', async () => {
    const { token } = await newWalletToken();
    const code = recoveryCode(token);
    const parsed = parseRecoveryCode(code);
    expect(parsed).toBe(token);
  });

  it('throws on malformed recovery code', () => {
    expect(() => parseRecoveryCode('invalid-code')).toThrow();
  });
});
