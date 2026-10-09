// Persistent "memory" for the MC bot — stored as a plain .txt file posted
// to a specific Discord channel, using Discord's plain REST API (no
// gateway/websocket connection needed, so this never conflicts with the
// main bot service's own gateway session even though it can share the
// same bot token).
//
// How it works:
//   - saveMemory(state) formats `state` as human-readable text and posts
//     it as a .txt attachment to MEMORY_CHANNEL_ID, called after every
//     meaningful action (per the "update on every action" request).
//   - loadMemory() fetches the most recent message in that channel that
//     has a .txt attachment, downloads it, and parses it back into state.
//   - If the channel has no such file at all (deleted, fresh channel,
//     etc.), loadMemory() returns null — the caller treats that as
//     "start fresh", matching "ถ้าไฟล์ล่าสุดหาย = เริ่มระบบใหม่".
//
// The file is deliberately human-readable (not JSON) so you can open it
// in Discord and actually read what the bot thinks is going on.

const DISCORD_API = 'https://discord.com/api/v10';
const TOKEN = process.env.MAIN_DISCORD_TOKEN;
const MEMORY_CHANNEL_ID = process.env.MEMORY_CHANNEL_ID || '1492851614095118466';

function authHeaders(extra = {}) {
  return { Authorization: `Bot ${TOKEN}`, ...extra };
}

function serializeMemory(state) {
  const lines = [];
  lines.push(`# N'Meboon MC Bot memory — last updated ${new Date().toISOString()}`);
  lines.push(`# This file is machine-read on startup. Edit with care — keep the "key: value" format.`);
  lines.push('');
  lines.push(`bot_name: ${state.botName || ''}`);
  lines.push(`mode: ${state.mode || ''}`);
  lines.push(`server_host: ${state.serverHost || ''}`);
  lines.push(`server_port: ${state.serverPort || ''}`);
  lines.push(`stage: ${state.stage || ''}`); // e.g. traveling, gathering, hunting, defending
  lines.push(`has_registered: ${state.hasRegistered ? 'true' : 'false'}`);
  lines.push(`last_death_position: ${state.lastDeathPosition ? JSON.stringify(state.lastDeathPosition) : ''}`);
  lines.push(`inventory_snapshot: ${state.inventorySnapshot ? JSON.stringify(state.inventorySnapshot) : ''}`);
  lines.push(`stats: ${JSON.stringify(state.stats || {})}`);
  lines.push('');
  lines.push('## Notes (free text, appended over time)');
  (state.notes || []).forEach((n) => lines.push(`- ${n}`));
  return lines.join('\n');
}

function parseMemory(text) {
  const state = { notes: [] };
  const lines = text.split('\n');
  for (const line of lines) {
    if (line.startsWith('#')) continue;
    if (line.startsWith('- ')) { state.notes.push(line.slice(2)); continue; }
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    switch (key) {
      case 'bot_name': state.botName = value; break;
      case 'mode': state.mode = value; break;
      case 'server_host': state.serverHost = value; break;
      case 'server_port': state.serverPort = value; break;
      case 'stage': state.stage = value; break;
      case 'has_registered': state.hasRegistered = value === 'true'; break;
      case 'last_death_position': state.lastDeathPosition = value ? JSON.parse(value) : null; break;
      case 'inventory_snapshot': state.inventorySnapshot = value ? JSON.parse(value) : null; break;
      case 'stats': state.stats = value ? JSON.parse(value) : {}; break;
      default: break;
    }
  }
  return state;
}

async function saveMemory(state) {
  if (!TOKEN) { console.log('[memory] MAIN_DISCORD_TOKEN not set — skipping save.'); return; }
  const text = serializeMemory(state);
  const form = new FormData();
  form.append('payload_json', JSON.stringify({ content: `📝 Memory updated: ${state.stage || 'unknown stage'}` }));
  form.append('files[0]', new Blob([text], { type: 'text/plain' }), 'memory.txt');

  const res = await fetch(`${DISCORD_API}/channels/${MEMORY_CHANNEL_ID}/messages`, {
    method: 'POST',
    headers: authHeaders(),
    body: form,
  });
  if (!res.ok) {
    console.error('[memory] Failed to save memory:', res.status, await res.text().catch(() => ''));
  }
}

/** Returns the parsed state object, or null if no memory file exists yet. */
async function loadMemory() {
  if (!TOKEN) { console.log('[memory] MAIN_DISCORD_TOKEN not set — cannot load.'); return null; }

  try {
    const res = await fetch(`${DISCORD_API}/channels/${MEMORY_CHANNEL_ID}/messages?limit=50`, {
      headers: authHeaders(),
    });
    if (!res.ok) {
      console.error('[memory] Failed to list messages:', res.status);
      return null;
    }
    const messages = await res.json();
    for (const msg of messages) {
      const attachment = (msg.attachments || []).find((a) => a.filename === 'memory.txt');
      if (attachment) {
        const fileRes = await fetch(attachment.url);
        if (!fileRes.ok) continue;
        const text = await fileRes.text();
        return parseMemory(text);
      }
    }
    return null; // no memory.txt found anywhere in recent history — start fresh
  } catch (err) {
    console.error('[memory] Network error while loading memory (starting fresh instead of crashing):', err.message);
    return null;
  }
}

module.exports = { saveMemory, loadMemory, serializeMemory, parseMemory };
