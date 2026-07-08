// backend/src/routes/games.js
import { Router } from 'express';
import { body } from 'express-validator';
import { validate } from '../middleware/validate.js';
import { requireTokenOrAdmin } from '../middleware/requireToken.js';
import * as ctrl from '../controllers/games.js';

const router = Router();

// All game routes require API token or admin JWT
router.use(requireTokenOrAdmin);

// GET /api/games
router.get('/', ctrl.listGames);

// GET /api/games/:id
router.get('/:id', ctrl.getGame);

// POST /api/games
router.post('/',
  [
    body('mode').isIn(['ai', 'pvp']).withMessage("mode must be 'ai' or 'pvp'"),
    body('player1Id').notEmpty().withMessage('player1Id is required'),
    body('player2Id').optional().isString(),
    body('betAmount').optional().isInt({ min: 0 }),
  ],
  validate,
  ctrl.createGame
);

// PATCH /api/games/:id/finish
router.patch('/:id/finish',
  [
    body('durationSec').isInt({ min: 0 }).withMessage('durationSec must be a non-negative integer'),
    body('moveCount').isInt({ min: 0 }).withMessage('moveCount must be a non-negative integer'),
    body('winnerId').optional().isString(),
  ],
  validate,
  ctrl.finishGame
);

// POST /api/games/:id/moves
router.post('/:id/moves',
  [
    body('playerId').notEmpty().withMessage('playerId is required'),
    body('moveData').isObject().withMessage('moveData must be an object'),
    body('moveData.from').isObject().withMessage('moveData.from is required'),
    body('moveData.to').isObject().withMessage('moveData.to is required'),
  ],
  validate,
  ctrl.addMove
);

// POST /api/games/finish-local — save a completed AI or local game
router.post('/finish-local',
  [
    body('player1Id').notEmpty().withMessage('player1Id is required'),
    body('result').isIn(['win','loss','draw']).withMessage('result must be win, loss, or draw'),
    body('mode').optional().isIn(['ai','pvp']),
    body('player2Id').optional().isString(),
    body('winnerId').optional().isString(),
    body('durationSec').optional().isInt({ min: 0 }),
    body('moveCount').optional().isInt({ min: 0 }),
  ],
  validate,
  ctrl.finishLocal
);

export default router;
