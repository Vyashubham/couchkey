const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const config = require('./src/config');

if (config.smartglassDebug) {
  process.env.DEBUG = 'smartglass:*';
}

const Smartglass = require('xbox-smartglass-core-node');
const SystemInputChannel = require('xbox-smartglass-core-node/src/channels/systeminput');
const SystemMediaChannel = require('xbox-smartglass-core-node/src/channels/systemmedia');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const fs = require('fs');
const bus = require('./src/bus');
const state = require('./src/state');
const { plog, getRecentLogs, paths: logPaths } = require('./src/logger');

bus.on('log', entry => {
  broadcast({ type: 'log', ...entry });
});

// ── Broadcast helpers ──────────────────────────────────
function broadcast(obj) {
  const json = JSON.stringify(obj);
  wss.clients.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) ws.send(json);
  });
}

function broadcastState() {
  broadcast({ type: 'state', ...state.snapshot() });
}

// ── SmartGlass functions ───────────────────────────────
async function discoverConsoles(ip) {
  state.connectionStatus = 'discovering';
  state.lastError = null;
  broadcastState();
  plog('info', `Starting discovery${ip ? ' at ' + ip : ' (broadcast)'}...`);

  return new Promise((resolve, reject) => {
    const client = Smartglass();
    client.discovery(ip || undefined).then(consoles => {
      plog('ok', `Discovery complete. Found ${consoles.length} console(s).`);
      consoles.forEach((c, i) => {
        plog('proto', `Console #${i}:`, {
          address: c.remote.address,
          port: c.remote.port,
          name: c.message.name,
          uuid: c.message.uuid,
          certificate_length: c.message.certificate ? c.message.certificate.length : 0,
          flags: c.message.flags,
          type: c.message.type,
        });
      });
      resolve(consoles);
    }).catch(err => {
      plog('err', 'Discovery failed', err);
      reject(err);
    });
  });
}

