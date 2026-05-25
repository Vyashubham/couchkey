'use strict';

// Text-channel client. The xbox-smartglass-core-node library has no
// manager for SystemText, so we drive it ourselves:
//
// - Wait for the Xbox to send SystemTextConfiguration (a text field
//   gained focus on the console); record the session ID it offers
// - Push edits with SystemTextInput, incrementing a per-session
//   version on every send
// - Finish with SystemTextDone (Accept / Cancel)

const bus = require('../bus');
const { plog } = require('../logger');
const state = require('../state');
const {
  buildTextInputPacket,
  buildTextAckPacket,
  buildTextDonePacket,
} = require('../protocol/packets');

const TEXT_DONE_ACCEPT = 0;
const TEXT_DONE_CANCEL = 1;

function emitSession(active, sessionId) {
  bus.emit('text_session', { active, sessionId });
}

function notReadyError() {
  return { ok: false, error: 'Text channel not open. Navigate to a text field on Xbox first.' };
}

async function sendText(text) {
  if (!state.sgClient || !state.textChannelOpen) return notReadyError();

  plog('info', `Sending text: "${text}"`);

  try {
    state.textVersion += 1;
    state.currentText = text;

    const xbox = state.sgClient._console;
    const channelId = state.textChannelId;
    const sessionId = state.textSessionId;
    const version = state.textVersion;

    xbox.get_requestnum();
    const inputPacket = buildTextInputPacket({ xbox, channelId, text, sessionId, version });
    state.sgClient._send(inputPacket);

    // The C# reference client follows every TextInput with a TextAck
    // bearing the same version. Without it the Xbox eventually stops
    // accepting our edits — symptom is text appearing once and then
    // future sends being silently dropped.
    xbox.get_requestnum();
    const ackPacket = buildTextAckPacket({ xbox, channelId, sessionId, versionAck: version });
    state.sgClient._send(ackPacket);

    plog('ok', `Text sent: "${text}" (session ${sessionId}, version ${version})`);
    return { ok: true, text };
  } catch (e) {
    plog('err', `Text send failed: ${e.message}`, e.stack);
    return { ok: false, error: e.message };
  }
}

async function submitText() {
  if (!state.sgClient || !state.textChannelOpen) return notReadyError();
  plog('info', `Submitting text (accepting session ${state.textSessionId})`);

  try {
    state.sgClient._console.get_requestnum();
    const packet = buildTextDonePacket({
      xbox: state.sgClient._console,
      channelId: state.textChannelId,
      sessionId: state.textSessionId,
      version: state.textVersion,
      result: TEXT_DONE_ACCEPT,
    });

    state.sgClient._send(packet);
    state.textSessionActive = false;
    plog('ok', 'Text submitted (done with accept)');
    emitSession(false);
    return { ok: true };
  } catch (e) {
    plog('err', `Text submit failed: ${e.message}`);
    return { ok: false, error: e.message };
  }
}

async function cancelText() {
  if (!state.sgClient || !state.textChannelOpen) return notReadyError();

  try {
    state.sgClient._console.get_requestnum();
    const packet = buildTextDonePacket({
      xbox: state.sgClient._console,
      channelId: state.textChannelId,
      sessionId: state.textSessionId,
      version: state.textVersion,
      result: TEXT_DONE_CANCEL,
    });

    state.sgClient._send(packet);
    state.textSessionActive = false;
    state.currentText = '';
    plog('ok', 'Text cancelled');
    emitSession(false);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// Subscribe to SystemTextConfiguration events on the current client.
// Call this after connect() resolves, before any text input is sent.
function setupTextEventListeners() {
  if (!state.sgClient) return;

  state.sgClient._events.on('_on_systemtextconfiguration', message => {
    try {
      const payload = message.packet_decoded.protected_payload
        || message.packet_decoded.decrypted_payload;
      plog('proto', 'SystemTextConfiguration received', payload);

      state.textSessionActive = true;
      if (payload && payload.text_session_id !== undefined) {
        state.textSessionId = payload.text_session_id;
      }
      state.textVersion = 0;
      state.currentText = '';
      emitSession(true, state.textSessionId);
    } catch (e) {
      plog('warn', `Could not parse text config: ${e.message}`);
      // Activate the session anyway — the GUI can still try to send.
      state.textSessionActive = true;
      state.textVersion = 0;
      state.currentText = '';
      emitSession(true);
    }
  });
}

module.exports = {
  sendText,
  submitText,
  cancelText,
  setupTextEventListeners,
};
