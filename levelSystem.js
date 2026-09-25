const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'data', 'levels.json');

// ---------------------------------------------------------------
// Minecraft's real XP-per-level curve (total XP needed to REACH a level).
// Growth is quadratic, so higher levels get noticeably harder — same
// feel as Minecraft. Tweak XP_SCALE below if leveling feels too
// slow/fast for a chat-based server; it divides every threshold.
// ---------------------------------------------------------------
const XP_SCALE = 1; // e.g. set to 2 to make every level cost half as much

function totalXpForLevel(level) {
  let xp;
  if (level <= 15) xp = level * level + 6 * level;
  else if (level <= 30) xp = 2.5 * level * level - 40.5 * level + 360;
  else xp = 4.5 * level * level - 162.5 * level + 2220;
  return Math.round(xp / XP_SCALE);
}

function levelForTotalXp(totalXp) {
  let level = 0;
  while (totalXpForLevel(level + 1) <= totalXp && level < 5000) level++;
  return level;
}

// ---------------------------------------------------------------
// Storage — plain JSON file. See the note in bot.js / README about
// this resetting on Render's free plan (ephemeral filesystem).
// ---------------------------------------------------------------
function loadData() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return { users: {}, lastMonthKey: null, lastYearKey: null };
  }
}

function saveData(data) {
  try {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('[levelSystem] Failed to save data:', err.message);
  }
}

let data = loadData();

function getUser(userId) {
  if (!data.users[userId]) {
    data.users[userId] = { totalXp: 0, monthlyXp: 0, yearlyXp: 0, level: 0 };
  }
  return data.users[userId];
}

/**
 * Adds XP to a user and persists it.
 * Returns { leveledUp, oldLevel, newLevel, totalXp } so the caller can
 * decide whether to announce a level-up.
 */
function addXp(userId, amount) {
  const user = getUser(userId);
  const oldLevel = user.level;

  user.totalXp += amount;
  user.monthlyXp += amount;
  user.yearlyXp += amount;
  user.level = levelForTotalXp(user.totalXp);

  saveData(data);

  return {
    leveledUp: user.level > oldLevel,
    oldLevel,
    newLevel: user.level,
    totalXp: user.totalXp,
  };
}

/**
 * Top N users for a period ('monthlyXp' or 'yearlyXp'), highest first.
 * Only users with XP > 0 in that period are included — no padding with
 * empty ranks if fewer than N users qualify.
 */
function getLeaderboard(period, limit = 50) {
  return Object.entries(data.users)
    .map(([userId, u]) => ({ userId, xp: u[period] || 0, level: u.level }))
    .filter((u) => u.xp > 0)
    .sort((a, b) => b.xp - a.xp)
    .slice(0, limit);
}

function resetPeriod(period) {
  Object.values(data.users).forEach((u) => { u[period] = 0; });
  saveData(data);
}

function getMonthKey(date) { return `${date.getFullYear()}-${date.getMonth()}`; }
function getYearKey(date) { return `${date.getFullYear()}`; }

function getLastMonthKey() { return data.lastMonthKey; }
function setLastMonthKey(key) { data.lastMonthKey = key; saveData(data); }
function getLastYearKey() { return data.lastYearKey; }
function setLastYearKey(key) { data.lastYearKey = key; saveData(data); }

module.exports = {
  addXp,
  getUser,
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
