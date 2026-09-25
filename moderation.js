// Lightweight, rule-based moderation matching the Low/Mid/High rules from
// the /summon information embed. This is pattern/keyword detection, not
// true AI — good enough to catch obvious cases, but it can be fooled and
// won't understand context/sarcasm/language nuance. Expand the keyword
// lists below as you find gaps.

const GIF_DOMAINS = ['tenor.com', 'giphy.com', 'gph.is'];
const NSFW_VIOLENCE_KEYWORDS = [
  // keep this list to genuinely explicit/violent terms; expand as needed
  'porn', 'nsfw', 'gore', 'rape', 'kill yourself', 'kys',
];

// Very small in-memory spam tracker: userId -> array of recent timestamps
const recentMessages = new Map();
const SPAM_WINDOW_MS = 5000;
const SPAM_MESSAGE_THRESHOLD = 5;

function isGifOrLink(message) {
  // Attachments that are GIFs
  const hasGifAttachment = message.attachments.some(
    (a) => a.contentType?.includes('gif') || a.name?.toLowerCase().endsWith('.gif')
  );
  if (hasGifAttachment) return true;

  // Embeds that are GIFs (e.g. Tenor/Giphy link unfurled by Discord)
  const hasGifEmbed = message.embeds.some((e) => e.video || e.url && GIF_DOMAINS.some((d) => e.url.includes(d)));
  if (hasGifEmbed) return true;

  const content = message.content || '';
  if (GIF_DOMAINS.some((d) => content.includes(d))) return true;

  // Any other http(s) link (rule says "Links not allowed")
  if (/https?:\/\/\S+/i.test(content)) return true;

  return false;
}

function isMassPing(message) {
  if (message.mentions.everyone) return true;
  if (message.mentions.users.size >= 4) return true;
  return false;
}

function isSpam(message) {
  const now = Date.now();
  const userId = message.author.id;
  const arr = (recentMessages.get(userId) || []).filter((t) => now - t < SPAM_WINDOW_MS);
  arr.push(now);
  recentMessages.set(userId, arr);
  return arr.length >= SPAM_MESSAGE_THRESHOLD;
}

function isNsfwOrViolence(message) {
  const content = (message.content || '').toLowerCase();
  return NSFW_VIOLENCE_KEYWORDS.some((kw) => content.includes(kw));
}

/**
 * Runs all checks on a message. Returns:
 *   { action: 'delete_silent' }                    — GIF/Link, no warning
 *   { action: 'warn', rule: 'Low'|'High', reason }  — post a warning
 *   { action: 'none' }                              — message is fine
 */
function moderateMessage(message) {
  if (isGifOrLink(message)) {
    return { action: 'delete_silent', reason: 'GIF or link (auto-deleted, no penalty per server rules)' };
  }
  if (isNsfwOrViolence(message)) {
    return { action: 'warn', rule: 'High', reason: 'NSFW or violent content detected' };
  }
  if (isMassPing(message)) {
    return { action: 'warn', rule: 'Low', reason: 'Mass ping / @everyone detected' };
  }
  if (isSpam(message)) {
    return { action: 'warn', rule: 'Low', reason: 'Sending messages too quickly (spam)' };
  }
  return { action: 'none' };
}

module.exports = { moderateMessage };
