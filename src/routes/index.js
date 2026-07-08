import { Router } from 'express';
import healthRouter  from './health.js';
import playersRouter from './players.js';
import gamesRouter   from './games.js';
import aiRouter      from './ai.js';
import adminRouter   from './admin.js';
import tokensRouter  from './tokens.js';
import balanceRouter from './balance.js';

const router = Router();

router.use('/health',          healthRouter);
router.use('/players',         playersRouter);
router.use('/games',           gamesRouter);
router.use('/ai',              aiRouter);
router.use('/admin',           adminRouter);
router.use('/admin/tokens',    tokensRouter);
router.use('/player-balance',  balanceRouter);

export default router;
