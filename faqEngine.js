// A from-scratch, keyword-matching FAQ assistant — deliberately NOT a real
// language model and NOT calling any external AI API (OpenAI, Claude,
// etc.) per the request to keep this fully self-built. It works by
// comparing the words in a question against the keyword sets in
// faqKnowledgeBase.json and returning the best match above a confidence
// threshold. It's good at recognizing rephrased versions of expected
// questions; it will NOT reliably handle open-ended natural conversation
// the way a real LLM would — that's an inherent limit of this approach,
// not a bug.

const fs = require('fs');
const path = require('path');

const KB_FILE = path.join(__dirname, 'faqKnowledgeBase.json');
const MATCH_THRESHOLD = 0.15; // tune if answers feel too eager or too shy

const STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'am',
  'do', 'does', 'did', 'can', 'could', 'will', 'would', 'should',
  'i', 'you', 'he', 'she', 'it', 'we', 'they', 'my', 'your', 'me',
  'to', 'of', 'in', 'on', 'at', 'for', 'and', 'or', 'but', 'if',
  'what', 'when', 'where', 'why', 'how', 'who', 'which',
  'this', 'that', 'these', 'those', 'there', 'here',
  'please', 'just', 'about', 'so', 'up', 'down', 'out',
]);

function tokenize(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
}

function loadKnowledgeBase() {
  try {
    const raw = fs.readFileSync(KB_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('[faqEngine] Failed to load knowledge base:', err.message);
    return [];
  }
}

// Multi-word keywords (e.g. "level up") get tokenized too, so matching
// still works on individual words within them.
function entryTokenSet(entry) {
  const tokens = new Set();
  (entry.keywords || []).forEach((kw) => tokenize(kw).forEach((t) => tokens.add(t)));
  return tokens;
}

function scoreOverlap(questionTokens, entryTokens) {
  if (questionTokens.length === 0 || entryTokens.size === 0) return 0;
  let overlap = 0;
  const seen = new Set();
  for (const t of questionTokens) {
    if (entryTokens.has(t) && !seen.has(t)) { overlap++; seen.add(t); }
  }
  // Normalize against both sides so short questions and short keyword
  // sets don't unfairly dominate the score.
  return overlap / Math.sqrt(questionTokens.length * entryTokens.size);
}

/**
 * Returns { matched: boolean, answer: string, entryId?: string, score: number }
 */
function answer(question) {
  const kb = loadKnowledgeBase();
  const qTokens = tokenize(question);

  let best = null;
  for (const entry of kb) {
    const score = scoreOverlap(qTokens, entryTokenSet(entry));
    if (!best || score > best.score) best = { entry, score };
  }

  if (best && best.score >= MATCH_THRESHOLD) {
    return { matched: true, answer: best.entry.answer, entryId: best.entry.id, score: best.score };
  }

  return {
    matched: false,
    answer: "I'm not confident I know the answer to that one — I'm a simple keyword-based helper, not a full AI. An admin can help you with this in the server.",
    score: best ? best.score : 0,
  };
}

module.exports = { answer, tokenize };
