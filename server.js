// Express server for hosting the N'Meboon link site as a Render Web Service.
//
// IMPORTANT: this version serves the front-end files straight from the
// project root (same folder as this file) — index.html, menu.html,
// style.css, script.js, transition.mp4, transition.webm — because that's
// how the files actually ended up in the GitHub repo (renaming files into
// a public/ subfolder isn't possible for videos through the GitHub web
// editor on mobile). Only these specific files are served, so the bot's
// source code (server.js, bot.js, otpStore.js, package.json) stays private.

const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Only these files are ever handed out — nothing else in the repo root
// (like bot.js or server.js itself) is reachable over HTTP.
const FRONTEND_FILES = [
  'index.html',
  'menu.html',
  'style.css',
  'script.js',
  'transition.mp4',
  'transition.webm',
];

FRONTEND_FILES.forEach((file) => {
  app.get('/' + file, (req, res) => {
    res.sendFile(path.join(__dirname, file), (err) => {
      if (err) res.status(404).send('Not found');
    });
  });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ---------------------------------------------------------------
// YouTube Data API v3
// ---------------------------------------------------------------
const YT_API_KEY = process.env.YOUTUBE_API_KEY;
const YT_HANDLE = process.env.YOUTUBE_HANDLE || 'NongMeboon';

// Very small in-memory cache so we don't burn API quota on every visitor.
let ytCache = { data: null, fetchedAt: 0 };
const YT_CACHE_MS = 10 * 60 * 1000; // 10 minutes

async function fetchYoutubeData() {
  if (!YT_API_KEY) {
    throw new Error('YOUTUBE_API_KEY is not set');
  }

  const now = Date.now();
  if (ytCache.data && (now - ytCache.fetchedAt) < YT_CACHE_MS) {
    return ytCache.data;
  }

  // 1) Resolve the handle to a channel (subscriber count + uploads playlist id)
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

  // 2) Grab the most recent upload from that channel's uploads playlist
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
    res.json(data);
  } catch (err) {
    console.error('YouTube API error:', err.message);
    res.status(502).json({ error: 'youtube_unavailable' });
  }
});

// Fallback: unknown routes go back to the home page.
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`N'Meboon site is running on port ${PORT}`);
});

// ---------------------------------------------------------------
// Discord bot (N'Meboon Fan Club) — starts automatically as long as
// MAIN_DISCORD_TOKEN is set in the environment.
// ---------------------------------------------------------------
require('./bot.js');
