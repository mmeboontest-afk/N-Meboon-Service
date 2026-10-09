const express = require('express');
const path = require('path');
const botController = require('./mcBot');
const controlAuth = require('./controlAuth');

const app = express();
app.use(express.json());
const PORT = process.env.PORT || 3000;

// Public — plain landing page, no bot info, so casually finding this URL
// doesn't reveal that a control panel even exists here.
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'home.html'));
});

// The control page itself is public to LOAD (just HTML/JS), but every API
// call it makes is gated — so without the PIN you only ever see a lock
// screen, never any bot data.
app.get('/ai-control', (req, res) => {
  res.sendFile(path.join(__dirname, 'ai-control.html'));
});

app.post('/api/login', (req, res) => {
  const result = controlAuth.login(req, res, (req.body || {}).pin);
  res.status(result.ok ? 200 : 401).json(result);
});

app.get('/api/status', controlAuth.requireAuth, (req, res) => {
  res.json(botController.getStatus());
});

app.post('/api/config', controlAuth.requireAuth, (req, res) => {
  try {
    const config = botController.setConfig(req.body || {});
    res.json({ ok: true, config });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.post('/api/start', controlAuth.requireAuth, async (req, res) => {
  try {
    await botController.start();
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.post('/api/stop', controlAuth.requireAuth, async (req, res) => {
  try {
    await botController.stop();
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.use((req, res) => res.status(404).json({ error: 'not_found' }));

app.listen(PORT, () => {
  console.log(`MC bot control panel running on port ${PORT}`);
});
