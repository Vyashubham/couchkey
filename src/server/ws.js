'use strict';

// WebSocket transport: pushes events from the bus (logs, state,
// text-session changes) out to every connected GUI client, and
// translates inbound input messages back into calls on the xbox
// input/text modules.

const config = require('../config');
const bus = require('../bus');
const state = require('../state');
const { plog, getRecentLogs } = require('../logger');
const { sendButton, runMacro, sendMediaCommand } = require('../xbox/input');
const { sendText, submitText, cancelText } = require('../xbox/text');
const { getLayout, listLayouts } = require('../osk/registry');
const { typeOnOsk, cancelOskTyping, resetPosition } = require('../osk/typer');

async function oskType(msg) {
  const layout = getLayout(msg.layout);
  if (!layout) return { ok: false, error: `Unknown OSK layout: ${msg.layout}` };
  if (msg.fresh) resetPosition(layout.id); // keyboard was just opened
  return typeOnOsk(layout, String(msg.text || ''));
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
        ws.send(JSON.stringify({ type: ACK_TYPE[msg.type], ...result }));
      } catch (err) {
        ws.send(JSON.stringify({ type: 'error', error: err.message }));
      }
    });
  });
}

module.exports = {
  attachWebSocket,
};
