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
const { buildGamepadPacket, buildTouchPacket } = require('../console/smartglass/packets');
const { AckTracker } = require('../console/smartglass/ack-tracker');
const { BUTTON_MASKS: BUTTONS } = require('../console/types');


const acks = new AckTracker();
let listenerFor = null; // sgClient the ack listener is attached to

const sleep = ms => new Promise(r => setTimeout(r, ms));

function ensureListener() {
  if (listenerFor === state.sgClient) return;
  state.sgClient._events.on('_on_acknowledge', m => acks.handle(m && m.packet_decoded && m.packet_decoded.protected_payload));
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
async function sendState(buttons) {
  const channelId = inputChannel();
  if (!channelId) return null;
  const xbox = state.sgClient._console;
  xbox.get_requestnum();
  const seq = xbox._request_num;
  const packet = buildGamepadPacket({ xbox, channelId, buttons, needAck: true });
  const outcome = acks.track(seq, config.gamepadAckTimeoutMs);
  state.sgClient._send(packet);
  const o = await outcome;
  return o === 'confirmed' ? true : o === 'rejected' ? false : null;
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

// Current gamepad state we've told the Xbox about. Every packet carries
// the full state, so stick updates must include held buttons (or they'd
// release them) and button presses must include the stick position.
let heldMask = 0;
let analog = { leftX: 0, leftY: 0, rightX: 0, rightY: 0 };

function sendCurrentState(channelId) {
  const xbox = state.sgClient._console;
  xbox.get_requestnum();
  state.sgClient._send(buildGamepadPacket({ xbox, channelId, buttons: heldMask, needAck: false, analog }));
}

// Press + release without asking for confirmation. All buttons go through
// here (not the library's sendCommand) so timestamps and state stay
// consistent with stick updates.
async function sendButtonRaw(button) {
  if (!state.sgClient) return { ok: false, error: 'Not connected' };
  const mask = BUTTONS[button];
  if (mask === undefined) return { ok: false, error: `Unknown button: ${button}` };
  const channelId = inputChannel();
  if (!channelId) return { ok: false, error: 'Channel not ready. Try reconnecting.' };
  heldMask |= mask;
  sendCurrentState(channelId);
  await sleep(100); // same hold time the library uses
  heldMask &= ~mask;
  const releaseChannel = inputChannel();
  if (releaseChannel) sendCurrentState(releaseChannel);
  plog('ok', `Button '${button}' sent`);
  return { ok: true, button };
}

// Analog stick state, sent as fast as the GUI asks (it rate-limits to
// ~30/s). Fire-and-forget: a lost update is superseded by the next one.
let lastStickLog = 0;
function sendSticks(next) {
  if (!state.sgClient) return { ok: false, error: 'Not connected' };
  const channelId = inputChannel();
  if (!channelId) return { ok: false, error: 'Channel not ready. Try reconnecting.' };
  analog = { ...analog, ...next };
  sendCurrentState(channelId);
  const now = Date.now();
  if (now - lastStickLog > 2000) {
    lastStickLog = now;
    plog('info', 'Stick update', analog);
  }
  return { ok: true };
}

// Diagnostic: send `count` stick states with need_ack and report how the
// Xbox answered each one (processed / rejected / no answer).
async function probeSticks({ lx = 0.7, ly = 0, count = 10, periodMs = 100 } = {}) {
  if (!state.sgClient) return { ok: false, error: 'Not connected' };
  const channelId = inputChannel();
  if (!channelId) return { ok: false, error: 'Channel not ready' };
  ensureListener();
  const results = [];
  for (let i = 0; i < count; i++) {
    const xbox = state.sgClient._console;
    xbox.get_requestnum();
    const seq = xbox._request_num;
    const pending = acks.track(seq, config.gamepadAckTimeoutMs);
    const t0 = Date.now();
    state.sgClient._send(buildGamepadPacket({
      xbox, channelId, buttons: 0, needAck: true,
      analog: { leftX: lx, leftY: ly, rightX: 0, rightY: 0 },
    }));
    pending.then(o => results.push({ i, seq, outcome: o, ms: Date.now() - t0 }));
    await sleep(periodMs);
  }
  // centre the stick and wait for stragglers
  sendCurrentState(channelId);
  await sleep(config.gamepadAckTimeoutMs + 100);
  const summary = results.reduce((m, r) => ({ ...m, [r.outcome]: (m[r.outcome] || 0) + 1 }), {});
  plog('info', 'Stick probe', { lx, ly, count, periodMs, summary });
  return { ok: true, summary, results: results.sort((a, b) => a.i - b.i) };
}

// Diagnostic: play a list of touch frames (each { action, x, y, delayMs })
// as SystemTouch messages with need_ack, and report the Xbox's answers.
async function probeTouch(frames) {
  if (!state.sgClient) return { ok: false, error: 'Not connected' };
  const channelId = inputChannel();
  if (!channelId) return { ok: false, error: 'Channel not ready' };
  ensureListener();
  const results = [];
  const pendings = [];
  for (const [i, f] of frames.entries()) {
    const xbox = state.sgClient._console;
    xbox.get_requestnum();
    const seq = xbox._request_num;
    const pending = acks.track(seq, config.gamepadAckTimeoutMs);
    state.sgClient._send(buildTouchPacket({
      xbox, channelId, needAck: true,
      points: [{ id: 1, action: f.action, x: f.x, y: f.y }],
    }));
    pendings.push(pending.then(o => results.push({ i, action: f.action, outcome: o })));
    await sleep(f.delayMs || 30);
  }
  await Promise.all(pendings);
  const summary = results.reduce((m, r) => ({ ...m, [r.outcome]: (m[r.outcome] || 0) + 1 }), {});
  plog('info', 'Touch probe', { frames: frames.length, summary });
  return { ok: true, summary };
}

module.exports = {
  probeTouch,
  probeSticks,
  sendButtonAcked,
  sendButtonRaw,
  sendSticks,
};
