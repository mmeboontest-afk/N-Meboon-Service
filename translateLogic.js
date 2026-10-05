// Pure decision logic for the video-title translation system — no network
// calls in this file at all, so every rule here is unit-testable without
// hitting YouTube or Google Translate.

// Covers Thai + the languages explicitly requested (English, Chinese,
// Japanese, Korean, Indonesian) plus the next-most-common languages people
// actually see on Thai gaming/content channels. Add/remove freely — this
// list alone controls which languages get generated.
const SUPPORTED_LANGUAGES = [
  { code: 'th', name: 'Thai' },
  { code: 'en', name: 'English' },
  { code: 'zh-Hans', name: 'Chinese (Simplified)' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'id', name: 'Indonesian' },
  { code: 'vi', name: 'Vietnamese' },
  { code: 'es', name: 'Spanish' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'hi', name: 'Hindi' },
];

// Google Translate returns codes like "zh-CN"/"zh" for Chinese and plain
// "iw" for Hebrew etc. — normalize the ones likely to show up so we don't
// accidentally treat "the detected source language" and "our zh-Hans
// target" as different languages when they're really the same.
const LANG_ALIASES = { zh: 'zh-Hans', 'zh-cn': 'zh-Hans', 'zh-tw': 'zh-Hans', iw: 'he' };

function normalizeLangCode(code) {
  if (!code) return code;
  const lower = code.toLowerCase();
  return LANG_ALIASES[lower] || code;
}

/**
 * Given the video's detected/declared source language, returns the list of
 * language codes we should generate translations FOR (every supported
 * language except the one the title is already in).
 */
function pickTargetLanguages(sourceLangCode, supported = SUPPORTED_LANGUAGES) {
  const normalizedSource = normalizeLangCode(sourceLangCode);
  return supported.map((l) => l.code).filter((code) => code !== normalizedSource);
}

/**
 * Merges newly-translated titles into a video's EXISTING localizations
 * object. YouTube deletes any localization you don't re-include in an
 * update request, so this always starts from what's already there.
 *
 * @param existingLocalizations  the video's current `localizations` object (or {})
 * @param translations           { [langCode]: translatedTitle }
 * @param skipLangCodes          language codes to leave untouched/unset (e.g. the source language)
 */
function buildLocalizationsPayload(existingLocalizations, translations, skipLangCodes = []) {
  const merged = { ...existingLocalizations };
  for (const [langCode, title] of Object.entries(translations)) {
    if (skipLangCodes.includes(langCode)) continue;
    if (!title) continue;
    merged[langCode] = { ...(merged[langCode] || {}), title };
  }
  return merged;
}

/**
 * Decides whether a video actually needs (re)processing this run — skips
 * videos that already have a title localization for every supported
 * language, so re-running the batch job doesn't waste translation/API
 * quota re-doing finished videos.
 */
function needsTranslation(video, supported = SUPPORTED_LANGUAGES) {
  const existing = video.localizations || {};
  const sourceLang = normalizeLangCode(video.defaultLanguage);
  const targets = pickTargetLanguages(sourceLang, supported);
  return targets.some((code) => !existing[code] || !existing[code].title);
}

/** Picks up to `limit` videos that still need work — for quota-aware batching. */
function selectNextBatch(videos, limit, supported = SUPPORTED_LANGUAGES) {
  return videos.filter((v) => needsTranslation(v, supported)).slice(0, limit);
}

module.exports = {
  SUPPORTED_LANGUAGES,
  normalizeLangCode,
  pickTargetLanguages,
  buildLocalizationsPayload,
  needsTranslation,
  selectNextBatch,
};
