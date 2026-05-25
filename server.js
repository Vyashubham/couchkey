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

// ── State ──────────────────────────────────────────────
let sgClient = null;
let connectionStatus = 'disconnected';
let connectedConsole = null;
let lastError = null;
let inputReady = false;
let reconnectTimer = null;

// ── Text channel state ─────────────────────────────────
let textChannelId = null;
let textChannelOpen = false;
let textSessionId = 0;
let textVersion = 0;
let currentText = '';
let textSessionActive = false;

// ── File logging ───────────────────────────────────────
const fs = require('fs');
const LOG_DIR = config.logDir;
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

const sessionTimestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const LOG_FILE = path.join(LOG_DIR, `session-${sessionTimestamp}.log`);
const LOG_FILE_JSON = path.join(LOG_DIR, `session-${sessionTimestamp}.jsonl`);

// Also maintain a "latest" symlink/copy for convenience
const LATEST_LOG = path.join(LOG_DIR, 'latest.log');
const LATEST_JSON = path.join(LOG_DIR, 'latest.jsonl');

console.log(`📝 Logs saving to: ${LOG_FILE}`);

// All protocol logs stored here for the GUI
const protocolLogs = [];
function plog(level, msg, data) {
  const entry = {
    time: new Date().toISOString(),
    level, // 'info' | 'ok' | 'warn' | 'err' | 'proto'
    msg,
    data: data ? JSON.stringify(data, null, 2) : undefined,
  };
  protocolLogs.push(entry);
  if (protocolLogs.length > config.protocolLogRingBufferSize) protocolLogs.shift();
  
  // Console output
  const icons = { info: '🔵', ok: '✅', warn: '⚠️', err: '❌', proto: '📡' };
  console.log(`${icons[level] || '·'} ${msg}`);
  if (data) console.log('  ', typeof data === 'string' ? data : JSON.stringify(data, null, 2));
  
  // File output — human-readable log
  const timeShort = entry.time.slice(11, 23);
  const levelPad = level.toUpperCase().padEnd(5);
  let logLine = `[${timeShort}] ${levelPad} ${msg}\n`;
  if (entry.data) logLine += `               ${entry.data}\n`;
  fs.appendFile(LOG_FILE, logLine, () => {});
  fs.appendFile(LATEST_LOG, logLine, () => {});
  
  // File output — structured JSONL (one JSON object per line, easy to parse)
  fs.appendFile(LOG_FILE_JSON, JSON.stringify(entry) + '\n', () => {});
  fs.appendFile(LATEST_JSON, JSON.stringify(entry) + '\n', () => {});
  
  // Push to all websocket clients
  broadcast({ type: 'log', ...entry });
}

// ── Macro definitions ──────────────────────────────────
const MACROS = {
  'open_guide':      [{ btn: 'nexus', delay: 0 }],
  'go_home':         [{ btn: 'nexus', delay: 0 }, { btn: 'a', delay: 500 }],
  'open_search':     [{ btn: 'nexus', delay: 0 }, { btn: 'y', delay: 500 }],
  'screenshot':      [{ btn: 'nexus', delay: 0 }, { btn: 'y', delay: 500 }],
  'record_clip':     [{ btn: 'nexus', delay: 0 }, { btn: 'x', delay: 500 }],
  'quick_settings':  [
    { btn: 'nexus', delay: 0 },
    { btn: 'right', delay: 400 }, { btn: 'right', delay: 200 },
    { btn: 'right', delay: 200 }, { btn: 'right', delay: 200 }
  ],
  'parties':         [{ btn: 'nexus', delay: 0 }, { btn: 'right', delay: 400 }],
};

// ── Broadcast helpers ──────────────────────────────────
function broadcast(obj) {
  const json = JSON.stringify(obj);
  wss.clients.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) ws.send(json);
  });
}

function broadcastState() {
  broadcast({
    type: 'state',
    status: connectionStatus,
    console: connectedConsole,
    inputReady,
    lastError,
    activeApp: sgClient ? sgClient.getActiveApp() : null,
    channelStatus: getChannelStatus(),
  });
}

