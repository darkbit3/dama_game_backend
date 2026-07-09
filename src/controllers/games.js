import * as gamesService from '../services/games.js';
import * as playersService from '../services/players.js';
import { ok, fail } from '../utils/response.js';
import db from '../db/database.js';
import { normalizePhone } from '../utils/phone.js';

export const listGames = async (req, res, next) => {
  try {
    const { status, playerId, limit, offset } = req.query;
    const games = gamesService.getAll({ status, playerId, limit, offset });
    ok(res, games);
  } catch (err) {
    next(err);
  }
};

export const getGame = async (req, res, next) => {
  try {
    const game = gamesService.getById(req.params.id);
    if (!game) return fail(res, 'Game not found', 404);
    ok(res, game);
  } catch (err) {
    next(err);
  }
};

export const createGame = async (req, res, next) => {
  try {
    const { mode, player1Id, player2Id, betAmount } = req.body;
    const game = gamesService.create({ mode, player1Id, player2Id, betAmount });
    ok(res, game, 201);
  } catch (err) {
    next(err);
  }
};

export const finishGame = async (req, res, next) => {
  try {
    const existing = gamesService.getById(req.params.id);
    if (!existing) return fail(res, 'Game not found', 404);
    const { winnerId, durationSec, moveCount } = req.body;
    const game = gamesService.finish(req.params.id, { winnerId, durationSec, moveCount });
    ok(res, game);
  } catch (err) {
    next(err);
  }
};

export const addMove = async (req, res, next) => {
  try {
    const existing = gamesService.getById(req.params.id);
    if (!existing) return fail(res, 'Game not found', 404);
    const { playerId, moveData } = req.body;
    const move = gamesService.addMove(req.params.id, playerId, moveData);
    ok(res, move, 201);
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/games/finish-local
 * Records a completed AI or local game with a unique ID.
 * Body: { mode, player1Id, player2Id?, winnerId?, result, durationSec, moveCount }
 *   result: 'win' | 'loss' | 'draw'  (from player1's perspective)
 */
export const finishLocal = async (req, res, next) => {
  try {
    const { mode, player1Id, player2Id, winnerId, result, durationSec = 0, moveCount = 0 } = req.body;

    if (!player1Id || !result) return fail(res, 'player1Id and result required', 400);
    if (!['win','loss','draw'].includes(result)) return fail(res, 'result must be win, loss, or draw', 400);

    // Create the game record
    const game = gamesService.create({ mode: mode || 'ai', player1Id, player2Id: player2Id || null, betAmount: 0 });

    // Finish it immediately
    gamesService.finish(game.id, { winnerId: winnerId || null, durationSec, moveCount });

    // Record result for player1
    playersService.recordResult(player1Id, result);

    // Record inverse result for player2 only if they are a real DB player
    if (player2Id) {
      // Verify player2 actually exists in DB (not an AI bot ID)
      const p2 = playersService.getById(player2Id);
      if (p2) {
        const p2Result = result === 'win' ? 'loss' : result === 'loss' ? 'win' : 'draw';
        playersService.recordResult(player2Id, p2Result);
      }
    }

    const finished = gamesService.getById(game.id);
    ok(res, finished, 201);
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/games/start-bet
 * Body: { gameId, playerId, phone, betAmount, mode, player2Id? }
 *
 * Steps:
 *  1. Upsert the game row in `games` (using the client-supplied gameId)
 *  2. Resolve the player's token row → backend_url
 *  3. POST {backend_url}/dama with action:'deduct'
 *  4. Write a row to game_bet_log (request + response + status)
 *  5. Return { game, betLog } to the frontend so it can display the audit trail
 */
export const startBet = async (req, res, next) => {
  try {
    const {
      gameId,
      playerId,
      phone,
      betAmount = 0,
      mode = 'pvp',
      player2Id = null,
    } = req.body;

    if (!gameId)   return fail(res, 'gameId is required',   400);
    if (!playerId) return fail(res, 'playerId is required', 400);
    if (!phone)    return fail(res, 'phone is required',    400);

    // ── 1. Upsert game record ───────────────────────────────────────────────
    let game = db.prepare('SELECT * FROM games WHERE id = ?').get(gameId);
    if (!game) {
      db.prepare(`
        INSERT INTO games (id, mode, player1_id, player2_id, bet_amount)
        VALUES (?, ?, ?, ?, ?)
      `).run(gameId, mode, playerId, player2Id, betAmount);
      game = db.prepare('SELECT * FROM games WHERE id = ?').get(gameId);
    }

    // If betAmount is 0, skip callback but still return success
    if (betAmount <= 0) {
      return ok(res, { game, betLog: null, skipped: true, reason: 'no bet amount' });
    }

    // ── 2. Resolve token_id → backend_url for this player ──────────────────
    const playerRow  = db.prepare('SELECT token_id, name FROM players WHERE id = ?').get(playerId);
    const tokenId    = playerRow?.token_id || null;
    const tokenRow   = tokenId
      ? db.prepare('SELECT backend_url FROM api_tokens WHERE id = ? AND is_active = 1').get(tokenId)
      : null;
    const backendUrl = tokenRow?.backend_url || null;
    const normPhone  = normalizePhone(phone);

    // ── 3. Build request body ───────────────────────────────────────────────
    const requestBody = {
      action:   'deduct',
      phone:    normPhone,
      username: playerRow?.name || 'Player',
      playerId,
      amount:   betAmount,
      gameId,
    };

    // ── 4. Call token backend ───────────────────────────────────────────────
    let responseBody = null;
    let status       = 'pending';
    let errorMsg     = null;

    if (backendUrl) {
      const callUrl = backendUrl.replace(/\/$/, '') + '/dama';
      try {
        const resp = await fetch(callUrl, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(requestBody),
          signal:  AbortSignal.timeout(6000),
        });
        const text = await resp.text();
        try { responseBody = JSON.parse(text); } catch { responseBody = { raw: text }; }
        status = resp.ok ? 'success' : 'failed';
        if (!resp.ok) errorMsg = `HTTP ${resp.status}`;
      } catch (fetchErr) {
        status   = 'error';
        errorMsg = fetchErr.message;
      }
    } else {
      status   = 'no_backend';
      errorMsg = 'No backend_url configured for this token';
    }

    // ── 5. Write to game_bet_log ─────────────────────────────────────────────
    db.prepare(`
      INSERT INTO game_bet_log
        (game_id, player_id, phone, bet_amount, backend_url, request_body, response_body, status, error)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      gameId,
      playerId,
      normPhone,
      betAmount,
      backendUrl || null,
      JSON.stringify(requestBody),
      responseBody ? JSON.stringify(responseBody) : null,
      status,
      errorMsg || null,
    );

    const betLog = db.prepare(
      'SELECT * FROM game_bet_log WHERE game_id = ? AND player_id = ? ORDER BY id DESC LIMIT 1'
    ).get(gameId, playerId);

    return ok(res, {
      game,
      betLog: {
        ...betLog,
        requestBody,
        responseBody,
        backendUrl: backendUrl || null,
        status,
        error: errorMsg || null,
      },
    }, 201);
  } catch (err) {
    next(err);
  }
};
