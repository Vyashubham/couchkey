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
const MACROS = require('./src/macros');

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

// ── Force-open channels without waiting for console_status ──
function forceOpenChannels() {
  if (!state.sgClient || !state.sgClient._console) {
    plog('err', 'Cannot force open channels: no console connection');
    return;
  }

  const Packer = require('xbox-smartglass-core-node/src/packet/packer');
  const xbox = state.sgClient._console;

  // Channel service UUIDs (from the protocol documentation)
  const channels = [
    { name: 'SystemInput', uuid: 'fa20b8ca66fb46e0adb60b978a59d35f', clientId: 10 },
    { name: 'SystemMedia', uuid: '48a9ca24eb6d4e128c43d57469edd3cd', clientId: 11 },
    { name: 'SystemText',  uuid: '7af3e6a2488b40cba93179c04b7da3a0', clientId: 12 },
  ];

  // Listen for channel responses
  state.sgClient._events.on('_on_start_channel_response', function(response) {
    try {
      const payload = response.packet_decoded.protected_payload;
      plog('proto', `Channel response received:`, {
        channel_request_id: payload.channel_request_id,
        result: payload.result,
        target_channel_id: payload.target_channel_id,
      });

      if (payload.result === 0) {
        // Find which channel this is for by matching request ID
        const chInfo = channels.find(c => c.clientId === payload.channel_request_id);
        if (chInfo) {
          if (chInfo.name === 'SystemText') {
            // Text channel doesn't have a library manager, we track it ourselves
            state.textChannelId = payload.target_channel_id;
            state.textChannelOpen = true;
            plog('ok', `✅ Channel 'SystemText' is NOW OPEN (channelId: ${Buffer.from(payload.target_channel_id).toString('hex')})`);
          } else {
            const mgr = state.sgClient.getManager(chInfo.name === 'SystemInput' ? 'system_input' : 'system_media');
            if (mgr && mgr._channel_manager) {
              mgr._channel_manager._channel_status = true;
              mgr._channel_manager._channel_server_id = payload.target_channel_id;
              mgr._channel_manager._smartglass = state.sgClient;
              plog('ok', `✅ Channel '${chInfo.name}' is NOW OPEN (channelId: ${Buffer.from(payload.target_channel_id).toString('hex')})`);
            }
          }
        }
      } else {
        plog('err', `Channel request ${payload.channel_request_id} was REJECTED (result: ${payload.result})`);
      }
    } catch (e) {
      plog('err', `Error processing channel response: ${e.message}`);
    }
  });

  // Send channel open requests
  channels.forEach((ch, index) => {
    setTimeout(() => {
      try {
        plog('info', `Sending channel open request: ${ch.name} (uuid: ${ch.uuid}, clientId: ${ch.clientId})`);
        
        var channel_request = Packer('message.start_channel_request');
        channel_request.set('channel_request_id', ch.clientId);
        channel_request.set('title_id', 0);
        channel_request.set('service', Buffer.from(ch.uuid, 'hex'));
        channel_request.set('activity_id', 0);

        xbox.get_requestnum();
        var message = channel_request.pack(xbox);

        state.sgClient._send(message);
        plog('ok', `Channel request sent for ${ch.name}`);
      } catch (e) {
        plog('err', `Failed to send channel request for ${ch.name}: ${e.message}`, e.stack);
      }
    }, index * config.channelOpenStaggerMs);
  });
}

const { buildTextInputPacket, buildTextDonePacket } = require('./src/protocol/packets');

async function sendText(text) {
  if (!state.sgClient || !state.textChannelOpen) {
    return { ok: false, error: 'Text channel not open. Navigate to a text field on Xbox first.' };
  }
  
  plog('info', `Sending text: "${text}"`);
  
  try {
    state.textVersion++;
    state.currentText = text;
    
    state.sgClient._console.get_requestnum();
    const packet = buildTextInputPacket({
      xbox: state.sgClient._console,
      channelId: state.textChannelId,
      text,
      sessionId: state.textSessionId,
      version: state.textVersion,
    });

    state.sgClient._send(packet);
    plog('ok', `Text sent: "${text}" (session: ${state.textSessionId}, version: ${state.textVersion})`);
    
    return { ok: true, text };
  } catch (e) {
    plog('err', `Text send failed: ${e.message}`, e.stack);
    return { ok: false, error: e.message };
  }
}