function getChannelStatus() {
  if (!sgClient) return {};
  const result = {};
  for (const name of Object.keys(sgClient._managers)) {
    const mgr = sgClient._managers[name];
    result[name] = {
      status: mgr._channel_manager ? mgr._channel_manager.getStatus() : 'unknown',
      channelId: mgr._channel_manager ? mgr._channel_manager._channel_server_id : null,
      clientId: mgr._channel_manager ? mgr._channel_manager._channel_client_id : null,
    };
  }
  result.system_text = {
    status: textChannelOpen,
    channelId: textChannelId ? Buffer.from(textChannelId).toString('hex') : null,
    sessionActive: textSessionActive,
  };
  return result;
}

// ── SmartGlass functions ───────────────────────────────
async function discoverConsoles(ip) {
  connectionStatus = 'discovering';
  lastError = null;
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

// Track connection generation to prevent stale clients from interfering
let connectionGeneration = 0;
let channelCheckInterval = null;

async function connectToConsole(ip) {
  // Increment generation — any callbacks from old connections will check this
  connectionGeneration++;
  const myGeneration = connectionGeneration;

  // Clean up old client
  if (channelCheckInterval) { clearInterval(channelCheckInterval); channelCheckInterval = null; }
  if (sgClient) {
    plog('info', 'Disconnecting previous client...');
    try { sgClient.disconnect(); } catch (e) {}
    sgClient = null;
  }

  connectionStatus = 'connecting';
  lastError = null;
  inputReady = false;
  broadcastState();

  plog('info', `[gen:${myGeneration}] Creating SmartGlass client and connecting to ${ip}...`);
  
  sgClient = Smartglass();
  
  // ── Hook into ALL events for deep logging ──
  const originalEmit = sgClient._events.emit.bind(sgClient._events);
  sgClient._events.emit = function(eventName, ...args) {
    if (eventName !== 'newListener' && eventName !== 'receive') {
      plog('proto', `Event: ${eventName}`, summarizeEventData(eventName, args));
    }
    return originalEmit(eventName, ...args);
  };

  // Add managers BEFORE connect — this is critical
  plog('info', 'Adding SystemInput channel manager...');
  sgClient.addManager('system_input', SystemInputChannel());
  plog('info', 'Adding SystemMedia channel manager...');
  sgClient.addManager('system_media', SystemMediaChannel());

  plog('info', `Managers added. Starting connect to ${ip}...`);

  return new Promise((resolve, reject) => {
    sgClient.connect(ip).then(() => {
      connectionStatus = 'connected';
      connectedConsole = { ip };
      lastError = null;

      plog('ok', `SmartGlass connect() resolved. Connection status: ${sgClient.isConnected()}`);
      
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
      sgClient._events.on('_on_console_status', () => {
        plog('ok', 'console_status received! (Library will handle channel opening automatically)');
      });

      // Monitor channel status periodically
      let checkCount = 0;
      channelCheckInterval = setInterval(() => {
        // Bail if a newer connection replaced us
        if (myGeneration !== connectionGeneration) {
          clearInterval(channelCheckInterval);
          return;
        }
        checkCount++;
        const cs = getChannelStatus();
        
        if (checkCount <= 3 || checkCount % 5 === 0) {
          plog('info', `[gen:${myGeneration}] Channel check #${checkCount}:`, cs);
        }

        const allReady = Object.values(cs).every(c => c.status === true);
        if (allReady && !inputReady) {
          inputReady = true;
          plog('ok', `[gen:${myGeneration}] 🎮 ALL CHANNELS READY — input is now active!`);
          broadcastState();
          clearInterval(channelCheckInterval);
          channelCheckInterval = null;
        }

        if (checkCount >= config.channelMonitorMaxChecks) {
          clearInterval(channelCheckInterval);
          channelCheckInterval = null;
          if (!inputReady) {
            plog('warn', `[gen:${myGeneration}] Channels did not open after 20s.`, cs);
            inputReady = true;
            broadcastState();
          }
        }
        broadcastState();
      }, config.channelMonitorIntervalMs);

      broadcastState();

      // Monitor for disconnection
      sgClient._events.on('_on_timeout', () => {
        if (myGeneration !== connectionGeneration) return; // stale
        plog('err', `[gen:${myGeneration}] Connection timeout! Will reconnect in 3s...`);
        connectionStatus = 'disconnected';
        inputReady = false;
        if (channelCheckInterval) { clearInterval(channelCheckInterval); channelCheckInterval = null; }
        broadcastState();
        scheduleReconnect(ip);
      });

      resolve();
    }).catch(err => {
      connectionStatus = 'disconnected';
      lastError = parseConnectionError(err);
      inputReady = false;
      plog('err', `Connection failed: ${lastError}`, err);
      broadcastState();
      reject(err);
    });
  });
}

// ── Force-open channels without waiting for console_status ──
function forceOpenChannels() {
  if (!sgClient || !sgClient._console) {
    plog('err', 'Cannot force open channels: no console connection');
    return;
  }

  const Packer = require('xbox-smartglass-core-node/src/packet/packer');
  const xbox = sgClient._console;

  // Channel service UUIDs (from the protocol documentation)
  const channels = [
    { name: 'SystemInput', uuid: 'fa20b8ca66fb46e0adb60b978a59d35f', clientId: 10 },
    { name: 'SystemMedia', uuid: '48a9ca24eb6d4e128c43d57469edd3cd', clientId: 11 },
    { name: 'SystemText',  uuid: '7af3e6a2488b40cba93179c04b7da3a0', clientId: 12 },
  ];

  // Listen for channel responses
  sgClient._events.on('_on_start_channel_response', function(response) {
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
            textChannelId = payload.target_channel_id;
            textChannelOpen = true;
            plog('ok', `✅ Channel 'SystemText' is NOW OPEN (channelId: ${Buffer.from(payload.target_channel_id).toString('hex')})`);
          } else {
            const mgr = sgClient.getManager(chInfo.name === 'SystemInput' ? 'system_input' : 'system_media');
            if (mgr && mgr._channel_manager) {
              mgr._channel_manager._channel_status = true;
              mgr._channel_manager._channel_server_id = payload.target_channel_id;
              mgr._channel_manager._smartglass = sgClient;
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

        sgClient._send(message);
        plog('ok', `Channel request sent for ${ch.name}`);
      } catch (e) {
        plog('err', `Failed to send channel request for ${ch.name}: ${e.message}`, e.stack);
      }
    }, index * config.channelOpenStaggerMs);
  });
}

