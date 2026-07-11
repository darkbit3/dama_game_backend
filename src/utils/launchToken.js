// backend/src/utils/launchToken.js
//
// Server-side verification of the short-lived launch token that system-backend
// mints and passes to the frontend as a URL parameter.
//
// The token is a signed JWT containing: { phone, username, balance, gameId? }
// signed with DAMA_LAUNCH_SECRET — a shared secret known only to system-backend
// and dama-backend.  The browser never sees the secret or the raw phone number;
// it only carries an opaque token string that it forwards to this backend.
//
// Usage:
//   import { verifyLaunchToken } from '../utils/launchToken.js';
//   const claims = verifyLaunchToken(launchParam);
//   // claims === null  →  missing / malformed token
//   // throws TokenExpiredError  →  expired (treat as 401)
//   // returns { phone, username, balance, gameId }  →  valid

import jwt from 'jsonwebtoken';

/**
 * Verify a launch JWT and extract its claims.
 *
 * @param {string|undefined|null} launchToken  — raw token string from the request
 * @returns {{ phone: string, username: string, balance: number, gameId?: string }}
 *
 * @throws {jwt.TokenExpiredError}   when the token signature is valid but expired
 * @throws {jwt.JsonWebTokenError}   when the token is malformed / signature mismatch
 * @throws {Error}                   when DAMA_LAUNCH_SECRET is not configured
 */
export function verifyLaunchToken(launchToken) {
  // Read at call time so the server fails loudly on the first real request if
  // the env var was never set, rather than silently at module load.
  const secret = process.env.DAMA_LAUNCH_SECRET;

  // ── DIAGNOSTIC (remove after confirming fix) ────────────────────────────
  const tokenPreview = (launchToken && typeof launchToken === 'string')
    ? launchToken.slice(0, 20) + '…'
    : String(launchToken);
  console.log('[launchToken] received launch (first 20 chars):', tokenPreview);
  console.log('[launchToken] DAMA_LAUNCH_SECRET set:', !!secret);
  // ── END DIAGNOSTIC ───────────────────────────────────────────────────────

  if (!secret) {
    throw new Error('DAMA_LAUNCH_SECRET is not configured on this server');
  }

  if (!launchToken || typeof launchToken !== 'string' || !launchToken.trim()) {
    return null;
  }

  try {
    // jwt.verify throws on any failure — callers catch and map to HTTP status
    const payload = jwt.verify(launchToken.trim(), secret);

    // Sanity-check required claims — a token missing phone/username is useless
    if (!payload.phone || !payload.username) {
      // ── DIAGNOSTIC ───────────────────────────────────────────────────────
      console.log('[launchToken] verify OK but missing claims — phone:', !!payload.phone, 'username:', !!payload.username);
      // ── END DIAGNOSTIC ───────────────────────────────────────────────────
      return null;
    }

    // ── DIAGNOSTIC ─────────────────────────────────────────────────────────
    console.log('[launchToken] verify OK — username:', payload.username);
    // ── END DIAGNOSTIC ─────────────────────────────────────────────────────

    return {
      phone:    payload.phone,
      username: payload.username,
      balance:  typeof payload.balance === 'number' ? payload.balance : null,
      gameId:   payload.gameId  || null,
    };

  } catch (err) {
    // ── DIAGNOSTIC: log the EXACT error name so we know which failure this is
    // "invalid signature" → secret mismatch between system-backend and here
    // "jwt expired"       → token TTL exceeded before request arrived
    // "jwt malformed"     → launch value is not a valid JWT string at all
    const tokenLength = (typeof launchToken === 'string') ? launchToken.length : 0;
    console.log('[launchToken] jwt.verify FAILED:', err.name, '|', err.message, '| tokenLength:', tokenLength);
    // ── END DIAGNOSTIC ─────────────────────────────────────────────────────
    throw err; // re-throw so balance.js maps it to the correct 401 message
  }
}
