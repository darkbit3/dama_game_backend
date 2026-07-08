import 'dotenv/config';

const required = (key) => {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
};

export const PORT = parseInt(process.env.PORT || '5000', 10);
export const NODE_ENV = process.env.NODE_ENV || 'development';
export const DB_PATH = process.env.DB_PATH || './data/dama.db';
export const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'default-admin-token';
export const CORS_ORIGINS = (process.env.CORS_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map((s) => s.trim());

export const isDev = NODE_ENV === 'development';
