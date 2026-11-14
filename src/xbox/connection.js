'use strict';

// Owns the lifecycle of the SmartGlass client: discovery, connect,
// channel-ready monitoring, timeout handling, and auto-reconnect.
//
// We use a generation counter to keep callbacks from old (stale)
// clients from mutating shared state when a new connect has already
// started. Every async callback checks `myGeneration === state.connectionGeneration`.

const Smartglass = require('xbox-smartglass-core-node');
const SystemInputChannel = require('xbox-smartglass-core-node/src/channels/systeminput');
const SystemMediaChannel = require('xbox-smartglass-core-node/src/channels/systemmedia');

const bus = require('../bus');
const config = require('../config');
const { plog } = require('../logger');
const state = require('../state');
const { forceOpenChannels } = require('./channels');
const { toConnectError } = require('../console/errors');
const { summarizeEvent } = require('../console/smartglass/summarize');
const { installHeartbeat } = require('../console/smartglass/heartbeat');

const parseConnectionError = err => toConnectError(err).message;
const { setupTextEventListeners } = require('./text');

function notifyState() {
  bus.emit('state', state.snapshot());
}

async function discoverConsoles(ip) {
  state.connectionStatus = 'discovering';
  state.lastError = null;
  notifyState();
  plog('info', `Starting discovery${ip ? ` at ${ip}` : ' (broadcast)'}...`);

  const client = Smartglass();
  try {
    const consoles = await client.discovery(ip || undefined);
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
    return consoles;
  } catch (err) {
    plog('err', 'Discovery failed', err);
    throw err;
  }
}

function instrumentEventEmitter(sgClient) {
  const originalEmit = sgClient._events.emit.bind(sgClient._events);
  sgClient._events.emit = function instrumentedEmit(eventName, ...args) {
    if (eventName !== 'newListener' && eventName !== 'receive') {
      plog('proto', `Event: ${eventName}`, summarizeEvent(eventName, args));
    }
    return originalEmit(eventName, ...args);
  };
}

function tearDownCurrentClient() {
  if (state.channelCheckInterval) {
    clearInterval(state.channelCheckInterval);
    state.channelCheckInterval = null;
  }
  if (state.sgClient) {
    plog('info', 'Disconnecting previous client...');
    try { state.sgClient.disconnect(); } catch (_) { /* ignore */ }
    state.sgClient = null;
  }
}

function startChannelReadinessMonitor(myGeneration) {
  let checkCount = 0;
  state.channelCheckInterval = setInterval(() => {
    if (myGeneration !== state.connectionGeneration) {
      clearInterval(state.channelCheckInterval);
      return;
    }
    checkCount += 1;
    const channels = state.getChannelStatus();

    if (checkCount <= 3 || checkCount % 5 === 0) {
      plog('info', `[gen:${myGeneration}] Channel check #${checkCount}:`, channels);
    }

    const allReady = Object.values(channels).every(c => c.status === true);
    if (allReady && !state.inputReady) {
      state.inputReady = true;
      plog('ok', `[gen:${myGeneration}] All channels ready — input is now active`);
      notifyState();
      clearInterval(state.channelCheckInterval);
      state.channelCheckInterval = null;
    }

    if (checkCount >= config.channelMonitorMaxChecks) {
      clearInterval(state.channelCheckInterval);
      state.channelCheckInterval = null;
      if (!state.inputReady) {
        plog('warn', `[gen:${myGeneration}] Channels did not open after ${config.channelMonitorMaxChecks}s`, channels);
        state.inputReady = true;
        notifyState();
      }
    }
    notifyState();
  }, config.channelMonitorIntervalMs);
}