// ── Text input via raw SmartGlass protocol ─────────────
// The Node.js library doesn't implement text messages, so we build raw packets.
// Protocol: SystemTextInput (0xF2C) sends text on the SystemText channel.
// 
// The approach: instead of implementing the full text session protocol
// (which requires tracking TextConfiguration events, session IDs, versions, and acks),
// we take a simpler approach that works: we send each character as a gamepad d-pad
// navigation on the Xbox's on-screen keyboard... NO — that's too slow.
//
// Better: we build a raw SystemTextInput packet ourselves using the library's
// crypto infrastructure. The text message payload format (from C# source):
//   - text_session_id: uint32
//   - text_version: uint32  
//   - flags: uint16 (0 = text delta)
//   - text_chunk_size: uint16
//   - text_chunk: SGString (the actual text)
//   - delta_offset: uint32 (byte offset where replacement starts)
//   - delta_length: uint32 (number of bytes to replace)
//   - selection_start: uint32 (cursor position)
//   - selection_length: uint32 (selection length)

function buildTextInputPacket(text, sessionId, version) {
  if (!sgClient || !sgClient._console || !textChannelId) {
    plog('err', 'Cannot send text: no text channel');
    return null;
  }
  
  const PacketStructure = require('xbox-smartglass-core-node/src/packet/structure');
  const xbox = sgClient._console;
  
  // Build the payload
  const payload = PacketStructure();
  payload.writeUInt32(sessionId);           // text_session_id
  payload.writeUInt32(version);             // text_version  
  payload.writeUInt16(0);                   // flags (0 = replace)
  payload.writeSGString(text);              // text_chunk (the full text)

  // Build header
  const header = PacketStructure();
  header.writeBytes(Buffer.from('d00d', 'hex'));           // packet type
  header.writeUInt16(payload.toBuffer().length);           // payload length
  header.writeUInt32(xbox._request_num);                   // sequence number
  header.writeUInt32(xbox._target_participant_id);         // target
  header.writeUInt32(xbox._source_participant_id);         // source
  header.writeBytes(Buffer.from('af2c', 'hex'));           // flags: version=2, need_ack=1, type=0xF2C (SystemTextInput)
  header.writeBytes(Buffer.from(textChannelId));           // channel ID
  
  // Pad payload to 16-byte alignment
  let payloadBuf = payload.toBuffer();
  if (payloadBuf.length % 16 > 0) {
    const padLen = 16 - (payloadBuf.length % 16);
    const padding = Buffer.alloc(padLen, padLen);
    payloadBuf = Buffer.concat([payloadBuf, padding]);
  }
  
  // Encrypt
  const key = xbox._crypto._encrypt(header.toBuffer().slice(0, 16), xbox._crypto.getIv());
  const encrypted = xbox._crypto._encrypt(payloadBuf, xbox._crypto.getEncryptionKey(), key);
  
  // Assemble
  let packet = Buffer.concat([header.toBuffer(), encrypted]);
  
  // Sign
  const hash = xbox._crypto._sign(packet);
  packet = Buffer.concat([packet, Buffer.from(hash)]);
  
  return packet;
}

