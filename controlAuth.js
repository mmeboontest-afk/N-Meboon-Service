// Simple PIN gate for /ai-control so it isn't wide open to anyone who
// finds the URL. Deliberately lightweight (no login system) since this is
// a single-admin control panel, not a multi-user site.
//
// Set AI_CONTROL_PIN on Render to whatever PIN you want. If it's not set,
// the panel stays locked for everyone (secure by default) until you set one.

const crypto = require('crypto');

const PIN = process.env.AI_CONTROL_PIN;
const COOKIE_NAME = 'mc_control_auth';
const validTokens = new Set(); // in-memory; resets on redeploy (re-enter PIN then)

function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx < 0) return;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  });
  return out;
}

function isAuthed(req) {
  const token = parseCookies(req)[COOKIE_NAME];
  return !!token && validTokens.has(token);
}

function login(req, res, pin) {
  if (!PIN) return { ok: false, error: 'AI_CONTROL_PIN is not set on the server yet — set it in Render environment variables.' };
  if (pin !== PIN) return { ok: false, error: 'Incorrect PIN.' };

  const token = crypto.randomBytes(24).toString('hex');
  validTokens.add(token);
  const isHttps = req.headers['x-forwarded-proto'] === 'https';
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 24 * 60 * 60}${isHttps ? '; Secure' : ''}`);
  return { ok: true };
}

/** Express middleware — blocks the request with 401 JSON unless authed. */
function requireAuth(req, res, next) {
  if (isAuthed(req)) return next();
  res.status(401).json({ error: 'not_authed' });
}

module.exports = { isAuthed, login, requireAuth };
