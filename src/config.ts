// All tunables, read from the environment (and .env via npm start).
// See .env.example for documentation of every value.

import path from 'node:path';
import { ROOT_DIR } from './paths';

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

const config = {
  // HTTP / WebSocket server
  port: int('PORT', 3247),

  // Input throttling
  buttonMinIntervalMs: int('BUTTON_MIN_INTERVAL_MS', 150),

  // Acknowledged gamepad presses (experimental until verified on a
  // console). When on, every press asks the Xbox to confirm it, so a
  // dropped press is reported instead of silently desyncing on-screen
  // keyboard typing. Can also be toggled at runtime from the GUI.
  gamepadAck: process.env.GAMEPAD_ACK === '1',
  gamepadHoldMs: int('GAMEPAD_HOLD_MS', 60),
  gamepadAckTimeoutMs: int('GAMEPAD_ACK_TIMEOUT_MS', 1000),

  // Connection lifecycle
  reconnectDelayMs: int('RECONNECT_DELAY_MS', 5000),
  channelMonitorIntervalMs: 1000,
  channelMonitorMaxChecks: 20,
  channelOpenStaggerMs: 200,
  forceOpenChannelDelayMs: 500,

  // Custom heartbeat (replaces the library's 4-second-then-die default;
  // the library is too aggressive when the event loop is saturated by
  // rapid gamepad input)
  heartbeatTimeoutSec: int('HEARTBEAT_TIMEOUT_SEC', 30),
  heartbeatKeepAliveAfterSec: int('HEARTBEAT_KEEPALIVE_AFTER_SEC', 3),
  heartbeatKeepAliveIntervalSec: int('HEARTBEAT_KEEPALIVE_INTERVAL_SEC', 2),

  // Persistent data (known consoles, settings)
  dataDir: process.env.DATA_DIR ?? path.join(ROOT_DIR, 'data'),
  // Reconnect to the last console automatically on startup (0 = off)
  autoConnect: process.env.AUTO_CONNECT !== '0',

  // Logging
  logDir: process.env.LOG_DIR ?? path.join(ROOT_DIR, 'logs'),
  protocolLogRingBufferSize: 500,
  websocketLogReplayCount: 50,

  // SmartGlass library debug (verbose by default; set SMARTGLASS_DEBUG=0 to silence)
  smartglassDebug: process.env.SMARTGLASS_DEBUG !== '0',
};

export = config;
