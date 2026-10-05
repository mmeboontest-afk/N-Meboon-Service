// Orchestrates one batch run: fetch channel videos -> pick ones that still
// need translating (translateLogic.js, fully tested) -> detect source
// language -> translate -> write back via videos.update.
//
// ⚠️ This whole file calls real Google APIs and has NOT been run against a
// live channel — I don't have YouTube/Google OAuth access in the sandbox
// this was written in. The REQUEST SHAPES match Google's documented API
// exactly (checked against the official docs), but please run a batch of
// 1-2 videos first and check youtube studio before trusting it with your
// whole back catalog.

const auth = require('./googleAuth');
const translate = require('./googleTranslate');
const logic = require('./translateLogic');

const YT_API = 'https://www.googleapis.com/youtube/v3';
const YT_API_KEY = process.env.YOUTUBE_API_KEY;
const DEFAULT_BATCH_SIZE = 40; // ~40 videos/run keeps well under the 10,000-unit daily quota (50 units each)

async function getUploadsPlaylistId() {
  const res = await fetch(`${YT_API}/channels?part=contentDetails&mine=true`, {
    headers: { Authorization: `Bearer ${await auth.getAccessToken()}` },
  });
  const json = await res.json();
  if (!res.ok || !json.items?.length) throw new Error('Could not resolve channel: ' + JSON.stringify(json.error || json));
  return json.items[0].contentDetails.relatedPlaylists.uploads;
}

/** Fetches every video's id + current snippet/localizations (paginated). */
async function fetchAllVideos(onPage) {
  const uploadsId = await getUploadsPlaylistId();
  const videos = [];
  let pageToken = '';

  do {
    const plRes = await fetch(`${YT_API}/playlistItems?part=contentDetails&maxResults=50&playlistId=${uploadsId}&pageToken=${pageToken}&key=${YT_API_KEY}`);
    const plJson = await plRes.json();
    if (!plRes.ok) throw new Error('playlistItems fetch failed: ' + JSON.stringify(plJson.error || plJson));
    const ids = plJson.items.map((i) => i.contentDetails.videoId);

    if (ids.length) {
      const vRes = await fetch(`${YT_API}/videos?part=snippet,localizations&id=${ids.join(',')}&key=${YT_API_KEY}`);
      const vJson = await vRes.json();
      if (!vRes.ok) throw new Error('videos fetch failed: ' + JSON.stringify(vJson.error || vJson));
      for (const v of vJson.items) {
        videos.push({
          id: v.id,
          title: v.snippet.title,
          defaultLanguage: v.snippet.defaultLanguage || null,
          localizations: v.localizations || {},
        });
      }
      if (onPage) onPage(videos.length);
    }
    pageToken = plJson.nextPageToken || '';
  } while (pageToken);

  return videos;
}

/** Writes the merged localizations (and defaultLanguage, if it was missing) back to one video. */
async function updateVideoLocalizations(video, localizations, defaultLanguage) {
  const body = {
    id: video.id,
    snippet: { title: video.title, categoryId: undefined, defaultLanguage },
    localizations,
  };
  const res = await fetch(`${YT_API}/videos?part=snippet,localizations`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${await auth.getAccessToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Update failed for ${video.id}: ` + JSON.stringify(json.error || json));
  return json;
}

/**
 * Runs one batch. `progress(msg)` is called with human-readable status
 * lines as it goes, so a caller (e.g. an SSE/log stream) can show live
 * progress instead of one big blocking wait.
 */
async function runBatch({ batchSize = DEFAULT_BATCH_SIZE, progress = () => {} } = {}) {
  if (!auth.hasAuthorized()) {
    throw new Error('Not authorized with Google yet — visit /admin/youtube-oauth/start first.');
  }

  progress('Fetching channel video list…');
  const allVideos = await fetchAllVideos((n) => progress(`  …${n} videos loaded so far`));
  progress(`Found ${allVideos.length} videos total.`);

  const batch = logic.selectNextBatch(allVideos, batchSize);
  progress(`${batch.length} video(s) still need translating this run (processing up to ${batchSize} at a time to stay within API quota).`);

  let done = 0, failed = 0;
  for (const video of batch) {
    try {
      let sourceLang = logic.normalizeLangCode(video.defaultLanguage);
      if (!sourceLang) {
        sourceLang = logic.normalizeLangCode(await translate.detectLanguage(video.title));
        progress(`"${video.title.slice(0, 40)}…" — detected language: ${sourceLang}`);
      }

      const targets = logic.pickTargetLanguages(sourceLang);
      const translations = await translate.translateToMany(video.title, targets, sourceLang);
      const merged = logic.buildLocalizationsPayload(video.localizations, translations, [sourceLang]);

      await updateVideoLocalizations(video, merged, sourceLang);
      done++;
      progress(`✅ Translated "${video.title.slice(0, 40)}…" into ${targets.length} languages.`);
    } catch (err) {
      failed++;
      progress(`❌ Failed on video ${video.id}: ${err.message}`);
    }
  }

  const remaining = logic.selectNextBatch(allVideos, Infinity).length - done;
  progress(`Batch complete: ${done} updated, ${failed} failed, ~${Math.max(remaining, 0)} still remaining for future runs.`);
  return { total: allVideos.length, updatedThisRun: done, failedThisRun: failed, remaining: Math.max(remaining, 0) };
}

module.exports = { fetchAllVideos, updateVideoLocalizations, runBatch };
