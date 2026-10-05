// Mount this in your main server.js:
//
//   const translateRoutes = require('./translateRoutes');
//   app.use(translateRoutes);
//
// All routes here are meant to sit BEHIND your existing admin gate — wrap
// them with whatever middleware already protects /admin-dashboard (PIN /
// Discord-ID check) before exposing this publicly. They don't do their own
// auth check beyond requiring Google OAuth to have been completed.

const express = require('express');
const path = require('path');
const auth = require('./googleAuth');
const batch = require('./youtubeTranslateBatch');

const router = express.Router();

router.get('/admin/youtube-oauth/start', (req, res) => {
  if (!auth.isConfigured()) {
    return res.status(503).send('Set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI first.');
  }
  res.redirect(auth.getAuthUrl());
});

router.get('/admin/youtube-oauth/callback', async (req, res) => {
  try {
    await auth.exchangeCodeForTokens(req.query.code);
    res.send('✅ Google account authorized. You can close this tab and go back to the admin dashboard.');
  } catch (err) {
    res.status(500).send('❌ ' + err.message);
  }
});

router.get('/admin/translate-titles', (req, res) => {
  res.sendFile(path.join(__dirname, 'translate-titles.html'));
});

router.get('/api/admin/translate-status', (req, res) => {
  res.json({ authorized: auth.hasAuthorized() });
});

// Runs one batch and streams progress lines as Server-Sent Events, so the
// page can show live progress instead of one long blocking spinner.
router.get('/api/admin/translate-run', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.flushHeaders?.();

  const send = (line) => res.write(`data: ${JSON.stringify(line)}\n\n`);
  try {
    const batchSize = Number(req.query.batchSize) || undefined;
    const result = await batch.runBatch({ batchSize, progress: send });
    send(`__DONE__${JSON.stringify(result)}`);
  } catch (err) {
    send('❌ ' + err.message);
  }
  res.end();
});

module.exports = router;
