const express = require('express');
const path = require('path');
const botController = require('./mcBot');

const app = express();
app.use(express.json());
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => res.redirect('/ai-control'));
app.get('/ai-control', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'ai-control.html'));
});

app.get('/api/status', (req, res) => {
  res.json(botController.getStatus());
});

app.post('/api/config', (req, res) => {
  try {
    const config = botController.setConfig(req.body || {});
    res.json({ ok: true, config });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.post('/api/start', async (req, res) => {
  try {
    await botController.start();
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.post('/api/stop', async (req, res) => {
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
