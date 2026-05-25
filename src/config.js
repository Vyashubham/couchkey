'use strict';

const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');

const config = {
  // HTTP / WebSocket server
  port: parseInt(process.env.PORT, 10) || 3247,

  // Input throttling
  buttonMinIntervalMs: parseInt(process.env.BUTTON_MIN_INTERVAL_MS, 10) || 150,

  // Connection lifecycle
  reconnectDelayMs: parseInt(process.env.RECONNECT_DELAY_MS, 10) || 5000,
  channelMonitorIntervalMs: 1000,
  channelMonitorMaxChecks: 20,
  channelOpenStaggerMs: 200,
  forceOpenChannelDelayMs: 500,

  // Custom heartbeat (replaces the library's 4-second-then-die default;
  // the library is too aggressive when the event loop is saturated by
  // rapid gamepad input)
  heartbeatTimeoutSec: parseInt(process.env.HEARTBEAT_TIMEOUT_SEC, 10) || 30,
  heartbeatKeepAliveAfterSec: parseInt(process.env.HEARTBEAT_KEEPALIVE_AFTER_SEC, 10) || 3,
  heartbeatKeepAliveIntervalSec: parseInt(process.env.HEARTBEAT_KEEPALIVE_INTERVAL_SEC, 10) || 2,

  // Logging
  logDir: process.env.LOG_DIR || path.join(ROOT_DIR, 'logs'),
  protocolLogRingBufferSize: 500,
  websocketLogReplayCount: 50,

  // SmartGlass library debug (verbose by default; set SMARTGLASS_DEBUG=0 to silence)
  smartglassDebug: process.env.SMARTGLASS_DEBUG !== '0',
};

module.exports = config;
