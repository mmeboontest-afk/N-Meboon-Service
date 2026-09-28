// Discord-only login for the website.
//
// SESSION DESIGN (the "memory" question): the login session lives in a
// signed cookie in the visitor's own browser — NOT in server memory or a
// database. That means:
//   - Redeploying/restarting Render never logs anyone out (the cookie is
//     still valid; the server just re-verifies its signature).
//   - No session table to maintain or lose.
//   - Cookies can't be forged or edited: they're HMAC-signed with
//     SESSION_SECRET, so any tampering makes the signature fail.
// Trade-off: you can't remotely "kick out" a single session before it
// expires (30 days) — changing SESSION_SECRET logs EVERYONE out at once.
//
// Required env vars on Render:
//   DISCORD_CLIENT_ID      (already set for the bot)
//   DISCORD_CLIENT_SECRET  (Developer Portal -> OAuth2 -> Client Secret)
//   SESSION_SECRET         (any long random string you make up)
//   SITE_BASE_URL          (optional, default https://n-meboon-service.onrender.com)
// And in the Developer Portal -> OAuth2 -> Redirects add:
//   https://n-meboon-service.onrender.com/auth/discord/callback

const crypto = require('crypto');

const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const BASE_URL = (process.env.SITE_BASE_URL || 'https://n-meboon-service.onrender.com').replace(/\/$/, '');
const REDIRECT_URI = `${BASE_URL}/auth/discord/callback`;

let SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET) {
  SESSION_SECRET = crypto.randomBytes(32).toString('hex');
  console.warn('[auth] SESSION_SECRET is not set — using a random one, so everyone gets logged out on every restart. Set SESSION_SECRET on Render.');
}

const SESSION_COOKIE = 'nm_session';
const STATE_COOKIE = 'nm_oauth_state';
const SESSION_MAX_AGE_S = 30 * 24 * 60 * 60; // 30 days

// ---------------- signing ----------------
function b64url(buf) { return Buffer.from(buf).toString('base64url'); }

function sign(payloadObj) {
  const body = b64url(JSON.stringify(payloadObj));
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verify(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  const a = Buffer.from(sig || '');
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

// ---------------- cookies ----------------
function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx < 0) return;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  });
  return out;
}

function isHttps(req) {
  return req.headers['x-forwarded-proto'] === 'https' || !!(req.socket && req.socket.encrypted);
}

function cookieString(req, name, value, maxAgeS) {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeS}`];
  if (isHttps(req)) parts.push('Secure');
  return parts.join('; ');
}

function appendSetCookie(res, cookie) {
  const existing = res.getHeader('Set-Cookie');
  const list = existing ? (Array.isArray(existing) ? existing : [existing]) : [];
  res.setHeader('Set-Cookie', [...list, cookie]);
}

function getSession(req) {
  return verify(parseCookies(req)[SESSION_COOKIE]);
}

// ---------------- OAuth flow ----------------
function isConfigured() {
  return !!(CLIENT_ID && CLIENT_SECRET);
}

function startLogin(req, res) {
  if (!isConfigured()) {
    res.statusCode = 503;
    res.end('Discord login is not configured yet (missing DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET).');
    return;
  }
  const state = crypto.randomBytes(16).toString('hex');
  appendSetCookie(res, cookieString(req, STATE_COOKIE, sign({ state, exp: Date.now() + 10 * 60 * 1000 }), 600));
  const url = 'https://discord.com/oauth2/authorize?' + new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: 'identify',
    state,
    prompt: 'none',
  }).toString();
  res.statusCode = 302;
  res.setHeader('Location', url);
  res.end();
}

async function handleCallback(req, res, query) {
  const fail = (msg) => { res.statusCode = 302; res.setHeader('Location', '/login?error=' + encodeURIComponent(msg)); res.end(); };

  if (!isConfigured()) return fail('not_configured');
  if (query.error) return fail('discord_denied');

  const saved = verify(parseCookies(req)[STATE_COOKIE]);
  if (!saved || !query.state || saved.state !== query.state) return fail('bad_state');
  if (!query.code) return fail('missing_code');

  try {
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: 'authorization_code',
        code: query.code,
        redirect_uri: REDIRECT_URI,
      }),
    });
    const token = await tokenRes.json();
    if (!tokenRes.ok || !token.access_token) return fail('token_exchange_failed');

    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    const user = await userRes.json();
    if (!userRes.ok || !user.id) return fail('user_fetch_failed');

    // Only the minimal identity is stored — we never keep the access token.
    const session = {
      id: user.id,
      username: user.username,
      globalName: user.global_name || null,
      avatar: user.avatar || null,
      exp: Date.now() + SESSION_MAX_AGE_S * 1000,
    };
    appendSetCookie(res, cookieString(req, SESSION_COOKIE, sign(session), SESSION_MAX_AGE_S));
    appendSetCookie(res, cookieString(req, STATE_COOKIE, '', 0)); // clear state cookie
    res.statusCode = 302;
    res.setHeader('Location', '/main');
    res.end();
  } catch (err) {
    console.error('[auth] OAuth callback error:', err.message);
    fail('server_error');
  }
}

function logout(req, res) {
  appendSetCookie(res, cookieString(req, SESSION_COOKIE, '', 0));
  res.statusCode = 302;
  res.setHeader('Location', '/');
  res.end();
}

function avatarUrl(session) {
  if (session.avatar) return `https://cdn.discordapp.com/avatars/${session.id}/${session.avatar}.png?size=256`;
  const idx = Number((BigInt(session.id) >> 22n) % 6n);
  return `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
}

module.exports = { startLogin, handleCallback, logout, getSession, avatarUrl, isConfigured, sign, verify, REDIRECT_URI };
