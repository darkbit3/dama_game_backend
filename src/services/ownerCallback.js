// backend/src/services/ownerCallback.js
//
// Calls the token owner's external backend URL when:
//   - BET is placed   → POST /dama/bet    { playerId, amount, gameId, type:'deduct' }
//   - WIN settled     → POST /dama/win    { playerId, amount, gameId, type:'credit' }
//   - DRAW settled    → POST /dama/draw   { playerId, amount, gameId, type:'refund' }
//
// The owner backend can do whatever it wants (update their own wallet, log, etc).
// Failures are logged but never crash the game flow.

import db from '../db/database.js';
import { logger } from '../utils/logger.js';

/**
 * Fetch backend_url for a given token_id.
 */
function getBackendUrl(tokenId) {
  if (!tokenId) return null;
  const row = db.prepare('SELECT backend_url FROM api_tokens WHERE id = ?').get(tokenId);
  return row?.backend_url || null;
}

/**
 * Get token_id for a player.
 */
export function getTokenIdForPlayer(playerId) {
  const row = db.prepare('SELECT token_id FROM players WHERE id = ?').get(playerId);
  return row?.token_id || null;
}

/**
 * POST to the owner's backend_url with a JSON payload.
 * Fire-and-forget — never throws.
 *
 * @param {number|null} tokenId
 * @param {string}      path    e.g. '/dama/bet'
 * @param {object}      body
 */
export async function callOwnerBackend(tokenId, path, body) {
  const baseUrl = getBackendUrl(tokenId);
  if (!baseUrl) return;            // no URL configured — skip silently

  const url = baseUrl.replace(/\/$/, '') + path;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),   // 5-second timeout
    });
    if (!res.ok) {
      logger.warn(`ownerCallback ${url} responded ${res.status}`);
    } else {
      logger.debug(`ownerCallback ${url} OK`);
    }
  } catch (err) {
    logger.warn(`ownerCallback ${url} failed: ${err.message}`);
  }
}

/**
 * Notify owner: bets deducted (called when a match starts).
 */
export async function notifyBetPlaced(tokenId, { player1Id, player2Id, betAmount, gameId }) {
  // Fire both notifications concurrently
  await Promise.allSettled([
    callOwnerBackend(tokenId, '/dama/bet', {
      type:     'deduct',
      playerId: player1Id,
      amount:   betAmount,
      gameId,
    }),
    callOwnerBackend(tokenId, '/dama/bet', {
      type:     'deduct',
      playerId: player2Id,
      amount:   betAmount,
      gameId,
    }),
  ]);
}

/**
 * Notify owner: winner credited.
 */
export async function notifyWinPayout(tokenId, { winnerId, loserId, winnerPayout, fee, gameId }) {
  await Promise.allSettled([
    callOwnerBackend(tokenId, '/dama/win', {
      type:     'credit',
      playerId: winnerId,
      amount:   winnerPayout,
      fee,
      gameId,
    }),
    callOwnerBackend(tokenId, '/dama/win', {
      type:     'loss',
      playerId: loserId,
      amount:   0,
      fee,
      gameId,
    }),
  ]);
}

/**
 * Notify owner: draw — each player refunded.
 */
export async function notifyDrawRefund(tokenId, { player1Id, player2Id, refund, fee, gameId }) {
  await Promise.allSettled([
    callOwnerBackend(tokenId, '/dama/draw', {
      type:     'refund',
      playerId: player1Id,
      amount:   refund,
      fee,
      gameId,
    }),
    callOwnerBackend(tokenId, '/dama/draw', {
      type:     'refund',
      playerId: player2Id,
      amount:   refund,
      fee,
      gameId,
    }),
  ]);
}
