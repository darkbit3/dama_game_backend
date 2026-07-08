// backend/src/routes/balance.js
// POST /api/player-balance
//
// Called by the frontend immediately on load.
// Looks up the token's backend_url, then calls:
//   POST {backend_url}/dama  { action:'get_balance', phone, username }
// and returns the balance back to the frontend.
//
// No auth middleware — the token is validated inside fetchOwnerBalance.

import { Router } from 'express';
import { body } from 'express-validator';
import { validate } from '../middleware/validate.js';
import { fetchOwnerBalance } from '../services/ownerCallback.js';
import { ok } from '../utils/response.js';

const router = Router();

/**
 * POST /api/player-balance
 * Body: { token, phone, username }
 * Response: { balance: number | null }
 *
 * balance is null when:
 *  - token has no backend_url configured
 *  - owner backend unreachable
 * Frontend falls back to the URL ?balance= param in those cases.
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
      ok(res, { balance });   // balance may be null — frontend handles it
    } catch (err) {
      next(err);
    }
  }
);

export default router;
