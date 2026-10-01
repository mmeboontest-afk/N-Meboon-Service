// Central bot controller used by server.js. Key rule from the brief:
// the Minecraft connection is NEVER started automatically — it only
// happens after /api/config has been POSTed with a valid host/port/mode,
// and then only when /api/start is explicitly called.

const mineflayer = require('mineflayer');
const { pathfinder } = require('mineflayer-pathfinder');
const memory = require('./memory');
const custom1Runner = require('./modes/custom1Runner');
const survival = require('./modes/survival');
const pvp = require('./modes/pvp');
const farming = require('./modes/farming');

const MODE_RUNNERS = {
  custom1: (bot, ctx) => custom1Runner.startCustom1(bot, ctx),
  survival: (bot, ctx) => survival.startMode(bot, ctx),
  pvp: (bot, ctx) => pvp.startMode(bot, ctx),
  farming: (bot, ctx) => farming.startMode(bot, ctx),
};

const MAX_LOG_LINES = 200;
const MEMORY_SAVE_DEBOUNCE_MS = 3000;

class BotController {
  constructor() {
    this.config = null; // { host, port, botName, mode } — set via /api/config
    this.bot = null;
    this.stopRunner = null;
    this.logs = [];
    this.stage = 'idle';
    this.memoryState = { notes: [] };
    this._saveTimer = null;
    this._lastError = null;
  }

  log(line) {
    const entry = `[${new Date().toLocaleTimeString()}] ${line}`;
    this.logs.push(entry);
    if (this.logs.length > MAX_LOG_LINES) this.logs.shift();
    console.log('[mcbot]', line);
  }

  setStage(stage) {
    this.stage = stage;
    this.scheduleMemorySave();
  }

  scheduleMemorySave() {
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this.saveMemoryNow(), MEMORY_SAVE_DEBOUNCE_MS);
  }

  async saveMemoryNow() {
    await memory.saveMemory({
      botName: this.config?.botName,
      mode: this.config?.mode,
      serverHost: this.config?.host,
      serverPort: this.config?.port,
      stage: this.stage,
      lastDeathPosition: this.memoryState.lastDeathPosition,
      inventorySnapshot: this.memoryState.inventorySnapshot,
      stats: this.memoryState.stats,
      notes: this.memoryState.notes,
    }).catch((err) => this.log('Failed to save memory: ' + err.message));
  }

  async loadPastMemory() {
    const loaded = await memory.loadMemory();
    if (loaded) {
      this.memoryState.lastDeathPosition = loaded.lastDeathPosition;
      this.memoryState.inventorySnapshot = loaded.inventorySnapshot;
      this.memoryState.stats = loaded.stats || {};
      this.memoryState.notes = loaded.notes || [];
      this.log(`Loaded previous memory (last stage: ${loaded.stage || 'unknown'}).`);
    } else {
      this.log('No previous memory found — starting fresh.');
    }
    return loaded;
  }

  /** Step 1 — must be called with valid settings before start() is allowed. */
  setConfig({ host, port, botName, mode }) {
    if (!host) throw new Error('Server host is required.');
    if (!MODE_RUNNERS[mode]) throw new Error(`Unknown mode "${mode}".`);
    this.config = { host, port: port ? Number(port) : 25565, botName: botName || 'NMeboonBot', mode };
    this.log(`Configured: ${this.config.botName} -> ${host}:${this.config.port} [${mode}]`);
    return this.config;
  }

  isConfigured() {
    return !!this.config;
  }

  isRunning() {
    return !!this.bot;
  }

  /** Step 2 — only allowed once setConfig() has succeeded. */
  async start() {
    if (!this.config) throw new Error('Not configured yet — submit server settings on the web page first.');
    if (this.bot) throw new Error('Already running.');

    await this.loadPastMemory();

    this.bot = mineflayer.createBot({
      host: this.config.host,
      port: this.config.port,
      username: this.config.botName,
      version: false, // auto-detect
    });
    this.bot.loadPlugin(pathfinder);
    this._lastError = null;

    this.bot.once('spawn', () => {
      this.log(`Spawned in world as ${this.config.botName}.`);
      const ctx = {
        log: (l) => this.log(l),
        setStage: (s) => this.setStage(s),
        memoryState: this.memoryState,
      };
      this.stopRunner = MODE_RUNNERS[this.config.mode](this.bot, ctx);
    });

    this.bot.on('error', (err) => {
      this._lastError = err.message;
      this.log('Bot error: ' + err.message);
    });
    this.bot.on('kicked', (reason) => this.log('Kicked from server: ' + reason));
    this.bot.on('end', (reason) => {
      this.log('Disconnected: ' + reason);
      if (this.stopRunner) { this.stopRunner(); this.stopRunner = null; }
      this.bot = null;
      this.setStage('disconnected');
      this.saveMemoryNow();
    });

    this.setStage('connecting');
  }

  async stop() {
    if (this.stopRunner) { this.stopRunner(); this.stopRunner = null; }
    if (this.bot) { this.bot.quit(); this.bot = null; }
    this.setStage('stopped');
    await this.saveMemoryNow();
  }

  getStatus() {
    return {
      configured: this.isConfigured(),
      running: this.isRunning(),
      config: this.config,
      stage: this.stage,
      lastError: this._lastError,
      health: this.bot?.health ?? null,
      position: this.bot?.entity?.position ?? null,
      logs: this.logs.slice(-50),
      memory: this.memoryState,
    };
  }
}

module.exports = new BotController();
