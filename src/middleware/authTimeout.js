import jwt from 'jsonwebtoken';
const secret = process.env.JWT_SECRET || 'dama-jwt-secret-change-me';

/**
 * Middleware that verifies JWT token expiry.
 * If token is missing, simply continue (allows public routes).
 * If token is present but invalid or expired, respond with 401.
 */
export const authTimeout = (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.split(' ')[1] || req.cookies?.token;
  if (!token) return next();
  try {
    const payload = jwt.verify(token, secret);
    req.user = payload;
    next();
  } catch (e) {
    // Token invalid or expired
    res.status(401).json({ ok: false, error: 'Session expired' });
  }
};
