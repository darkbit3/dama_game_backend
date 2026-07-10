// backend/src/services/ownerCallback.js
//
// All calls go to a single endpoint: POST {backend_url}/dama
// with an `action` field:
//
//   action: 'get_balance'  → { action, phone, username }
//                            expects response: { balance: number }
//
//   action: 'deduct'       → { action, phone, username, playerId, amount, gameId }
//   action: 'credit'       → { action, phone, username, playerId, amount, fee, gameId }
//   action: 'loss'         → { action, phone, username, playerId, amount, fee, gameId }
//   action: 'refund'       → { action, phone, username, playerId, amount, fee, gameId }
//
//   action: 'owner_fee'    → { action, amount, type, gameId, humanPlayerId? }
//                            Notifies owner backend of their commission/profit/loss.
//                            amount > 0 = owner earns, amount < 0 = owner pays out.
//                            type: 'pvp_win_fee' | 'pvp_draw_fee' |
//                                  'ai_win_fee'  | 'ai_profit' |
//                                  'ai_loss'     | 'ai_draw_fee'
//
// Failures are logged but never crash the game flow.

import db from '../db/database.js';
import { logger } from '../utils/logger.js';

/**
 * Fetch the full token row (backend_url, etc.) for a given token string.
 */
export function getTokenRow(tokenStr) {
  if (!tokenStr) return null;
  return db.prepare('SELECT * FROM api_tokens WHERE token = ? AND is_active = 1').get(tokenStr) || null;
}

/**
 * Fetch backend_url AND the raw token string for a given token_id.
 * Returns { backendUrl, tokenStr } or null values if not found.
 */
function getBackendInfo(tokenId) {
  if (!tokenId) return { backendUrl: null, tokenStr: null };
  const row = db.prepare('SELECT backend_url, token FROM api_tokens WHERE id = ?').get(tokenId);
  return {
    backendUrl: row?.backend_url || null,
    tokenStr:   row?.token       || null,
  };
}

/**
 * Get token_id for a player.
 */
export function getTokenIdForPlayer(playerId) {
  const row = db.prepare('SELECT token_id FROM players WHERE id = ?').get(playerId);
  return row?.token_id || null;
}

/**
 * Get phone for a player.
 */
function getPlayerPhone(playerId) {
  const row = db.prepare('SELECT phone FROM players WHERE id = ?').get(playerId);
  return row?.phone || null;
}

/**
 * Get name for a player.
 */
function getPlayerName(playerId) {
  const row = db.prepare('SELECT name FROM players WHERE id = ?').get(playerId);
  return row?.name || null;
}

/**
 * POST to the owner's backend_url/dama with a JSON payload.
 * Returns parsed JSON response or null on failure.
 *
 * @param {string}  backendUrl  full base URL e.g. https://owner.com/api
 * @param {object}  body
 */
export async function callDamaEndpoint(backendUrl, body) {
  if (!backendUrl) return null;
  const url = backendUrl.replace(/\/$/, '') + '/dama';
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      logger.warn(`ownerCallback ${url} responded ${res.status}`);
      return null;
    }
    logger.debug(`ownerCallback ${url} OK`);
    return await res.json();
  } catch (err) {
    logger.warn(`ownerCallback ${url} failed: ${err.message}`);
    return null;
  }
}

import { normalizePhone } from '../utils/phone.js';

/**
 * Fetch real balance from owner's backend for a player.
 * Called on login to get the live balance.
 */
export async function fetchOwnerBalance(tokenStr, phone, username) {
  const tokenRow = getTokenRow(tokenStr);
  if (!tokenRow?.backend_url) return null;

  const result = await callDamaEndpoint(tokenRow.backend_url, {
    action:   'get_balance',
    token:    tokenStr,            // authenticate with the Dama API token
    phone:    normalizePhone(phone),
    username,
  });

  if (!result) return null;

  let balance = null;
  if (typeof result.balance === 'number') {
    balance = result.balance;
  } else if (typeof result.balance === 'string') {
    const n = parseInt(result.balance, 10);
    balance = isNaN(n) ? null : n;
  }

  return {
    balance,
    username: result.username || null,
  };
}

