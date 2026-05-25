'use strict';

// Gamepad and media input. Thin wrappers around the SmartGlass
// library's SystemInput and SystemMedia channel managers, with a
// minimum-interval throttle on gamepad presses (the Xbox starts
// dropping messages and the heartbeat layer falls behind if we fire
// faster than ~6 per second).

const config = require('../config');
const { plog } = require('../logger');
const MACROS = require('../macros');
const state = require('../state');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function sendButton(button) {
  if (!state.sgClient) return { ok: false, error: 'No client' };

  const mgr = state.sgClient.getManager('system_input');
  if (!mgr) return { ok: false, error: 'No system_input manager' };

  const channelOpen = mgr._channel_manager ? mgr._channel_manager.getStatus() : false;
  if (!channelOpen) {
    plog('warn', `sendButton('${button}') — channel not open`);
    return { ok: false, error: 'Channel not ready. Try reconnecting.' };
  }

  const now = Date.now();
  const timeSinceLast = now - state.lastButtonTime;
  if (timeSinceLast < config.buttonMinIntervalMs) {
    await sleep(config.buttonMinIntervalMs - timeSinceLast);
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

module.exports = {
  sendButton,
  runMacro,
  sendMediaCommand,
};
