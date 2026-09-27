// A from-scratch, local FAQ-matching engine — deliberately NOT calling any
// external AI API (OpenAI, Claude, etc.) per the request to keep this
// fully self-built. This uses the same technique real no-API-key FAQ
// chatbots use (confirmed by looking at several open-source examples):
//   1. Stem each word to its root (so "allowed"/"allow"/"allowing" all match)
//   2. Build a TF-IDF vector for every knowledge-base entry
//   3. Compare the question's TF-IDF vector to each entry with cosine
//      similarity and return the best match above a confidence threshold
//
// This is meaningfully smarter than plain keyword-overlap (it understands
// word variations and weighs rare/distinctive words more than common
// ones) — but it is still NOT a real language model. It cannot hold a
// conversation, understand context across messages, or answer things
// that aren't covered in the knowledge base. That's an inherent limit of
// this approach, not a bug — a genuinely conversational AI would need an
// actual trained language model, which is the "other AI" this was
// explicitly built to avoid depending on.

const fs = require('fs');
const path = require('path');

const KB_FILE = path.join(__dirname, 'faqKnowledgeBase.json');
const MATCH_THRESHOLD = 0.12; // tune if answers feel too eager or too shy

const STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'am',
  'do', 'does', 'did', 'can', 'could', 'will', 'would', 'should',
  'i', 'you', 'he', 'she', 'it', 'we', 'they', 'my', 'your', 'me',
  'to', 'of', 'in', 'on', 'at', 'for', 'and', 'or', 'but', 'if',
  'what', 'when', 'where', 'why', 'how', 'who', 'which',
  'this', 'that', 'these', 'those', 'there', 'here',
  'please', 'just', 'about', 'so', 'up', 'down', 'out', 'get', 'got',
]);

// A light suffix-stripping stemmer (not a full Porter stemmer, but close
// enough to fold most common English word forms onto the same root —
// e.g. "allowed"/"allowing"/"allows" -> "allow").
function stem(word) {
  if (word.length <= 4) return word;
  const suffixes = ['edly', 'ing', 'ies', 'ied', 'ed', 'es', 'ly', 's'];
  for (const suf of suffixes) {
    if (word.endsWith(suf) && word.length - suf.length >= 3) {
      return word.slice(0, word.length - suf.length);
    }
  }
  return word;
}

function tokenize(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w))
    .map(stem);
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

function entryText(entry) {
  return [...(entry.keywords || []), ...(entry.question_examples || [])].join(' ');
}

// ---------------------------------------------------------------
// TF-IDF
// ---------------------------------------------------------------
function termFrequencies(tokens) {
  const tf = new Map();
  tokens.forEach((t) => tf.set(t, (tf.get(t) || 0) + 1));
  tf.forEach((count, term) => tf.set(term, count / tokens.length));
  return tf;
}

function computeIdf(corpus) {
  const df = new Map();
  corpus.forEach((tokens) => {
    new Set(tokens).forEach((t) => df.set(t, (df.get(t) || 0) + 1));
  });
  const n = corpus.length;
  const idf = new Map();
  df.forEach((count, term) => idf.set(term, Math.log((n + 1) / (count + 1)) + 1));
  return idf;
}

function tfidfVector(tokens, idf) {
  const tf = termFrequencies(tokens);
  const vec = new Map();
  tf.forEach((val, term) => vec.set(term, val * (idf.get(term) || 0)));
  return vec;
}

function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  a.forEach((val, term) => {
    normA += val * val;
    if (b.has(term)) dot += val * b.get(term);
  });
  b.forEach((val) => { normB += val * val; });
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Returns { matched: boolean, answer: string, entryId?: string, score: number }
 */
function answer(question) {
  const kb = loadKnowledgeBase();
  if (kb.length === 0) {
    return { matched: false, answer: "My knowledge base is empty right now — please ask an admin for help.", score: 0 };
  }

  const corpus = kb.map((entry) => tokenize(entryText(entry)));
  const idf = computeIdf(corpus);
  const docVectors = corpus.map((tokens) => tfidfVector(tokens, idf));
  const qVector = tfidfVector(tokenize(question), idf);

  let best = null;
  kb.forEach((entry, i) => {
    const score = cosineSimilarity(qVector, docVectors[i]);
    if (!best || score > best.score) best = { entry, score };
  });

  if (best && best.score >= MATCH_THRESHOLD) {
    return { matched: true, answer: best.entry.answer, entryId: best.entry.id, score: best.score };
  }

  return {
    matched: false,
    answer: "I'm not confident I know the answer to that one — I'm a keyword/similarity-matching helper, not a full conversational AI. An admin can help you with this in the server.",
    score: best ? best.score : 0,
  };
}

module.exports = { answer, tokenize, stem };