/**
 * Notify owner: bets deducted (called when a match starts).
 * Normalizes phone numbers before sending.
 */
export async function notifyBetPlaced(tokenId, { player1Id, player2Id, betAmount, gameId }) {
  const { backendUrl, tokenStr } = getBackendInfo(tokenId);
  if (!backendUrl) return;

  await Promise.allSettled([
    callDamaEndpoint(backendUrl, {
      action:   'deduct',
      token:    tokenStr,
      playerId: player1Id,
      phone:    normalizePhone(getPlayerPhone(player1Id)),
      username: getPlayerName(player1Id),
      amount:   betAmount,
      gameId,
    }),
    callDamaEndpoint(backendUrl, {
      action:   'deduct',
      token:    tokenStr,
      playerId: player2Id,
      phone:    normalizePhone(getPlayerPhone(player2Id)),
      username: getPlayerName(player2Id),
      amount:   betAmount,
      gameId,
    }),
  ]);
}

/**
 * Notify owner: winner credited.
 * Normalizes phone numbers before sending.
 */
export async function notifyWinPayout(tokenId, { winnerId, loserId, winnerPayout, fee, gameId }) {
  const { backendUrl, tokenStr } = getBackendInfo(tokenId);
  if (!backendUrl) return;

  await Promise.allSettled([
    callDamaEndpoint(backendUrl, {
      action:   'credit',
      token:    tokenStr,
      playerId: winnerId,
      phone:    normalizePhone(getPlayerPhone(winnerId)),
      username: getPlayerName(winnerId),
      amount:   winnerPayout,
      fee,
      gameId,
    }),
    callDamaEndpoint(backendUrl, {
      action:   'loss',
      token:    tokenStr,
      playerId: loserId,
      phone:    normalizePhone(getPlayerPhone(loserId)),
      username: getPlayerName(loserId),
      amount:   0,
      fee,
      gameId,
    }),
  ]);
}

/**
 * Notify owner: draw — each player refunded.
 * Normalizes phone numbers before sending.
 */
export async function notifyDrawRefund(tokenId, { player1Id, player2Id, refund, fee, gameId }) {
  const { backendUrl, tokenStr } = getBackendInfo(tokenId);
  if (!backendUrl) return;

  await Promise.allSettled([
    callDamaEndpoint(backendUrl, {
      action:   'refund',
      token:    tokenStr,
      playerId: player1Id,
      phone:    normalizePhone(getPlayerPhone(player1Id)),
      username: getPlayerName(player1Id),
      amount:   refund,
      fee,
      gameId,
    }),
    callDamaEndpoint(backendUrl, {
      action:   'refund',
      token:    tokenStr,
      playerId: player2Id,
      phone:    normalizePhone(getPlayerPhone(player2Id)),
      username: getPlayerName(player2Id),
      amount:   refund,
      fee,
      gameId,
    }),
  ]);
}

/**
 * Notify owner backend of their commission / profit / loss for a game.
 *
 * Body sent to {backend_url}/dama:
 * {
 *   action:         'owner_fee',
 *   token:          string,     // the Dama API token string — authenticates this call
 *   amount:         number,     // positive = owner earns, negative = owner pays out
 *   type:           string,
 *   gameId:         string,
 *   humanPlayerId?: string
 * }
 */
export async function notifyOwnerFee(tokenId, { amount, type, gameId, humanPlayerId }) {
  const { backendUrl, tokenStr } = getBackendInfo(tokenId);
  if (!backendUrl) return;

  await callDamaEndpoint(backendUrl, {
    action:  'owner_fee',
    token:   tokenStr,
    amount,
    type,
    gameId,
    ...(humanPlayerId ? { humanPlayerId } : {}),
  });
}
