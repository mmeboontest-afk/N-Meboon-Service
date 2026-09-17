// Simple Express server for hosting the N'Meboon link site as a Render Web Service.
// Serves everything inside /public as static files, plus a small /api/youtube
// endpoint that looks up subscriber count + latest video via YouTube Data API v3.
//
// Required environment variables (set these in Render → Environment):
//   YOUTUBE_API_KEY   - an API key from Google Cloud Console with
//                        "YouTube Data API v3" enabled
//   YOUTUBE_HANDLE     - channel handle without the @, e.g. NongMeboon
//                        (optional — defaults to NongMeboon)

const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

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
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`N'Meboon site is running on port ${PORT}`);
});

// ---------------------------------------------------------------
// ต่อยอดทำบอท (เช่น Discord bot) ในโปรเจกต์เดียวกัน:
//
// 1) ติดตั้งไลบรารีที่ต้องใช้ เช่น  npm install discord.js
// 2) สร้างไฟล์ bot.js แยกไว้ต่างหาก แล้วมา require ตรงนี้:
//        require('./bot.js');
//    เพื่อให้บอทเริ่มทำงานพร้อมกับตอนเว็บเซิร์ฟเวอร์ start ขึ้นมา
//
// หมายเหตุ: ถ้าบอทมีงานหนักหรืออยากแยกความรับผิดชอบชัดเจน
// แนะนำให้สร้างเป็น Render service แยกต่างหากชนิด "Background Worker"
// (ไม่ต้องเปิดพอร์ต ไม่ต้องเสิร์ฟเว็บ) แล้วรันบอทอยู่ในนั้นแทน
// จะเสถียรกว่าการฝังไว้ในเว็บเซิร์ฟเวอร์ตัวเดียวกัน
// ---------------------------------------------------------------