async function submitText() {
  if (!state.sgClient || !state.textChannelOpen) {
    return { ok: false, error: 'Text channel not open' };
  }
  
  plog('info', `Submitting text (accepting session ${state.textSessionId})`);
  
  try {
    state.sgClient._console.get_requestnum();
    const packet = buildTextDonePacket({
      xbox: state.sgClient._console,
      channelId: state.textChannelId,
      sessionId: state.textSessionId,
      version: state.textVersion,
      result: 0,
    });

    state.sgClient._send(packet);
    state.textSessionActive = false;
    plog('ok', 'Text submitted (done with accept)');
    broadcast({ type: 'text_session', active: false });
    
    return { ok: true };
  } catch (e) {
    plog('err', `Text submit failed: ${e.message}`);
    return { ok: false, error: e.message };
  }
}

async function cancelText() {
  if (!state.sgClient || !state.textChannelOpen) {
    return { ok: false, error: 'Text channel not open' };
  }
  
  try {
    state.sgClient._console.get_requestnum();
    const packet = buildTextDonePacket({
      xbox: state.sgClient._console,
      channelId: state.textChannelId,
      sessionId: state.textSessionId,
      version: state.textVersion,
      result: 1,
    });

    state.sgClient._send(packet);
    state.textSessionActive = false;
    state.currentText = '';
    plog('ok', 'Text cancelled');
    broadcast({ type: 'text_session', active: false });
    
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// Listen for SystemTextConfiguration events (Xbox telling us a text field is active)
function setupTextEventListeners() {
  if (!state.sgClient) return;
  
  state.sgClient._events.on('_on_systemtextconfiguration', (message) => {
    try {
      const payload = message.packet_decoded.protected_payload || message.packet_decoded.decrypted_payload;
      plog('proto', 'SystemTextConfiguration received!', payload);
      state.textSessionActive = true;
      // Try to extract session_id from the payload
      if (payload && payload.text_session_id !== undefined) {
        state.textSessionId = payload.text_session_id;
      }
      state.textVersion = 0;
      state.currentText = '';
      broadcast({ type: 'text_session', active: true, sessionId: state.textSessionId });
    } catch (e) {
      plog('warn', `Could not parse text config: ${e.message}`);
      // Even if we can't parse it, mark session as active
      state.textSessionActive = true;
      state.textVersion = 0;
      state.currentText = '';
      broadcast({ type: 'text_session', active: true });
    }
  });
}

const { parseConnectionError, summarizeEventData } = require('./src/protocol/helpers');

function scheduleReconnect(ip) {
  if (state.reconnectTimer) clearTimeout(state.reconnectTimer);
  state.reconnectTimer = setTimeout(() => {
    plog('info', 'Attempting auto-reconnect...');
    connectToConsole(ip).catch(() => scheduleReconnect(ip));
  }, config.reconnectDelayMs);
}

const BUTTON_MIN_INTERVAL = config.buttonMinIntervalMs;

async function sendButton(button) {
  if (!state.sgClient) return { ok: false, error: 'No client' };
  
  const mgr = state.sgClient.getManager('system_input');
  if (!mgr) return { ok: false, error: 'No system_input manager' };
  
  const chStatus = mgr._channel_manager ? mgr._channel_manager.getStatus() : false;

  if (!chStatus) {
    plog('warn', `sendButton('${button}') — channel not open`);
    return { ok: false, error: 'Channel not ready. Try reconnecting.' };
  }

  // Throttle: wait if we sent too recently
  const now = Date.now();
  const timeSince = now - state.lastButtonTime;
  if (timeSince < BUTTON_MIN_INTERVAL) {
    await new Promise(r => setTimeout(r, BUTTON_MIN_INTERVAL - timeSince));
  }
  state.lastButtonTime = Date.now();

  try {
    await mgr.sendCommand(button);
    plog('ok', `Button '${button}' sent`);
    return { ok: true, button };
  } catch (err) {
    plog('err', `Button '${button}' failed: ${JSON.stringify(err)}`);
    return { ok: false, error: err.error || JSON.stringify(err) };
  }
}

async function runMacro(macroName) {
  const steps = MACROS[macroName];
  if (!steps) return { ok: false, error: `Unknown macro: ${macroName}` };
  plog('info', `Running macro: ${macroName} (${steps.length} steps)`);
  for (const step of steps) {
    if (step.delay > 0) await new Promise(r => setTimeout(r, step.delay));
    const result = await sendButton(step.btn);
    if (!result.ok) return result;
  }
  return { ok: true, macro: macroName };
}

async function sendMediaCommand(cmd) {
  if (!state.sgClient) return { ok: false, error: 'Not connected' };
  try {
    await state.sgClient.getManager('system_media').sendCommand(cmd);
    return { ok: true, cmd };
  } catch (err) {
    return { ok: false, error: err.error || 'Media command failed' };
  }
}

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
