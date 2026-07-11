// backend/src/utils/launchToken.js
//
// Server-side verification of the short-lived launch token that system-backend
// mints and passes to the frontend as a URL parameter.
//
// The browser never sees the raw phone number; it only carries an opaque token
// string that it forwards to this backend. This backend asks system-backend to
// verify the token and return the claims.
//
// Usage:
//   import { verifyLaunchToken } from '../utils/launchToken.js';
//   const claims = await verifyLaunchToken(launchParam);
//   // claims === null  →  missing / malformed token
//   // throws Error     →  expired / invalid / verification failure (treat as 401)
//   // returns { phone, username, balance, gameId }  →  valid

/**
 * Verify a launch token by delegating to system-backend.
 *
 * @param {string|undefined|null} launchToken  — raw token string from the request
 * @returns {Promise<{ phone: string, username: string, balance: number, gameId?: string } | null>}
 *
 * @throws {Error} when the system-backend URL is not configured or verification fails
 */
export async function verifyLaunchToken(launchToken) {
  if (!launchToken || typeof launchToken !== 'string' || !launchToken.trim()) {
    return null;
  }

  const systemBackendUrl = process.env.SYSTEM_BACKEND_URL?.trim();
  if (!systemBackendUrl) {
    throw new Error('SYSTEM_BACKEND_URL is not configured');
  }

  const verifyUrl = `${systemBackendUrl.replace(/\/$/, '')}/api/verify-launch-token`;

  try {
    const response = await fetch(verifyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ launch: launchToken.trim() }),
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(`Launch token verification failed with status ${response.status}`);
    }

    if (!payload || payload.valid !== true) {
      return null;
    }

    if (!payload.phone || !payload.username) {
      return null;
    }

    return {
      phone: payload.phone,
      username: payload.username,
      balance: typeof payload.balance === 'number' ? payload.balance : null,
      gameId: payload.gameId || null,
    };
  } catch (err) {
    if (err instanceof Error) {
      throw err;
    }

    throw new Error('Launch token verification failed');
  }
}
