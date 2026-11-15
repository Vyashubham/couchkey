'use strict';

// WebSocket transport: pushes events from the bus (logs, state,
// text-session changes) out to every connected GUI client, and
// translates inbound input messages back into calls on the xbox
// input/text modules.

const config = require('../config');
const bus = require('../bus');
const state = require('../state');
const { plog, getRecentLogs } = require('../logger');
const { sendButton, runMacro, sendMediaCommand, setInputOptions, pressBench } = require('../xbox/input');
const { sendText, submitText, cancelText } = require('../xbox/text');
const { getLayout, listLayouts } = require('../osk/registry');
const { typeOnOsk, cancelOskTyping, resetPosition } = require('../osk/typer');
const { sendSticks, probeSticks, probeTouch } = require('../xbox/gamepad');

const TOUCH_ACTIONS = new Set(['down', 'move', 'up', 'cancel']);
const touchFrames = msg => (Array.isArray(msg.frames) ? msg.frames : [])
  .slice(0, 200)
  .filter(f => f && TOUCH_ACTIONS.has(f.action))
  .map(f => ({ action: f.action, x: num(f.x), y: num(f.y), delayMs: Math.min(1000, num(f.delayMs) || 30) }));

const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

async function oskType(msg) {
  const layout = getLayout(msg.layout);
  if (!layout) return { ok: false, error: `Unknown OSK layout: ${msg.layout}` };
  if (msg.fresh) resetPosition(layout.id); // keyboard was just opened
  return typeOnOsk(layout, String(msg.text || ''), { send: sendButton, log: plog });
}

// Map of inbound WS message type → (msg, ws) → handler that returns
// an object to wrap in an ack reply.
const HANDLERS = {
  button:      msg => sendButton(msg.button),
  macro:       msg => runMacro(msg.name),
  media:       msg => sendMediaCommand(msg.command),
  text:        msg => sendText(msg.text),
  text_submit: ()  => submitText(),
  text_cancel: ()  => cancelText(),
  osk_type:    msg => oskType(msg),
  osk_cancel:  ()  => { cancelOskTyping(); return { ok: true }; },
  osk_reset:   msg => { resetPosition(msg.layout); return { ok: true }; },
  osk_list:    ()  => ({ ok: true, layouts: listLayouts() }),
  input_options: msg => setInputOptions(msg),
  touch_probe: msg => probeTouch(touchFrames(msg)),
  stick_probe: msg => probeSticks({ lx: num(msg.lx), ly: num(msg.ly), count: Math.min(50, num(msg.count) || 10), periodMs: num(msg.periodMs) || 100 }),
  sticks:      msg => sendSticks({ leftX: num(msg.lx), leftY: num(msg.ly), rightX: num(msg.rx), rightY: num(msg.ry) }),
  press_bench: msg => pressBench(msg.count),
};

const ACK_TYPE = {
  button:      'input_ack',
  macro:       'macro_ack',
  media:       'media_ack',
  text:        'text_ack',
  text_submit: 'text_submit_ack',
  text_cancel: 'text_cancel_ack',
  osk_type:    'osk_type_ack',
  osk_cancel:  'osk_cancel_ack',
  osk_reset:   'osk_reset_ack',
  osk_list:    'osk_layouts',
  input_options: 'input_options_ack',
  sticks:      null, // high-frequency: no ack
  stick_probe: 'stick_probe_ack',
  touch_probe: 'touch_probe_ack',
  press_bench: 'press_bench_ack',
};

function attachWebSocket(wss) {
  // Push events from domain modules to every connected client.
  function broadcast(obj) {
    const json = JSON.stringify(obj);
    wss.clients.forEach(client => {
      if (client.readyState === client.OPEN) client.send(json);
    });
  }

  bus.on('log',          entry    => broadcast({ type: 'log',          ...entry    }));
  bus.on('state',        snapshot => broadcast({ type: 'state',        ...snapshot }));
  bus.on('text_session', payload  => broadcast({ type: 'text_session', ...payload  }));

  wss.on('connection', ws => {
    plog('info', 'GUI client connected via WebSocket');

    ws.send(JSON.stringify({ type: 'state', ...state.snapshot() }));
    getRecentLogs(config.websocketLogReplayCount).forEach(entry => {
      ws.send(JSON.stringify({ type: 'log', ...entry }));
    });

    ws.on('message', async raw => {
      try {
        const msg = JSON.parse(raw);
        const handler = HANDLERS[msg.type];
        if (!handler) return;
        const result = await handler(msg, ws);
        if (ACK_TYPE[msg.type]) ws.send(JSON.stringify({ type: ACK_TYPE[msg.type], ...result }));
      } catch (err) {
        ws.send(JSON.stringify({ type: 'error', error: err.message }));
      }
    });
  });
}

module.exports = {
  attachWebSocket,
};
