// backend/src/controllers/tokens.js
import crypto from 'crypto';
import db from '../db/database.js';
import { ok, fail } from '../utils/response.js';

/** Generate a secure random token: dama_<32 hex chars> */
function generateToken() {
  return 'dama_' + crypto.randomBytes(24).toString('hex');
}

// GET /api/admin/tokens
export const listTokens = (req, res, next) => {
  try {
    const tokens = db.prepare(`
      SELECT id, token, key_name, owner, created_at, expires_at, last_used, is_active
      FROM api_tokens
      ORDER BY created_at DESC
    `).all();
    ok(res, tokens);
  } catch (err) { next(err); }
};

// POST /api/admin/tokens
export const createToken = (req, res, next) => {
  try {
    const { key_name, owner, expires_in_days, backend_url } = req.body;

    if (!key_name || !owner) {
      return fail(res, 'key_name and owner are required', 400);
    }

    const token     = generateToken();
    const expiresAt = expires_in_days
      ? Math.floor(Date.now() / 1000) + Number(expires_in_days) * 86400
      : null;

    const info = db.prepare(`
      INSERT INTO api_tokens (token, key_name, owner, expires_at, backend_url)
      VALUES (?, ?, ?, ?, ?)
    `).run(token, key_name.trim(), owner.trim(), expiresAt, backend_url?.trim() || null);

    const created = db.prepare('SELECT * FROM api_tokens WHERE id = ?').get(info.lastInsertRowid);
    ok(res, created, 201);
  } catch (err) { next(err); }
};

// PATCH /api/admin/tokens/:id/toggle
export const toggleToken = (req, res, next) => {
  try {
    const row = db.prepare('SELECT * FROM api_tokens WHERE id = ?').get(req.params.id);
    if (!row) return fail(res, 'Token not found', 404);

    db.prepare('UPDATE api_tokens SET is_active = ? WHERE id = ?')
      .run(row.is_active ? 0 : 1, row.id);

    const updated = db.prepare('SELECT * FROM api_tokens WHERE id = ?').get(row.id);
    ok(res, updated);
  } catch (err) { next(err); }
};

// DELETE /api/admin/tokens/:id
export const deleteToken = (req, res, next) => {
  try {
    const info = db.prepare('DELETE FROM api_tokens WHERE id = ?').run(req.params.id);
    if (!info.changes) return fail(res, 'Token not found', 404);
    ok(res, { deleted: true });
  } catch (err) { next(err); }
};

// PATCH /api/admin/tokens/:id/backend-url
export const updateBackendUrl = (req, res, next) => {
  try {
    const { backend_url } = req.body;
    const row = db.prepare('SELECT * FROM api_tokens WHERE id = ?').get(req.params.id);
    if (!row) return fail(res, 'Token not found', 404);

    db.prepare('UPDATE api_tokens SET backend_url = ? WHERE id = ?')
      .run(backend_url?.trim() || null, row.id);

    const updated = db.prepare('SELECT * FROM api_tokens WHERE id = ?').get(row.id);
    ok(res, updated);
  } catch (err) { next(err); }
};