function buildTextDonePacket(sessionId, version, result) {
  if (!sgClient || !sgClient._console || !textChannelId) return null;
  
  const PacketStructure = require('xbox-smartglass-core-node/src/packet/structure');
  const xbox = sgClient._console;
  
  // Payload: session_id (uint32), version (uint32), flags (uint16), result (uint32)
  const payload = PacketStructure();
  payload.writeUInt32(sessionId);
  payload.writeUInt32(version);
  payload.writeUInt16(0);             // flags
  payload.writeUInt32(result);        // 0 = Accept, 1 = Cancel
  
  const header = PacketStructure();
  header.writeBytes(Buffer.from('d00d', 'hex'));
  header.writeUInt16(payload.toBuffer().length);
  header.writeUInt32(xbox._request_num);
  header.writeUInt32(xbox._target_participant_id);
  header.writeUInt32(xbox._source_participant_id);
  header.writeBytes(Buffer.from('af35', 'hex'));  // SystemTextDone
  header.writeBytes(Buffer.from(textChannelId));
  
  let payloadBuf = payload.toBuffer();
  if (payloadBuf.length % 16 > 0) {
    const padLen = 16 - (payloadBuf.length % 16);
    payloadBuf = Buffer.concat([payloadBuf, Buffer.alloc(padLen, padLen)]);
  }
  
  const key = xbox._crypto._encrypt(header.toBuffer().slice(0, 16), xbox._crypto.getIv());
  const encrypted = xbox._crypto._encrypt(payloadBuf, xbox._crypto.getEncryptionKey(), key);
  let packet = Buffer.concat([header.toBuffer(), encrypted]);
  packet = Buffer.concat([packet, Buffer.from(xbox._crypto._sign(packet))]);
  
  return packet;
}

async function sendText(text) {
  if (!sgClient || !textChannelOpen) {
    return { ok: false, error: 'Text channel not open. Navigate to a text field on Xbox first.' };
  }
  
  plog('info', `Sending text: "${text}"`);
  
  try {
    textVersion++;
    currentText = text;
    
    sgClient._console.get_requestnum();
    const packet = buildTextInputPacket(text, textSessionId, textVersion);
    if (!packet) return { ok: false, error: 'Failed to build text packet' };
    
    sgClient._send(packet);
    plog('ok', `Text sent: "${text}" (session: ${textSessionId}, version: ${textVersion})`);
    
    return { ok: true, text };
  } catch (e) {
    plog('err', `Text send failed: ${e.message}`, e.stack);
    return { ok: false, error: e.message };
  }
}

