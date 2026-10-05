// Thin wrapper around Google Cloud Translation API (v2, the simple REST
// one — no client library needed). Needs the Cloud Translation API
// enabled on the same Google Cloud project as your YouTube API key, and
// GOOGLE_TRANSLATE_API_KEY set (can be the same key as YOUTUBE_API_KEY if
// that key has Translation API access enabled, or a separate key — your
// call).
//
// Free tier: 500,000 characters/month. Video titles are short, so even a
// few hundred videos x ~9 target languages is nowhere close to that.

const API_KEY = process.env.GOOGLE_TRANSLATE_API_KEY || process.env.YOUTUBE_API_KEY;
const BASE = 'https://translation.googleapis.com/language/translate/v2';

async function detectLanguage(text) {
  const res = await fetch(`${BASE}/detect?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: text }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error('Language detection failed: ' + JSON.stringify(json.error || json));
  return json.data.detections[0][0].language; // e.g. "th", "en"
}

async function translateText(text, targetLang, sourceLang) {
  const body = { q: text, target: targetLang, format: 'text' };
  if (sourceLang) body.source = sourceLang;
  const res = await fetch(`${BASE}?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error('Translation failed: ' + JSON.stringify(json.error || json));
  return json.data.translations[0].translatedText;
}

/** Translates `text` into every language in `targetLangs`, in parallel. Returns { [lang]: translatedText }. */
async function translateToMany(text, targetLangs, sourceLang) {
  const entries = await Promise.all(
    targetLangs.map(async (lang) => [lang, await translateText(text, lang, sourceLang)])
  );
  return Object.fromEntries(entries);
}

module.exports = { detectLanguage, translateText, translateToMany };
