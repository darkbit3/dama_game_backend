import db from './database.js';
import { applySchema } from './schema.js';
import { ensureOwnerBalanceTable } from '../services/settlement.js';
import { logger } from '../utils/logger.js';

export const runMigrations = () => {
  logger.info('Running database migrations...');
  applySchema();
  ensureOwnerBalanceTable();

  // ── Ensure game_bet_log table exists (may be missing on older DBs) ────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS game_bet_log (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id        TEXT    NOT NULL,
      player_id      TEXT    NOT NULL,
      phone          TEXT,
      bet_amount     INTEGER NOT NULL DEFAULT 0,
      backend_url    TEXT,
      request_body   TEXT,
      response_body  TEXT,
      status         TEXT    NOT NULL DEFAULT 'pending',
      error          TEXT,
      created_at     INTEGER NOT NULL DEFAULT (unixepoch())
    )
  `);

  // ── Backfill token_id for real players whose phone matches a token owner ──
  // Link all non-AI, non-demo players that have a phone but no token_id
  // to the first active token (token_id=1). Safe to run repeatedly — only
  // updates rows where token_id IS NULL.
  try {
    const firstToken = db.prepare(
      'SELECT id FROM api_tokens WHERE is_active = 1 ORDER BY id ASC LIMIT 1'
    ).get();
    if (firstToken) {
      const changes = db.prepare(
        'UPDATE players SET token_id = ? WHERE token_id IS NULL AND phone IS NOT NULL AND is_ai = 0 AND is_demo = 0'
      ).run(firstToken.id).changes;
      if (changes > 0) {
        logger.info(`Backfilled token_id=${firstToken.id} for ${changes} player(s) with no token link.`);
      }
    }
  } catch (err) {
    logger.warn('token_id backfill skipped:', err.message);
  }

  logger.info('Migrations complete.');
};
