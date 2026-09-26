// Express server for hosting the N'Meboon link site as a Render Web Service.
//
// Front-end files are served straight from the project root (same folder
// as this file) — that's how they actually ended up in the GitHub repo.
// Only the files listed below are ever handed out over HTTP, so the bot's
// source code (bot.js, otpStore.js, levelSystem.js, etc.) stays private.

const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const FRONTEND_FILES = [
  'index.html',
  'menu.html',
  'check.html',
  'style.css',
  'script.js',
  'transition.mp4',
  'transition.webm',
];

FRONTEND_FILES.forEach((file) => {
  app.get('/' + file, (req, res) => {
    res.sendFile(path.join(__dirname, file), (err) => {
      if (err) res.status(404).sendFile(path.join(__dirname, '404.html'));
    });
  });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Friendly URL for the status page (no .html needed)
app.get('/check', (req, res) => {
  res.sendFile(path.join(__dirname, 'check.html'));
});

// ---------------------------------------------------------------
// YouTube Data API v3
// ---------------------------------------------------------------
const YT_API_KEY = process.env.YOUTUBE_API_KEY;
const YT_HANDLE = process.env.YOUTUBE_HANDLE || 'NongMeboon';

let ytCache = { data: null, fetchedAt: 0 };
const YT_CACHE_MS = 10 * 60 * 1000; // 10 minutes

// Tracked separately from the cache so /api/status can report health even
// when a cached value is still being served.
let ytStatus = { ok: null, checkedAt: null, error: null };

async function fetchYoutubeData() {
  if (!YT_API_KEY) {
    throw new Error('YOUTUBE_API_KEY is not set');
  }

  const now = Date.now();
  if (ytCache.data && (now - ytCache.fetchedAt) < YT_CACHE_MS) {
    return ytCache.data;
  }

  const channelUrl = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&forHandle=${encodeURIComponent(YT_HANDLE)}&key=${YT_API_KEY}`;
  const channelRes = await fetch(channelUrl);
  const channelJson = await channelRes.json();
  if (!channelRes.ok || !channelJson.items || !channelJson.items.length) {
    throw new Error('Channel not found: ' + JSON.stringify(channelJson.error || channelJson));
  }
  const channel = channelJson.items[0];
  const uploadsPlaylistId = channel.contentDetails.relatedPlaylists.uploads;
  const subscriberCount = channel.statistics.hiddenSubscriberCount
    ? null
    : Number(channel.statistics.subscriberCount);

  let latestVideo = null;
  const plUrl = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${uploadsPlaylistId}&maxResults=1&key=${YT_API_KEY}`;
  const plRes = await fetch(plUrl);
  const plJson = await plRes.json();
  if (plRes.ok && plJson.items && plJson.items.length) {
    const item = plJson.items[0].snippet;
    latestVideo = {
      videoId: item.resourceId.videoId,
      videoTitle: item.title,
      videoThumbnail: (item.thumbnails.maxres || item.thumbnails.high || item.thumbnails.medium || item.thumbnails.default).url,
      videoPublishedAt: item.publishedAt,
    };
  }

  const result = {
    channelTitle: channel.snippet.title,
    channelThumbnail: channel.snippet.thumbnails.default.url,
    subscriberCount,
    ...latestVideo,
  };

  ytCache = { data: result, fetchedAt: now };
  return result;
}

app.get('/api/youtube', async (req, res) => {
  try {
    const data = await fetchYoutubeData();
    ytStatus = { ok: true, checkedAt: Date.now(), error: null };
    res.json(data);
  } catch (err) {
    ytStatus = { ok: false, checkedAt: Date.now(), error: err.message };
    console.error('YouTube API error:', err.message);
    res.status(502).json({ error: 'youtube_unavailable' });
  }
});

// ---------------------------------------------------------------
// Discord bot (required below) — captured here so /api/status can report
// whether it's actually connected right now.
// ---------------------------------------------------------------
const botClient = require('./bot.js');

// ---------------------------------------------------------------
// Public status endpoint — no tokens/keys/secrets, just up/down state.
// ---------------------------------------------------------------
app.get('/api/status', async (req, res) => {
  const status = {
    website: { status: 'ok', detail: 'Serving requests normally' },
    discordBot: { status: 'down', detail: 'Not connected' },
    youtubeApi: { status: 'warn', detail: 'Not checked yet' },
  };

  // Discord bot
  if (!process.env.MAIN_DISCORD_TOKEN) {
    status.discordBot = { status: 'warn', detail: 'Bot token not configured' };
  } else if (botClient && botClient.isReady && botClient.isReady()) {
    status.discordBot = { status: 'ok', detail: `Connected as ${botClient.user.tag}` };
  } else {
    status.discordBot = { status: 'down', detail: 'Bot is not connected right now' };
  }

  // YouTube integration
  if (!YT_API_KEY) {
    status.youtubeApi = { status: 'warn', detail: 'API key not configured' };
  } else if (ytStatus.ok === true) {
    status.youtubeApi = { status: 'ok', detail: 'Last check succeeded' };
  } else if (ytStatus.ok === false) {
    status.youtubeApi = { status: 'down', detail: 'Last check failed — could not reach YouTube' };
  } else {
    // Never checked yet this run — do a live check now so /check isn't stuck on "Not checked yet"
    try {
      await fetchYoutubeData();
      status.youtubeApi = { status: 'ok', detail: 'Last check succeeded' };
    } catch {
      status.youtubeApi = { status: 'down', detail: 'Could not reach YouTube' };
    }
  }

  res.json(status);
});

// Fallback: anything else is a genuine 404.
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, '404.html'));
});

app.listen(PORT, () => {
  console.log(`N'Meboon site is running on port ${PORT}`);
});
