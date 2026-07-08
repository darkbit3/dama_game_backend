// backend/src/services/settlement.js
// Handles all game financial settlement:
//   - Service fee deduction (10% win, 5% draw)
//   - Winner payout
//   - Draw refund
//   - Token owner balance credit + external backend callback

import db from '../db/database.js';
import * as playersService from './players.js';
import { notifyWinPayout, notifyDrawRefund } from './ownerCallback.js';

const WIN_FEE_PCT  = 0.10;  // 10% of total pot on win
const DRAW_FEE_PCT = 0.05;  // 5% of each player's bet on draw

/**
 * Ensure the token_owner_balances table exists.
 * Called once at startup via migrations.
 */
export function ensureOwnerBalanceTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS token_owner_balances (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      token_id   INTEGER NOT NULL UNIQUE,
      balance    INTEGER NOT NULL DEFAULT 0,
      total_earned INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      FOREIGN KEY (token_id) REFERENCES api_tokens(id)
    );

    CREATE TABLE IF NOT EXISTS token_owner_transactions (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      token_id   INTEGER NOT NULL,
      game_id    TEXT,
      type       TEXT NOT NULL,
      amount     INTEGER NOT NULL,
      note       TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      FOREIGN KEY (token_id) REFERENCES api_tokens(id)
    );
  `);
}

/**
 * Credit the token owner for a fee.
 * Looks up the token_id from one of the players in the game.
 */
function creditOwner(tokenId, gameId, amount, note) {
  if (!tokenId || amount <= 0) return;

  // Upsert owner balance
  db.prepare(`
    INSERT INTO token_owner_balances (token_id, balance, total_earned)
    VALUES (?, ?, ?)
    ON CONFLICT(token_id) DO UPDATE SET
      balance      = balance + excluded.balance,
      total_earned = total_earned + excluded.total_earned,
      updated_at   = unixepoch()
  `).run(tokenId, amount, amount);

  // Log transaction
  db.prepare(`
    INSERT INTO token_owner_transactions (token_id, game_id, type, amount, note)
    VALUES (?, ?, 'fee', ?, ?)
  `).run(tokenId, gameId || null, amount, note || null);
}

/**
 * Get the token_id for a game (from one of its players).
 */
function getGameTokenId(game) {
  const p1 = db.prepare('SELECT token_id FROM players WHERE id = ?').get(game.player1_id);
  return p1?.token_id || null;
}

/**
 * Settle a WIN game.
 * - Bets already deducted when challenge was accepted.
 * - Winner gets back: pot * (1 - WIN_FEE_PCT)
 * - Owner gets: pot * WIN_FEE_PCT
 *
 * @param {string} winnerId
 * @param {string} loserId
 * @param {object} game  — DB game row
 */
export function settleWin(winnerId, loserId, game) {
  const bet = game.bet_amount || 0;
  if (bet <= 0) {
    // No bet — just record results
    playersService.recordResult(winnerId, 'win');
    playersService.recordResult(loserId,  'loss');
    return { winnerPayout: 0, fee: 0 };
  }

  const pot         = bet * 2;
  const fee         = Math.round(pot * WIN_FEE_PCT);
  const winnerPayout = pot - fee;

  // Credit winner
  playersService.adjustBalance(winnerId, winnerPayout);
  // Record results
  playersService.recordResult(winnerId, 'win');
  playersService.recordResult(loserId,  'loss');

  // Credit owner
  const tokenId = getGameTokenId(game);
  creditOwner(tokenId, game.id, fee, `10% win fee — game ${game.id}`);

  // Fire-and-forget: notify token owner's external backend
  notifyWinPayout(tokenId, { winnerId, loserId, winnerPayout, fee, gameId: game.id }).catch(() => {});

  return { winnerPayout, fee, tokenId };
}

/**
 * Settle a DRAW game.
 * - Each player gets back: bet * (1 - DRAW_FEE_PCT)
 * - Owner gets: bet * DRAW_FEE_PCT * 2
 *
 * @param {object} game  — DB game row
 */
export function settleDraw(game) {
  const bet = game.bet_amount || 0;
  if (bet <= 0) {
    playersService.recordResult(game.player1_id, 'draw');
    playersService.recordResult(game.player2_id, 'draw');
    return { refund: 0, fee: 0 };
  }

  const feeEach  = Math.round(bet * DRAW_FEE_PCT);
  const refund   = bet - feeEach;
  const totalFee = feeEach * 2;

  // Refund both players
  playersService.adjustBalance(game.player1_id, refund);
  playersService.adjustBalance(game.player2_id, refund);
  // Record results
  playersService.recordResult(game.player1_id, 'draw');
  playersService.recordResult(game.player2_id, 'draw');

  // Credit owner
  const tokenId = getGameTokenId(game);
  creditOwner(tokenId, game.id, totalFee, `5% draw fee — game ${game.id}`);

  // Fire-and-forget: notify token owner's external backend
  notifyDrawRefund(tokenId, { player1Id: game.player1_id, player2Id: game.player2_id, refund, fee: totalFee, gameId: game.id }).catch(() => {});

  return { refund, fee: totalFee, tokenId };
}

/**
 * Get owner balance for a token.
 */
export function getOwnerBalance(tokenId) {
  return db.prepare('SELECT * FROM token_owner_balances WHERE token_id = ?').get(tokenId);
}

/**
 * Get all owner balances with token info.
 */
export function getAllOwnerBalances() {
  return db.prepare(`
    SELECT t.id as token_id, t.key_name, t.owner, t.token,
           COALESCE(ob.balance, 0)       as balance,
           COALESCE(ob.total_earned, 0)  as total_earned,
           ob.updated_at
    FROM api_tokens t
    LEFT JOIN token_owner_balances ob ON ob.token_id = t.id
    ORDER BY COALESCE(ob.total_earned, 0) DESC
  `).all();
}