async function submitText() {
  if (!sgClient || !textChannelOpen) {
    return { ok: false, error: 'Text channel not open' };
  }
  
  plog('info', `Submitting text (accepting session ${textSessionId})`);
  
  try {
    sgClient._console.get_requestnum();
    const packet = buildTextDonePacket(textSessionId, textVersion, 0); // 0 = Accept
    if (!packet) return { ok: false, error: 'Failed to build text done packet' };
    
    sgClient._send(packet);
    textSessionActive = false;
    plog('ok', 'Text submitted (done with accept)');
    broadcast({ type: 'text_session', active: false });
    
    return { ok: true };
  } catch (e) {
    plog('err', `Text submit failed: ${e.message}`);
    return { ok: false, error: e.message };
  }
}

async function cancelText() {
  if (!sgClient || !textChannelOpen) {
    return { ok: false, error: 'Text channel not open' };
  }
  
  try {
    sgClient._console.get_requestnum();
    const packet = buildTextDonePacket(textSessionId, textVersion, 1); // 1 = Cancel
    if (!packet) return { ok: false, error: 'Failed to build cancel packet' };
    
    sgClient._send(packet);
    textSessionActive = false;
    currentText = '';
    plog('ok', 'Text cancelled');
    broadcast({ type: 'text_session', active: false });
    
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// Listen for SystemTextConfiguration events (Xbox telling us a text field is active)
function setupTextEventListeners() {
  if (!sgClient) return;
  
  sgClient._events.on('_on_systemtextconfiguration', (message) => {
    try {
      const payload = message.packet_decoded.protected_payload || message.packet_decoded.decrypted_payload;
      plog('proto', 'SystemTextConfiguration received!', payload);
      textSessionActive = true;
      // Try to extract session_id from the payload
      if (payload && payload.text_session_id !== undefined) {
        textSessionId = payload.text_session_id;
      }
      textVersion = 0;
      currentText = '';
      broadcast({ type: 'text_session', active: true, sessionId: textSessionId });
    } catch (e) {
      plog('warn', `Could not parse text config: ${e.message}`);
      // Even if we can't parse it, mark session as active
      textSessionActive = true;
      textVersion = 0;
      currentText = '';
      broadcast({ type: 'text_session', active: true });
    }
  });
}

function summarizeEventData(eventName, args) {
  try {
    if (args[0] && args[0].packet_decoded) {
      const pd = args[0].packet_decoded;
      return {
        type: pd.type,
        name: pd.name || args[0].name,
        flags: pd.flags,
        sequence_number: pd.sequence_number,
        source_participant_id: pd.source_participant_id,
        target_participant_id: pd.target_participant_id,
        protected_payload: pd.protected_payload ? {
          ...pd.protected_payload,
          // Truncate long fields
          certificate: pd.protected_payload.certificate ? `[${pd.protected_payload.certificate.length} bytes]` : undefined,
        } : undefined,
      };
    }
    return { arg_count: args.length };
  } catch (e) {
    return { error: 'Could not summarize', detail: e.message };
  }
}

function parseConnectionError(err) {
  if (err && err.message) {
    if (err.message.includes('anonymous')) {
      return 'Xbox is blocking anonymous connections. Go to Settings → Devices & connections → Remote features → Allow connections from any device.';
    }
    if (err.message.includes('disabled')) {
      return 'SmartGlass is disabled on your Xbox. Enable Remote features in Settings.';
    }
    return err.message;
  }
  if (err && err.error) return err.error;
  return JSON.stringify(err);
}

function scheduleReconnect(ip) {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    plog('info', 'Attempting auto-reconnect...');
    connectToConsole(ip).catch(() => scheduleReconnect(ip));
  }, config.reconnectDelayMs);
}

// ── Button send with throttle ──────────────────────────
let lastButtonTime = 0;
const BUTTON_MIN_INTERVAL = config.buttonMinIntervalMs;
let buttonQueue = [];
let buttonProcessing = false;

