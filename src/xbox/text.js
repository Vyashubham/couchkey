'use strict';

// Text-channel client. The xbox-smartglass-core-node library has no
// manager for SystemText, so we drive it ourselves. Protocol flow,
// matching the OpenXbox C# reference (SmartGlass/Channels/TextChannel.cs):
//
//   Xbox  -> us:  SystemTextConfiguration   (a text field gained focus)
//                  -> reset version state, store session id
//   us    -> Xbox: SystemTextInput          (one for every edit)
//                  base_version = last known
//                  submitted_version = base + 1
//   Xbox  -> us:  SystemTextAcknowledge     (Xbox confirms a version)
//                  -> update our known version
//   Xbox  -> us:  SystemTextInput           (Xbox tells us its own view)
//                  -> we must ACK it with SystemTextAcknowledge
//   us    -> Xbox: SystemTextDone           (Accept / Cancel)

const bus = require('../bus');
const { plog } = require('../logger');
const state = require('../state');
const {
  buildTextInputPacket,
  buildTextAckPacket,
  buildTextDonePacket,
} = require('../console/smartglass/packets');

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
    const xbox = state.sgClient._console;
    const channelId = state.textChannelId;
    const sessionId = state.textSessionId;
    const baseVersion = state.textVersion;
    const submittedVersion = baseVersion + 1;

    xbox.get_requestnum();
    const inputPacket = buildTextInputPacket({
      xbox, channelId, text, sessionId, baseVersion, submittedVersion,
    });
    plog('proto', 'TextInput packet built', {
      length: inputPacket.length,
      hex: inputPacket.toString('hex'),
      base_version: baseVersion,
      submitted_version: submittedVersion,
    });
    state.sgClient._send(inputPacket);

    // Advance our local view immediately. The C# reference only updates
    // on receiving SystemTextAcknowledge, but with rapid typing (one
    // send per character) we'd send several edits with the same
    // base_version before any ack lands, which the Xbox treats as a
    // single update and discards the intermediate states.
    state.textVersion = submittedVersion;
    state.currentText = text;

    plog('ok', `Text sent: "${text}" (session ${sessionId}, base ${baseVersion} -> submitted ${submittedVersion})`);
    return { ok: true, text };
  } catch (e) {
    plog('err', `Text send failed: ${e.message}`, e.stack);
    return { ok: false, error: e.message };
  }
}

