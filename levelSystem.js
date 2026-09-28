const storage = require('./storage');

// ---------------------------------------------------------------
// Minecraft's real XP-per-level curve (total XP needed to REACH a level).
// Growth is quadratic, so higher levels get noticeably harder — same
// feel as Minecraft.
//
// The raw Minecraft numbers assume XP comes in big chunks (killing mobs,
// mining, etc.) — way more per action than "1 XP per chat message" here,
// so leveling felt way too fast using them directly. LEVEL_XP_MULTIPLIER
// scales every threshold up to compensate. Adjust anytime via the
// LEVEL_XP_MULTIPLIER environment variable on Render — no code change or
// redeploy needed, just update the env var and restart the service.
//   e.g. 1  = raw Minecraft numbers (very fast for chat XP)
//        6  = default — level 10 needs ~960 messages instead of 160
//        12 = twice as slow as the default
// ---------------------------------------------------------------
const LEVEL_XP_MULTIPLIER = Number(process.env.LEVEL_XP_MULTIPLIER) || 6;

function totalXpForLevel(level) {
  let xp;
  if (level <= 15) xp = level * level + 6 * level;
  else if (level <= 30) xp = 2.5 * level * level - 40.5 * level + 360;
  else xp = 4.5 * level * level - 162.5 * level + 2220;
  return Math.round(xp * LEVEL_XP_MULTIPLIER);
}

function levelForTotalXp(totalXp) {
  let level = 0;
  while (totalXpForLevel(level + 1) <= totalXp && level < 5000) level++;
  return level;
}

// ---------------------------------------------------------------
// In-memory cache, loaded once (lazily) from storage.js and kept in sync.
// ---------------------------------------------------------------
let data = null;
let loadingPromise = null;

async function ensureLoaded() {
  if (data) return data;
  if (!loadingPromise) {
    loadingPromise = storage.loadData().then((d) => { data = d; return d; });
  }
  return loadingPromise;
}

async function getUser(userId) {
  await ensureLoaded();
  if (!data.users[userId]) {
    data.users[userId] = { totalXp: 0, monthlyXp: 0, yearlyXp: 0, level: 0 };
  }
  return data.users[userId];
}

/** Read-only lookup — returns null (and does NOT create a record) if the user never earned XP. */
async function peekUser(userId) {
  await ensureLoaded();
  const u = data.users[userId];
  return u ? { ...u } : null;
}

/** 1-based rank of a user for a period ('monthlyXp' | 'yearlyXp' | 'totalXp'), or null if unranked. */
async function getRank(userId, period = 'totalXp') {
  await ensureLoaded();
  const me = data.users[userId];
  if (!me || !(me[period] > 0)) return null;
  const ahead = Object.values(data.users).filter((u) => (u[period] || 0) > me[period]).length;
  return ahead + 1;
}

/**
 * Adds XP to a user and persists it.
 * Returns { leveledUp, oldLevel, newLevel, totalXp }.
 */
async function addXp(userId, amount) {
  const user = await getUser(userId);
  const oldLevel = user.level;

  user.totalXp += amount;
  user.monthlyXp += amount;
  user.yearlyXp += amount;
  user.level = levelForTotalXp(user.totalXp);

  await storage.saveData(data);

  return {
    leveledUp: user.level > oldLevel,
    oldLevel,
    newLevel: user.level,
    totalXp: user.totalXp,
  };
}

/**
 * Top N users for a period ('monthlyXp' or 'yearlyXp'), highest first.
 * Only users with XP > 0 in that period are included.
 */
async function getLeaderboard(period, limit = 50) {
  await ensureLoaded();
  return Object.entries(data.users)
    .map(([userId, u]) => ({ userId, xp: u[period] || 0, level: u.level }))
    .filter((u) => u.xp > 0)
    .sort((a, b) => b.xp - a.xp)
    .slice(0, limit);
}

async function resetPeriod(period) {
  await ensureLoaded();
  Object.values(data.users).forEach((u) => { u[period] = 0; });
  await storage.saveData(data);
}

function getMonthKey(date) { return `${date.getFullYear()}-${date.getMonth()}`; }
function getYearKey(date) { return `${date.getFullYear()}`; }

async function getLastMonthKey() { await ensureLoaded(); return data.lastMonthKey; }
async function setLastMonthKey(key) { await ensureLoaded(); data.lastMonthKey = key; await storage.saveData(data); }
async function getLastYearKey() { await ensureLoaded(); return data.lastYearKey; }
async function setLastYearKey(key) { await ensureLoaded(); data.lastYearKey = key; await storage.saveData(data); }

module.exports = {
  addXp,
  getUser,
  peekUser,
  getRank,
  getLeaderboard,
  resetPeriod,
  getMonthKey,
  getYearKey,
  getLastMonthKey,
  setLastMonthKey,
  getLastYearKey,
  setLastYearKey,
  totalXpForLevel,
  levelForTotalXp,
};
