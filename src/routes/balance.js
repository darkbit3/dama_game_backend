// backend/src/routes/balance.js
// POST /api/player-balance
// Called by the frontend on load to fetch the real balance
// from the token owner's external backend.

import { Router } from 'express';
import { body } from 'express-validator';
import { validate } from '../middleware/validate.js';
import { fetchOwnerBalance } from '../services/ownerCallback.js';
import { ok, fail } from '../utils/response.js';

const router = Router();

/**
 * POST /api/player-balance
 * Body: { token, phone, username }
 * Returns: { balance: number }
 */
router.post('/',
  [
    body('token').notEmpty().withMessage('token is required'),
    body('phone').notEmpty().withMessage('phone is required'),
    body('username').notEmpty().withMessage('username is required'),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { token, phone, username } = req.body;
      const balance = await fetchOwnerBalance(token, phone, username);
      if (balance === null) {
        // Owner backend not reachable or not configured — return null so
        // frontend falls back to URL balance param
        return ok(res, { balance: null });
      }
      ok(res, { balance });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
