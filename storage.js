// Single storage layer for level/XP data, used by both bot.js and
// server.js (they run in the same Node process, so this module's cache is
// shared automatically — no extra API calls needed between them).
//
// If MONGODB_URI is set, data is stored permanently in MongoDB Atlas
// (survives Render redeploys/restarts). If not set, falls back to the
// local JSON file used before — which still resets on Render's free plan,
// exactly like before. Nothing breaks either way; this is a pure upgrade.

const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'data', 'levels.json');
const MONGODB_URI = process.env.MONGODB_URI;

let mongoCollection = null;
let mongoConnectPromise = null;

async function getMongoCollection() {
  if (mongoCollection) return mongoCollection;
  if (!mongoConnectPromise) {
    mongoConnectPromise = (async () => {
      const { MongoClient } = require('mongodb');
      const client = new MongoClient(MONGODB_URI);
      await client.connect();
      console.log('[storage] Connected to MongoDB Atlas.');
      mongoCollection = client.db('nmeboon').collection('levelData');
      return mongoCollection;
    })().catch((err) => {
      console.error('[storage] MongoDB connection failed, falling back to file storage:', err.message);
      mongoConnectPromise = null;
      return null;
    });
  }
  return mongoConnectPromise;
}

function emptyState() {
  return { users: {}, lastMonthKey: null, lastYearKey: null };
}

async function loadData() {
  if (MONGODB_URI) {
    const col = await getMongoCollection();
    if (col) {
      const doc = await col.findOne({ _id: 'levels' });
      return doc ? doc.data : emptyState();
    }
    // Mongo configured but unreachable right now — fall through to file so
    // the bot still works this session rather than losing all XP tracking.
  }
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return emptyState();
  }
}

async function saveData(data) {
  if (MONGODB_URI) {
    const col = await getMongoCollection();
    if (col) {
      await col.updateOne({ _id: 'levels' }, { $set: { data } }, { upsert: true });
      return;
    }
  }
  try {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('[storage] Failed to save to file:', err.message);
  }
}

module.exports = { loadData, saveData, usingMongo: () => !!MONGODB_URI };
