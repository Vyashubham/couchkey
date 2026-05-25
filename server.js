const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');

const config = require('./src/config');

if (config.smartglassDebug) {
  process.env.DEBUG = 'smartglass:*';
}

const bus = require('./src/bus');
const state = require('./src/state');
const { plog, getRecentLogs, paths: logPaths } = require('./src/logger');
const { discoverConsoles, connectToConsole, disconnect } = require('./src/xbox/connection');
const { sendButton, runMacro, sendMediaCommand } = require('./src/xbox/input');
const { sendText, submitText, cancelText } = require('./src/xbox/text');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

function broadcast(obj) {
  const json = JSON.stringify(obj);
  wss.clients.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) ws.send(json);
  });
}

bus.on('log', entry => broadcast({ type: 'log', ...entry }));
bus.on('state', snapshot => broadcast({ type: 'state', ...snapshot }));
bus.on('text_session', payload => broadcast({ type: 'text_session', ...payload }));

// ── Express ────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

app.get('/api/status', (req, res) => {
  res.json(state.snapshot());
});

app.get('/api/logs', (req, res) => {
  res.json(getRecentLogs(200));
});

// Download the current session log file
app.get('/api/logs/download', (req, res) => {
  if (fs.existsSync(logPaths.sessionLog)) {
    res.download(logPaths.sessionLog);
  } else {
    res.status(404).json({ error: 'No log file yet' });
  }
});

// Download the JSONL structured log
app.get('/api/logs/download-json', (req, res) => {
  if (fs.existsSync(logPaths.sessionJson)) {
    res.download(logPaths.sessionJson);
  } else {
    res.status(404).json({ error: 'No log file yet' });
  }
});

// List all saved log files
app.get('/api/logs/list', (req, res) => {
  if (!fs.existsSync(logPaths.logDir)) return res.json([]);
  const files = fs.readdirSync(logPaths.logDir)
    .filter(f => f.startsWith('session-') && f.endsWith('.log'))
    .map(f => ({
      name: f,
      size: fs.statSync(path.join(logPaths.logDir, f)).size,
      modified: fs.statSync(path.join(logPaths.logDir, f)).mtime,
    }))
    .sort((a, b) => b.modified - a.modified);
  res.json(files);
});

app.post('/api/discover', async (req, res) => {
  try {
    const consoles = await discoverConsoles(req.body.ip);
    res.json({ ok: true, consoles: consoles.map(c => ({
      name: c.message.name || 'Xbox',
      ip: c.remote.address,
      type: c.message.type,
    }))});
  } catch (err) {
    res.json({ ok: false, error: err.message || 'Discovery failed' });
  }
});

app.post('/api/connect', async (req, res) => {
  try {
    await connectToConsole(req.body.ip);
    res.json({ ok: true });
  } catch (err) {
    res.json({ ok: false, error: state.lastError || 'Connection failed' });
  }
});

app.post('/api/disconnect', (req, res) => {
  disconnect();
  res.json({ ok: true });
});

// ── WebSocket ──────────────────────────────────────────
wss.on('connection', (ws) => {
  plog('info', 'GUI client connected via WebSocket');
  // Send current state + recent logs
  ws.send(JSON.stringify({ type: 'state', ...state.snapshot() }));
  getRecentLogs(config.websocketLogReplayCount).forEach(entry => {
    ws.send(JSON.stringify({ type: 'log', ...entry }));
  });

  ws.on('message', async (raw) => {
    try {
      const msg = JSON.parse(raw);
      switch (msg.type) {
        case 'button': {
          const result = await sendButton(msg.button);
          ws.send(JSON.stringify({ type: 'input_ack', ...result }));
          break;
        }
        case 'macro': {
          const result = await runMacro(msg.name);
          ws.send(JSON.stringify({ type: 'macro_ack', ...result }));
          break;
        }
        case 'media': {
          const result = await sendMediaCommand(msg.command);
          ws.send(JSON.stringify({ type: 'media_ack', ...result }));
          break;
        }
        case 'text': {
          const result = await sendText(msg.text);
          ws.send(JSON.stringify({ type: 'text_ack', ...result }));
          break;
        }
        case 'text_submit': {
          const result = await submitText();
          ws.send(JSON.stringify({ type: 'text_submit_ack', ...result }));
          break;
        }
        case 'text_cancel': {
          const result = await cancelText();
          ws.send(JSON.stringify({ type: 'text_cancel_ack', ...result }));
          break;
        }
      }
    } catch (err) {
      ws.send(JSON.stringify({ type: 'error', error: err.message }));
    }
  });
});

const PORT = config.port;
server.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║      🎮  Xbox Remote Control — DIAGNOSTIC MODE  🎮      ║
║                                                          ║
║   http://localhost:${PORT}                                 ║
║                                                          ║
║   📝 Logs saved to:                                      ║
║   ${logPaths.sessionLog.padEnd(55)}║
║                                                          ║
║   Also: ${logPaths.latestLog}                  ║
╚══════════════════════════════════════════════════════════╝
  `);
});