async function connectToConsole(ip) {
  state.connectionGeneration += 1;
  const myGeneration = state.connectionGeneration;

  tearDownCurrentClient();

  state.connectionStatus = 'connecting';
  state.lastError = null;
  state.inputReady = false;
  notifyState();

  plog('info', `[gen:${myGeneration}] Creating SmartGlass client and connecting to ${ip}...`);

  const sgClient = Smartglass();
  state.sgClient = sgClient;

  instrumentEventEmitter(sgClient);

  plog('info', 'Adding SystemInput channel manager...');
  sgClient.addManager('system_input', SystemInputChannel());
  plog('info', 'Adding SystemMedia channel manager...');
  sgClient.addManager('system_media', SystemMediaChannel());

  plog('info', `Managers added. Starting connect to ${ip}...`);

  try {
    await sgClient.connect(ip);
  } catch (err) {
    state.connectionStatus = 'disconnected';
    state.lastError = parseConnectionError(err);
    state.inputReady = false;
    plog('err', `Connection failed: ${state.lastError}`, err);
    notifyState();
    throw err;
  }

  state.connectionStatus = 'connected';
  state.connectedConsole = { ip };
  state.lastError = null;
  plog('ok', `SmartGlass connect() resolved. Connection status: ${sgClient.isConnected()}`);

  // Replace the library's aggressive 8-second-with-one-keepalive
  // heartbeat with our configurable, repeatedly-pinging variant.
  installHeartbeat(sgClient, {
    timeoutSec: config.heartbeatTimeoutSec,
    keepAliveAfterSec: config.heartbeatKeepAliveAfterSec,
    keepAliveIntervalSec: config.heartbeatKeepAliveIntervalSec,
    onKeepAliveError: e => plog('warn', `Keep-alive send failed: ${e && e.message}`),
    onTimeout: silent => {
      plog('err', `Heartbeat timeout: ${silent}s since last received packet`);
      if (myGeneration !== state.connectionGeneration) return;
      state.connectionStatus = 'disconnected';
      state.inputReady = false;
      if (state.channelCheckInterval) {
        clearInterval(state.channelCheckInterval);
        state.channelCheckInterval = null;
      }
      notifyState();
      scheduleReconnect(ip);
    },
  });

  setupTextEventListeners();

  // Series X workaround: this console never sends an unsolicited
  // console_status after an anonymous connect, so the library's
  // channel-opening dance never starts on its own.
  plog('info', 'Manually opening channels (Series X workaround)...');
  setTimeout(forceOpenChannels, config.forceOpenChannelDelayMs);

  // Older Xbox One firmware does send console_status — log it if it arrives.
  sgClient._events.on('_on_console_status', () => {
    plog('ok', 'console_status received from console');
  });

  startChannelReadinessMonitor(myGeneration);

  // The library still emits _on_timeout from any pre-existing setInterval
  // it kept a reference to; keep this listener as a safety net even
  // though our installHeartbeat above already handles the common case.
  sgClient._events.on('_on_timeout', () => {
    if (myGeneration !== state.connectionGeneration) return;
    plog('err', `[gen:${myGeneration}] Connection timeout — will reconnect in ${config.reconnectDelayMs}ms`);
    state.connectionStatus = 'disconnected';
    state.inputReady = false;
    if (state.channelCheckInterval) {
      clearInterval(state.channelCheckInterval);
      state.channelCheckInterval = null;
    }
    notifyState();
    scheduleReconnect(ip);
  });

  notifyState();
}

function scheduleReconnect(ip) {
  if (state.reconnectTimer) clearTimeout(state.reconnectTimer);
  state.reconnectTimer = setTimeout(() => {
    plog('info', 'Attempting auto-reconnect...');
    connectToConsole(ip).catch(() => scheduleReconnect(ip));
  }, config.reconnectDelayMs);
}

function disconnect() {
  if (state.sgClient) {
    try { state.sgClient.disconnect(); } catch (_) { /* ignore */ }
  }
  if (state.reconnectTimer) clearTimeout(state.reconnectTimer);
  if (state.channelCheckInterval) {
    clearInterval(state.channelCheckInterval);
    state.channelCheckInterval = null;
  }
  state.connectionStatus = 'disconnected';
  state.inputReady = false;
  state.connectedConsole = null;
  state.sgClient = null;
  state.textChannelOpen = false;
  state.textChannelId = null;
  state.textSessionActive = false;
  state.textVersion = 0;
  state.currentText = '';
  notifyState();
}

module.exports = {
  discoverConsoles,
  connectToConsole,
  scheduleReconnect,
  disconnect,
};
