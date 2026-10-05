// One-time OAuth so the CHANNEL OWNER authorizes this app to edit video
// metadata. An API key (what /api/youtube already uses) is read-only —
// writing localized titles needs a real OAuth token with write scope.
//
// Required env vars:
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET  (Google Cloud Console -> APIs &
//     Services -> Credentials -> OAuth client ID, type "Web application")
//   GOOGLE_REDIRECT_URI  e.g. https://your-site.onrender.com/admin/youtube-oauth/callback
//     (must be added to the OAuth client's "Authorized redirect URIs" too)
//
// The refresh token (long-lived) is saved to disk so you only have to do
// this once — re-run the flow only if you revoke access or it expires.

const fs = require('fs');
const path = require('path');

const TOKEN_FILE = path.join(__dirname, 'data', 'google-token.json');
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;
const SCOPE = 'https://www.googleapis.com/auth/youtube.force-ssl';

function isConfigured() {
  return !!(CLIENT_ID && CLIENT_SECRET && REDIRECT_URI);
}

function getAuthUrl(state) {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline', // required to get a refresh_token back
    prompt: 'consent', // forces a refresh_token even on repeat authorizations
    state: state || '',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

async function exchangeCodeForTokens(code) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
      redirect_uri: REDIRECT_URI,
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error('Token exchange failed: ' + JSON.stringify(json));
  saveTokens({ refresh_token: json.refresh_token, access_token: json.access_token, expires_at: Date.now() + json.expires_in * 1000 });
  return json;
}

function saveTokens(tokens) {
  fs.mkdirSync(path.dirname(TOKEN_FILE), { recursive: true });
  const existing = loadTokens() || {};
  const merged = { ...existing, ...tokens };
  if (!merged.refresh_token && existing.refresh_token) merged.refresh_token = existing.refresh_token;
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(merged, null, 2));
}

function loadTokens() {
  try { return JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8')); } catch { return null; }
}

function hasAuthorized() {
  const t = loadTokens();
  return !!(t && t.refresh_token);
}

/** Returns a valid access token, refreshing it first if it's expired/near-expiry. */
async function getAccessToken() {
  const tokens = loadTokens();
  if (!tokens || !tokens.refresh_token) {
    throw new Error('Not authorized yet — visit /admin/youtube-oauth/start and sign in with the channel owner\'s Google account.');
  }
  if (tokens.access_token && tokens.expires_at > Date.now() + 60000) {
    return tokens.access_token; // still valid for at least another minute
  }
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: tokens.refresh_token,
      grant_type: 'refresh_token',
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error('Token refresh failed: ' + JSON.stringify(json));
  saveTokens({ access_token: json.access_token, expires_at: Date.now() + json.expires_in * 1000 });
  return json.access_token;
}

module.exports = { isConfigured, getAuthUrl, exchangeCodeForTokens, hasAuthorized, getAccessToken };
