'use strict';

// Acknowledged gamepad presses.
//
// The library's SystemInput manager sends press + release with no ack
// requested, so a dropped packet is invisible. For on-screen keyboard
// typing one lost d-pad press shifts every later letter, so here we
// build the gamepad packets ourselves with the need_ack flag set and
// wait for the Xbox's Acknowledge message listing our sequence number.
//
// A press that isn't confirmed is NOT resent: if the press arrived but
// the ack was lost, a resend would double-move. We report the failure
// and let the caller decide (the OSK typer stops and forgets where the
// highlight is). Releases are safe to resend, so those get one retry.

const config = require('../config');
const { plog } = require('../logger');
const state = require('../state');
const { buildGamepadPacket } = require('../protocol/packets');

// Same values the library uses, plus shoulders and stick clicks from
// the SmartGlass gamepad bitmask. NOTE: OpenXbox docs list Menu = 4 and
// View = 8; the library has them the other way round. Kept as the
// library has it until checked on a console.
const BUTTONS = {
  nexus: 2,
  view: 4,
  menu: 8,
  a: 16,
  b: 32,
  x: 64,
  y: 128,
  up: 256,
  down: 512,
  left: 1024,
  right: 2048,
  left_shoulder: 4096,
  right_shoulder: 8192,
  left_thumbstick: 16384,
  right_thumbstick: 32768,
};

const pending = new Map(); // sequence number -> { resolve, timer }
let listenerFor = null;    // sgClient the ack listener is attached to

const sleep = ms => new Promise(r => setTimeout(r, ms));

function settle(seq, ok) {
  const p = pending.get(seq);
  if (!p) return;
  clearTimeout(p.timer);
  pending.delete(seq);
  p.resolve(ok);
}

function onAcknowledge(message) {
  const body = message && message.packet_decoded && message.packet_decoded.protected_payload;
  if (!body || typeof body !== 'object') return;
  for (const r of body.rejected_list || []) settle(r.id, false);
  for (const r of body.processed_list || []) settle(r.id, true);
  // Everything at or below the low watermark has been processed too.
  if (typeof body.low_watermark === 'number') {
    for (const seq of [...pending.keys()]) if (seq <= body.low_watermark) settle(seq, true);
  }
}

function ensureListener() {
  if (listenerFor === state.sgClient) return;
  state.sgClient._events.on('_on_acknowledge', onAcknowledge);
  listenerFor = state.sgClient;
}

function inputChannel() {
  const mgr = state.sgClient && state.sgClient.getManager('system_input');
  const cm = mgr && mgr._channel_manager;
  if (!cm || !cm.getStatus()) return null;
  return cm.getChannel();
}

// Send one gamepad state and wait for the Xbox to confirm it.
// Resolves to true (processed), false (rejected) or null (timed out).
function sendState(buttons) {
  const channelId = inputChannel();
  if (!channelId) return Promise.resolve(null);
  const xbox = state.sgClient._console;
  xbox.get_requestnum();
  const seq = xbox._request_num;
  const packet = buildGamepadPacket({ xbox, channelId, buttons, needAck: true });

  return new Promise(resolve => {
    const timer = setTimeout(() => { pending.delete(seq); resolve(null); }, config.gamepadAckTimeoutMs);
    pending.set(seq, { resolve, timer });
    state.sgClient._send(packet);
  });
}

async function sendButtonAcked(button) {
  if (!state.sgClient) return { ok: false, error: 'Not connected' };
  const mask = BUTTONS[button];
  if (mask === undefined) return { ok: false, error: `Unknown button: ${button}` };
  if (!inputChannel()) return { ok: false, error: 'Channel not ready. Try reconnecting.' };
  ensureListener();

  const t0 = Date.now();
  const pressed = await sendState(mask);
  if (pressed !== true) {
    // Make sure the button isn't left held down, then report.
    await sendState(0);
    const why = pressed === false ? 'rejected' : 'not confirmed';
    plog('err', `Press '${button}' ${why} by Xbox`);
    return { ok: false, error: `Press ${why}`, button };
  }
  const rttMs = Date.now() - t0;

  const wait = config.gamepadHoldMs - rttMs;
  if (wait > 0) await sleep(wait);
  let released = await sendState(0);
  if (released !== true) released = await sendState(0);
  if (released !== true) {
    plog('warn', `Release after '${button}' not confirmed`);
  }

  return { ok: true, button, rttMs };
}

module.exports = {
  BUTTONS,
  sendButtonAcked,
  _onAcknowledge: onAcknowledge, // for tests
  _pending: pending,
};