async function connectToConsole(ip) {
  // Increment generation — any callbacks from old connections will check this
  state.connectionGeneration++;
  const myGeneration = state.connectionGeneration;

  // Clean up old client
  if (state.channelCheckInterval) { clearInterval(state.channelCheckInterval); state.channelCheckInterval = null; }
  if (state.sgClient) {
    plog('info', 'Disconnecting previous client...');
    try { state.sgClient.disconnect(); } catch (e) {}
    state.sgClient = null;
  }

  state.connectionStatus = 'connecting';
  state.lastError = null;
  state.inputReady = false;
  broadcastState();

  plog('info', `[gen:${myGeneration}] Creating SmartGlass client and connecting to ${ip}...`);
  
  state.sgClient = Smartglass();
  
  // ── Hook into ALL events for deep logging ──
  const originalEmit = state.sgClient._events.emit.bind(state.sgClient._events);
  state.sgClient._events.emit = function(eventName, ...args) {
    if (eventName !== 'newListener' && eventName !== 'receive') {
      plog('proto', `Event: ${eventName}`, summarizeEventData(eventName, args));
    }
    return originalEmit(eventName, ...args);
  };

  // Add managers BEFORE connect — this is critical
  plog('info', 'Adding SystemInput channel manager...');
  state.sgClient.addManager('system_input', SystemInputChannel());
  plog('info', 'Adding SystemMedia channel manager...');
  state.sgClient.addManager('system_media', SystemMediaChannel());

  plog('info', `Managers added. Starting connect to ${ip}...`);

  return new Promise((resolve, reject) => {
    state.sgClient.connect(ip).then(() => {
      state.connectionStatus = 'connected';
      state.connectedConsole = { ip };
      state.lastError = null;

      plog('ok', `SmartGlass connect() resolved. Connection status: ${state.sgClient.isConnected()}`);
      
      // Setup text event listeners
      setupTextEventListeners();
      // ─── WORKAROUND: Series X does not send console_status for anonymous connections ───
      // The library's channel manager waits for _on_console_status to send channel open
      // requests. On Series X, that event never fires. So we manually send the channel
      // requests ourselves, bypassing the library's wait.
      plog('info', 'Series X workaround: manually sending channel open requests (not waiting for console_status)...');
      
      setTimeout(() => {
        forceOpenChannels();
      }, config.forceOpenChannelDelayMs);

      // Also listen for _on_console_status in case it DOES fire (Xbox One, or future firmware)
      state.sgClient._events.on('_on_console_status', () => {
        plog('ok', 'console_status received! (Library will handle channel opening automatically)');
      });

      // Monitor channel status periodically
      let checkCount = 0;
      state.channelCheckInterval = setInterval(() => {
        // Bail if a newer connection replaced us
        if (myGeneration !== state.connectionGeneration) {
          clearInterval(state.channelCheckInterval);
          return;
        }
        checkCount++;
        const cs = state.getChannelStatus();
        
        if (checkCount <= 3 || checkCount % 5 === 0) {
          plog('info', `[gen:${myGeneration}] Channel check #${checkCount}:`, cs);
        }

        const allReady = Object.values(cs).every(c => c.status === true);
        if (allReady && !state.inputReady) {
          state.inputReady = true;
          plog('ok', `[gen:${myGeneration}] 🎮 ALL CHANNELS READY — input is now active!`);
          broadcastState();
          clearInterval(state.channelCheckInterval);
          state.channelCheckInterval = null;
        }

        if (checkCount >= config.channelMonitorMaxChecks) {
          clearInterval(state.channelCheckInterval);
          state.channelCheckInterval = null;
          if (!state.inputReady) {
            plog('warn', `[gen:${myGeneration}] Channels did not open after 20s.`, cs);
            state.inputReady = true;
            broadcastState();
          }
        }
        broadcastState();
      }, config.channelMonitorIntervalMs);

      broadcastState();

      // Monitor for disconnection
      state.sgClient._events.on('_on_timeout', () => {
        if (myGeneration !== state.connectionGeneration) return; // stale
        plog('err', `[gen:${myGeneration}] Connection timeout! Will reconnect in 3s...`);
        state.connectionStatus = 'disconnected';
        state.inputReady = false;
        if (state.channelCheckInterval) { clearInterval(state.channelCheckInterval); state.channelCheckInterval = null; }
        broadcastState();
        scheduleReconnect(ip);
      });

      resolve();
    }).catch(err => {
      state.connectionStatus = 'disconnected';
      state.lastError = parseConnectionError(err);
      state.inputReady = false;
      plog('err', `Connection failed: ${state.lastError}`, err);
      broadcastState();
      reject(err);
    });
  });
}

const { forceOpenChannels } = require('./src/protocol/channels');


const { parseConnectionError, summarizeEventData } = require('./src/protocol/helpers');
const {
  sendText,
  submitText,
  cancelText,
  setupTextEventListeners,
} = require('./src/xbox/text');

bus.on('text_session', payload => {
  broadcast({ type: 'text_session', ...payload });
});

function scheduleReconnect(ip) {
  if (state.reconnectTimer) clearTimeout(state.reconnectTimer);
  state.reconnectTimer = setTimeout(() => {
    plog('info', 'Attempting auto-reconnect...');
    connectToConsole(ip).catch(() => scheduleReconnect(ip));
  }, config.reconnectDelayMs);
}

const { sendButton, runMacro, sendMediaCommand } = require('./src/xbox/input');

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
  if (state.sgClient) { try { state.sgClient.disconnect(); } catch (e) {} }
  if (state.reconnectTimer) clearTimeout(state.reconnectTimer);
  state.connectionStatus = 'disconnected';
  state.inputReady = false; state.connectedConsole = null;
  state.sgClient = null;
  state.textChannelOpen = false; state.textChannelId = null; state.textSessionActive = false;
  state.textVersion = 0; state.currentText = '';
  broadcastState();
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
