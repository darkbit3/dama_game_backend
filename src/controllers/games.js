import * as gamesService from '../services/games.js';
import * as playersService from '../services/players.js';
import { ok, fail } from '../utils/response.js';

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
