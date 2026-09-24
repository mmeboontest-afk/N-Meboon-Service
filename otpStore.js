// Simple in-memory OTP store.
//
// NOTE: this resets if the bot process restarts (Render redeploys, crashes,
// etc.) — fine for trying the feature out, but if you want OTPs to survive
// restarts later, swap this for a small database or a JSON file on disk.

const OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

const otpByUserId = new Map();   // userId -> { code, rand, expiresAt }
const activeRandomNumbers = new Set(); // guarantees no duplicate suffix among *active* codes

function sanitizeUsername(username) {
  // Keep it readable inside the OTP: letters/numbers only.
  return String(username).replace(/[^a-zA-Z0-9]/g, '');
}

function generateOtp(user) {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();

  let rand;
  do {
    rand = Math.floor(10000 + Math.random() * 90000); // 5-digit number
  } while (activeRandomNumbers.has(rand));

  const code = `${sanitizeUsername(user.username)}${dd}${mm}${yyyy}#${rand}`;
  const expiresAt = Date.now() + OTP_EXPIRY_MS;

  // If this user already had a pending code, free up its random number first.
  const existing = otpByUserId.get(user.id);
  if (existing) activeRandomNumbers.delete(existing.rand);

  otpByUserId.set(user.id, { code, rand, expiresAt });
  activeRandomNumbers.add(rand);

  return { code, expiresAt };
}

function verifyOtp(userId, submittedCode) {
  const record = otpByUserId.get(userId);
  if (!record) return { ok: false, reason: 'not_requested' };
  if (Date.now() > record.expiresAt) {
    otpByUserId.delete(userId);
    activeRandomNumbers.delete(record.rand);
    return { ok: false, reason: 'expired' };
  }
  if (submittedCode.trim() !== record.code) {
    return { ok: false, reason: 'mismatch' };
  }
  otpByUserId.delete(userId);
  activeRandomNumbers.delete(record.rand);
  return { ok: true };
}

module.exports = { generateOtp, verifyOtp, OTP_EXPIRY_MS };