async function sendButton(button) {
  if (!sgClient) return { ok: false, error: 'No client' };
  
  const mgr = sgClient.getManager('system_input');
  if (!mgr) return { ok: false, error: 'No system_input manager' };
  
  const chStatus = mgr._channel_manager ? mgr._channel_manager.getStatus() : false;

  if (!chStatus) {
    plog('warn', `sendButton('${button}') — channel not open`);
    return { ok: false, error: 'Channel not ready. Try reconnecting.' };
  }

  // Throttle: wait if we sent too recently
  const now = Date.now();
  const timeSince = now - lastButtonTime;
  if (timeSince < BUTTON_MIN_INTERVAL) {
    await new Promise(r => setTimeout(r, BUTTON_MIN_INTERVAL - timeSince));
  }
  lastButtonTime = Date.now();

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
  if (!sgClient) return { ok: false, error: 'Not connected' };
  try {
    await sgClient.getManager('system_media').sendCommand(cmd);
    return { ok: true, cmd };
  } catch (err) {
    return { ok: false, error: err.error || 'Media command failed' };
  }
}

// ── Express ────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

app.get('/api/status', (req, res) => {
  res.json({
    status: connectionStatus, console: connectedConsole,
    inputReady, lastError,
    activeApp: sgClient ? sgClient.getActiveApp() : null,
    channelStatus: getChannelStatus(),
  });
});

app.get('/api/logs', (req, res) => {
  res.json(protocolLogs.slice(-200));
});

// Download the current session log file
app.get('/api/logs/download', (req, res) => {
  if (fs.existsSync(LOG_FILE)) {
    res.download(LOG_FILE);
  } else {
    res.status(404).json({ error: 'No log file yet' });
  }
});

// Download the JSONL structured log
app.get('/api/logs/download-json', (req, res) => {
  if (fs.existsSync(LOG_FILE_JSON)) {
    res.download(LOG_FILE_JSON);
  } else {
    res.status(404).json({ error: 'No log file yet' });
  }
});

// List all saved log files
app.get('/api/logs/list', (req, res) => {
  if (!fs.existsSync(LOG_DIR)) return res.json([]);
  const files = fs.readdirSync(LOG_DIR)
    .filter(f => f.startsWith('session-') && f.endsWith('.log'))
    .map(f => ({
      name: f,
      size: fs.statSync(path.join(LOG_DIR, f)).size,
      modified: fs.statSync(path.join(LOG_DIR, f)).mtime,
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
    res.json({ ok: false, error: lastError || 'Connection failed' });
  }
});

app.post('/api/disconnect', (req, res) => {
  if (sgClient) { try { sgClient.disconnect(); } catch (e) {} }
  if (reconnectTimer) clearTimeout(reconnectTimer);
  connectionStatus = 'disconnected';
  inputReady = false; connectedConsole = null;
  sgClient = null;
  textChannelOpen = false; textChannelId = null; textSessionActive = false;
  textVersion = 0; currentText = '';
  broadcastState();
  res.json({ ok: true });
});

// ── WebSocket ──────────────────────────────────────────
wss.on('connection', (ws) => {
  plog('info', 'GUI client connected via WebSocket');
  // Send current state + recent logs
  ws.send(JSON.stringify({ type: 'state', status: connectionStatus, console: connectedConsole, inputReady, lastError, channelStatus: getChannelStatus() }));
  protocolLogs.slice(-config.websocketLogReplayCount).forEach(entry => {
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

// ── Start ──────────────────────────────────────────────
// Clear latest.log for this new session
try { fs.writeFileSync(LATEST_LOG, ''); fs.writeFileSync(LATEST_JSON, ''); } catch(e) {}

const PORT = config.port;
server.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║      🎮  Xbox Remote Control — DIAGNOSTIC MODE  🎮      ║
║                                                          ║
║   http://localhost:${PORT}                                 ║
║                                                          ║
║   📝 Logs saved to:                                      ║
║   ${LOG_FILE.padEnd(55)}║
║                                                          ║
║   Also: ${LOG_DIR}/latest.log                  ║
╚══════════════════════════════════════════════════════════╝
  `);
});
