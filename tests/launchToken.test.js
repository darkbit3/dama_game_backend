// tests/launchToken.test.js
//
// Unit tests for src/utils/launchToken.js
// No DB, no network — pure JWT verification logic.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import jwt from 'jsonwebtoken';

const SECRET  = 'test-launch-secret-for-vitest';
const OTHER   = 'wrong-secret';

// Set the env var before importing the module so the module picks it up
beforeAll(() => {
  process.env.DAMA_LAUNCH_SECRET = SECRET;
});

afterAll(() => {
  delete process.env.DAMA_LAUNCH_SECRET;
});

// Dynamic import so the env var is set first
const { verifyLaunchToken } = await import('../src/utils/launchToken.js');

// ── helpers ──────────────────────────────────────────────────────────────────

function mint(claims, opts = {}) {
  return jwt.sign(claims, SECRET, { expiresIn: '5m', ...opts });
}

const VALID_CLAIMS = { phone: '251911223344', username: 'Abebe', balance: 500 };

// ─────────────────────────────────────────────────────────────────────────────

describe('verifyLaunchToken — valid tokens', () => {
  it('returns phone, username, balance for a well-formed token', () => {
    const token  = mint(VALID_CLAIMS);
    const result = verifyLaunchToken(token);
    expect(result.phone).toBe('251911223344');
    expect(result.username).toBe('Abebe');
    expect(result.balance).toBe(500);
  });

  it('includes gameId when present', () => {
    const token  = mint({ ...VALID_CLAIMS, gameId: 'game_abc' });
    const result = verifyLaunchToken(token);
    expect(result.gameId).toBe('game_abc');
  });

  it('returns null gameId when absent', () => {
    const token  = mint(VALID_CLAIMS);
    const result = verifyLaunchToken(token);
    expect(result.gameId).toBeNull();
  });

  it('accepts balance: 0 as a valid numeric balance', () => {
    const token  = mint({ ...VALID_CLAIMS, balance: 0 });
    const result = verifyLaunchToken(token);
    expect(result.balance).toBe(0);
  });

  it('returns null balance when balance is missing from claims', () => {
    const { balance: _, ...noBal } = VALID_CLAIMS;
    const token  = mint(noBal);
    const result = verifyLaunchToken(token);
    expect(result.balance).toBeNull();
  });
});

describe('verifyLaunchToken — invalid / missing tokens', () => {
  it('returns null for undefined', () => {
    expect(verifyLaunchToken(undefined)).toBeNull();
  });

  it('returns null for null', () => {
    expect(verifyLaunchToken(null)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(verifyLaunchToken('')).toBeNull();
  });

  it('returns null for whitespace-only string', () => {
    expect(verifyLaunchToken('   ')).toBeNull();
  });

  it('throws JsonWebTokenError for a token signed with the wrong secret', () => {
    const token = jwt.sign(VALID_CLAIMS, OTHER, { expiresIn: '5m' });
    expect(() => verifyLaunchToken(token)).toThrow(jwt.JsonWebTokenError);
  });

  it('throws JsonWebTokenError for a completely garbage string', () => {
    expect(() => verifyLaunchToken('not.a.jwt')).toThrow(jwt.JsonWebTokenError);
  });

  it('throws TokenExpiredError for an already-expired token', () => {
    const token = mint(VALID_CLAIMS, { expiresIn: '-1s' });
    expect(() => verifyLaunchToken(token)).toThrow(jwt.TokenExpiredError);
  });

  it('returns null when phone claim is missing', () => {
    const { phone: _, ...noPhone } = VALID_CLAIMS;
    const token  = mint(noPhone);
    const result = verifyLaunchToken(token);
    expect(result).toBeNull();
  });

  it('returns null when username claim is missing', () => {
    const { username: _, ...noUser } = VALID_CLAIMS;
    const token  = mint(noUser);
    const result = verifyLaunchToken(token);
    expect(result).toBeNull();
  });
});

describe('verifyLaunchToken — missing server secret', () => {
  it('throws when DAMA_LAUNCH_SECRET is not set', async () => {
    // Temporarily unset the var and re-import a fresh module instance
    const savedSecret = process.env.DAMA_LAUNCH_SECRET;
    delete process.env.DAMA_LAUNCH_SECRET;

    // Use a direct jwt.verify to simulate what the module would do without secret
    // (we can't easily re-import due to ESM module caching, so we test the guard
    // logic by calling the exported function after patching the env — the module
    // reads process.env.DAMA_LAUNCH_SECRET at call time, not module load time,
    // so unsetting it mid-test exercises the real guard)
    const token = mint(VALID_CLAIMS);
    expect(() => verifyLaunchToken(token)).toThrow('DAMA_LAUNCH_SECRET is not configured');

    // Restore
    process.env.DAMA_LAUNCH_SECRET = savedSecret;
  });
});
