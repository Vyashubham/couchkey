'use strict';

// Gamepad and media input: a minimum-interval throttle on gamepad
// presses, macros, and media commands via the library's SystemMedia
// manager.

const config = require('../config');
const { plog } = require('../logger');
const MACROS = require('../macros');
const state = require('../state');
const { sendButtonAcked, sendButtonRaw } = require('./gamepad');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Every press goes through our own gamepad sender (src/xbox/gamepad.js),
// never the library's SystemInput.sendCommand: the library has Menu/View
// swapped, can't send shoulders or sticks, and its timestamp encoding
// must match ours or the Xbox ignores one side (see packets.ts).
async function sendButton(button) {
  if (!state.sgClient) return { ok: false, error: 'No client' };
  const wait = config.buttonMinIntervalMs - (Date.now() - state.lastButtonTime);
  if (wait > 0) await sleep(wait);
  state.lastButtonTime = Date.now();
  return config.gamepadAck ? sendButtonAcked(button) : sendButtonRaw(button);
}

async function runMacro(macroName) {
  const steps = MACROS[macroName];
  if (!steps) return { ok: false, error: `Unknown macro: ${macroName}` };

  plog('info', `Running macro: ${macroName} (${steps.length} steps)`);
  for (const step of steps) {
    if (step.delay > 0) await sleep(step.delay);
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

// Runtime-tunable input options, so press speed and acks can be tried
// from the GUI while watching the TV.
function setInputOptions({ ack, intervalMs } = {}) {
  if (typeof ack === 'boolean') config.gamepadAck = ack;
  if (Number.isFinite(intervalMs) && intervalMs >= 30 && intervalMs <= 2000) {
    config.buttonMinIntervalMs = Math.round(intervalMs);
  }
  plog('info', `Input options: ack=${config.gamepadAck} interval=${config.buttonMinIntervalMs}ms`);
  return { ok: true, ack: config.gamepadAck, intervalMs: config.buttonMinIntervalMs };
}

// Speed test: alternate right/left `count` times (net zero movement on
// most screens) and report how many presses were confirmed and how fast.
async function pressBench(count = 20) {
  count = Math.max(2, Math.min(200, count | 0));
  const t0 = Date.now();
  let ok = 0;
  const rtts = [];
  let firstError = null;
  for (let i = 0; i < count; i++) {
    const r = await sendButton(i % 2 ? 'left' : 'right');
    if (r.ok) { ok++; if (r.rttMs !== undefined) rtts.push(r.rttMs); }
    else if (!firstError) firstError = r.error;
  }
  const secs = (Date.now() - t0) / 1000;
  const result = {
    ok: true,
    count,
    confirmed: config.gamepadAck ? ok : null,
    sent: ok,
    perSecond: +(count / secs).toFixed(1),
    avgRttMs: rtts.length ? Math.round(rtts.reduce((a, b) => a + b, 0) / rtts.length) : null,
    maxRttMs: rtts.length ? Math.max(...rtts) : null,
    ack: config.gamepadAck,
    intervalMs: config.buttonMinIntervalMs,
    firstError,
  };
  plog('info', 'Press bench', result);
  return result;
}

module.exports = {
  setInputOptions,
  pressBench,
  sendButton,
  runMacro,
  sendMediaCommand,
};