async function submitText() {
  if (!state.sgClient || !state.textChannelOpen) return notReadyError();
  plog('info', `Submitting text (accepting session ${state.textSessionId} at version ${state.textVersion})`);

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

// Parse a SystemTextConfiguration payload out of the raw decrypted bytes.
// The library has no Packet[] schema entry for this message, so its
// `protected_payload` arrives as an empty object and we have to read
// the leading fixed-size fields ourselves.
function parseTextConfiguration(buf) {
  if (!buf || buf.length < 4) return null;
  const out = { text_session_id: buf.readUInt32BE(0) };
  if (buf.length >= 8)  out.text_buffer_version = buf.readUInt32BE(4);
  if (buf.length >= 12) out.text_options = buf.readUInt32BE(8);
  if (buf.length >= 16) out.input_scope = buf.readUInt32BE(12);
  if (buf.length >= 20) out.max_text_length = buf.readInt32BE(16);
  return out;
}

// Parse a SystemTextInput payload from the Xbox. Same field layout as
// our outgoing TextInput, per OpenXbox C# SystemTextInputMessage:
//   session_id(u32), base(u32), submitted(u32), totalLen(u32),
//   selStart(i32), selLength(i32), flags(u16), chunkStart(u32),
//   chunk(SGString)
function parseSystemTextInput(buf) {
  if (!buf || buf.length < 28) return null;
  return {
    text_session_id: buf.readUInt32BE(0),
    base_version: buf.readUInt32BE(4),
    submitted_version: buf.readUInt32BE(8),
    total_text_bytelength: buf.readUInt32BE(12),
    selection_start: buf.readInt32BE(16),
    selection_length: buf.readInt32BE(20),
    flags: buf.readUInt16BE(24),
  };
}

function parseSystemTextAck(buf) {
  if (!buf || buf.length < 8) return null;
  return {
    text_session_id: buf.readUInt32BE(0),
    text_version_ack: buf.readUInt32BE(4),
  };
}

// Send a SystemTextAcknowledge back to the Xbox. We MUST do this every
// time the Xbox sends us a SystemTextInput (per the C# reference); the
// Xbox uses our acks to track our view of the buffer version, and if it
// drifts our subsequent edits get dropped.
function sendAck(sessionId, versionAck) {
  if (!state.sgClient || !state.textChannelId) return;
  try {
    const xbox = state.sgClient._console;
    xbox.get_requestnum();
    const ack = buildTextAckPacket({
      xbox,
      channelId: state.textChannelId,
      sessionId,
      versionAck,
    });
    state.sgClient._send(ack);
  } catch (e) {
    plog('warn', `Failed to send SystemTextAcknowledge: ${e.message}`);
  }
}

function setupTextEventListeners() {
  if (!state.sgClient) return;

  state.sgClient._events.on('_on_systemtextconfiguration', message => {
    try {
      const decoded = message.packet_decoded || {};
      const raw = decoded.decrypted_payload;
      const parsed = parseTextConfiguration(raw);
      plog('proto', 'SystemTextConfiguration received', {
        ...parsed,
        raw_length: raw ? raw.length : 0,
        raw_hex: raw ? raw.toString('hex') : null,
      });

      state.textSessionActive = true;
      if (parsed && parsed.text_session_id !== undefined) {
        state.textSessionId = parsed.text_session_id;
      }
      // Reset version on every new configuration — matches the C#
      // reference's ResetSession(). The Xbox's TextBufferVersion in
      // the config message is not the version we should resume from;
      // the protocol expects a fresh base of 0 for the new session.
      state.textVersion = 0;
      state.currentText = '';
      emitSession(true, state.textSessionId);
    } catch (e) {
      plog('warn', `Could not parse text config: ${e.message}`);
      state.textSessionActive = true;
      state.textVersion = 0;
      state.currentText = '';
      emitSession(true);
    }
  });

  // The Xbox broadcasts SystemTextInput when its own internal state of
  // the focused field changes (e.g. someone typing with a controller
  // via the on-screen keyboard). We must ACK it, and we update our
  // local version so subsequent sends from us use a base the Xbox
  // already knows about.
  state.sgClient._events.on('_on_systemtextinput', message => {
    const buf = message.packet_decoded && message.packet_decoded.decrypted_payload;
    const parsed = parseSystemTextInput(buf);
    plog('proto', 'Xbox SystemTextInput received', {
      ...parsed,
      length: buf ? buf.length : 0,
      hex: buf ? buf.toString('hex') : null,
    });
    if (!parsed) return;

    state.textSessionId = parsed.text_session_id;
    state.textVersion = parsed.submitted_version;
    sendAck(parsed.text_session_id, parsed.submitted_version);
  });

  // SystemTextAcknowledge from the Xbox confirms it processed our edit
  // up to a specific version. Update our local view so the next send
  // uses an up-to-date base_version.
  state.sgClient._events.on('_on_systemtextack', message => {
    const buf = message.packet_decoded && message.packet_decoded.decrypted_payload;
    const parsed = parseSystemTextAck(buf);
    plog('proto', 'Xbox SystemTextAcknowledge received', parsed);
    if (!parsed) return;
    if (parsed.text_version_ack > state.textVersion) {
      state.textVersion = parsed.text_version_ack;
    }
  });
}

module.exports = {
  sendText,
  submitText,
  cancelText,
  setupTextEventListeners,
};
