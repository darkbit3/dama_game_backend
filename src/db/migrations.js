import { applySchema } from './schema.js';
import { ensureOwnerBalanceTable } from '../services/settlement.js';
import { logger } from '../utils/logger.js';

export const runMigrations = () => {
  logger.info('Running database migrations...');
  applySchema();
  ensureOwnerBalanceTable();
  logger.info('Migrations complete.');
};
