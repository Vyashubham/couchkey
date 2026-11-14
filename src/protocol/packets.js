'use strict';

// Raw SmartGlass packet builders.
//
// The Node.js xbox-smartglass-core-node library doesn't implement the Text
// channel messages, so we construct them by hand using the library's
// crypto + packet-structure primitives.
//
// SmartGlass message envelope (after the 2-byte type marker 0xD00D):
//   header: payload-length, sequence, target/source participant IDs,
//           flags (version|need_ack|fragment|type), channel ID
//   body:   payload, zero-padded to 16-byte alignment, AES-128-CBC encrypted
//   tail:   HMAC-SHA-256 signature

const PacketStructure = require('xbox-smartglass-core-node/src/packet/structure');

// Message flag values (16-bit): version(2)|need_ack(1)|is_fragment(1)|type(12)
const FLAG_SYSTEM_TEXT_INPUT = Buffer.from('af2c', 'hex'); // 0xF2C
const FLAG_SYSTEM_TEXT_ACK = Buffer.from('af34', 'hex');   // 0xF34
const FLAG_SYSTEM_TEXT_DONE = Buffer.from('af35', 'hex');  // 0xF35
// Gamepad (0xF0A). The library sends 0x8f0a (no ack requested); we
// set the need_ack bit so the Xbox confirms every press it processed.
const FLAG_GAMEPAD_ACKED = Buffer.from('af0a', 'hex');
const FLAG_GAMEPAD = Buffer.from('8f0a', 'hex');

const PACKET_TYPE_MESSAGE = Buffer.from('d00d', 'hex');
const BLOCK_SIZE = 16;

function padTo16(buf) {
  const remainder = buf.length % BLOCK_SIZE;
  if (remainder === 0) return buf;
  const padLen = BLOCK_SIZE - remainder;
  return Buffer.concat([buf, Buffer.alloc(padLen, padLen)]);
}

function buildMessageHeader({ xbox, channelId, flags, payloadLength }) {
  const header = PacketStructure();
  header.writeBytes(PACKET_TYPE_MESSAGE);
  header.writeUInt16(payloadLength);
  header.writeUInt32(xbox._request_num);
  header.writeUInt32(xbox._target_participant_id);
  header.writeUInt32(xbox._source_participant_id);
  header.writeBytes(flags);
  header.writeBytes(Buffer.from(channelId));
  return header;
}

function sealMessage({ xbox, header, payloadBuf }) {
  const padded = padTo16(payloadBuf);
  const iv = xbox._crypto._encrypt(header.toBuffer().slice(0, BLOCK_SIZE), xbox._crypto.getIv());
  const encrypted = xbox._crypto._encrypt(padded, xbox._crypto.getEncryptionKey(), iv);
  let packet = Buffer.concat([header.toBuffer(), encrypted]);
  const signature = xbox._crypto._sign(packet);
  packet = Buffer.concat([packet, Buffer.from(signature)]);
  return packet;
}

// SystemTextInput payload (flag 0xF2C). Layout matches OpenXbox C#
// SystemTextInputMessage.Serialize:
//   text_session_id        (u32 BE)
//   base_version           (u32 BE)   the version we believe the field is at
//   submitted_version      (u32 BE)   the new version after our edit (base + 1)
//   total_text_bytelength  (u32 BE)   length of the full buffer
//   selection_start        (i32 BE)   -1 = no selection
//   selection_length       (i32 BE)   -1 = no selection
//   flags                  (u16 BE)   0
//   text_chunk_byte_start  (u32 BE)   0 (we send the entire buffer in one chunk)
//   text_chunk             (u16-prefixed string)
//
// The handoff doc and most copy-paste references on the web have an
// older / hand-rolled layout (single version field, flags-before-text,
// delta_offset/delta_length pair). That layout makes the Xbox drop the
// packet silently — it ACKs the envelope but never reaches the field.
function buildTextInputPacket({
  xbox, channelId, text, sessionId, baseVersion, submittedVersion,
}) {
  if (!xbox || !channelId) throw new Error('buildTextInputPacket: missing xbox or channelId');

  const payload = PacketStructure();
  payload.writeUInt32(sessionId);
  payload.writeUInt32(baseVersion);
  payload.writeUInt32(submittedVersion);
  payload.writeUInt32(Buffer.byteLength(text, 'utf8'));   // total_text_bytelength
  payload.writeInt32(-1);                                  // selection_start
  payload.writeInt32(-1);                                  // selection_length
  payload.writeUInt16(0);                                  // flags
  payload.writeUInt32(0);                                  // text_chunk_byte_start
  payload.writeSGString(text);                             // text_chunk

  const payloadBuf = payload.toBuffer();
  const header = buildMessageHeader({
    xbox,
    channelId,
    flags: FLAG_SYSTEM_TEXT_INPUT,
    payloadLength: payloadBuf.length,
  });

  return sealMessage({ xbox, header, payloadBuf });
}

// SystemTextAcknowledge payload (flag 0xF34) — the C# reference client
// sends this after every SystemTextInput so the Xbox knows we've seen
// the latest version. Layout: session_id (u32), version_ack (u32).
function buildTextAckPacket({ xbox, channelId, sessionId, versionAck }) {
  if (!xbox || !channelId) throw new Error('buildTextAckPacket: missing xbox or channelId');

  const payload = PacketStructure();
  payload.writeUInt32(sessionId);
  payload.writeUInt32(versionAck);

  const payloadBuf = payload.toBuffer();
  const header = buildMessageHeader({
    xbox,
    channelId,
    flags: FLAG_SYSTEM_TEXT_ACK,
    payloadLength: payloadBuf.length,
  });

  return sealMessage({ xbox, header, payloadBuf });
}

// SystemTextDone payload (flag 0xF35). Layout matches OpenXbox C#
// SystemTextDoneMessage.Serialize:
//   text_session_id  (u32 BE)
//   text_version     (u32 BE)
//   flags            (u32 BE)   ← u32, not u16 like the handoff doc claimed
//   result           (u32 BE)   0 = Accept, 1 = Cancel
function buildTextDonePacket({ xbox, channelId, sessionId, version, result }) {
  if (!xbox || !channelId) throw new Error('buildTextDonePacket: missing xbox or channelId');

  const payload = PacketStructure();
  payload.writeUInt32(sessionId);
  payload.writeUInt32(version);
  payload.writeUInt32(0);             // flags (u32!)
  payload.writeUInt32(result);

  const payloadBuf = payload.toBuffer();
  const header = buildMessageHeader({
    xbox,
    channelId,
    flags: FLAG_SYSTEM_TEXT_DONE,
    payloadLength: payloadBuf.length,
  });

  return sealMessage({ xbox, header, payloadBuf });
}

// Gamepad payload (flag 0xF0A), same layout the library packs:
//   timestamp (u64 BE ms), buttons (u16 bitmask),
//   left/right trigger, left/right thumbstick x/y (6 x 4 bytes, zero).
function buildGamepadPacket({ xbox, channelId, buttons, needAck = true }) {
  if (!xbox || !channelId) throw new Error('buildGamepadPacket: missing xbox or channelId');

  const payload = PacketStructure();
  const ts = Buffer.alloc(8);
  ts.writeBigUInt64BE(BigInt(Date.now()));
  payload.writeBytes(ts);
  payload.writeUInt16(buttons);
  for (let i = 0; i < 6; i++) payload.writeUInt32(0);

  const payloadBuf = payload.toBuffer();
  const header = buildMessageHeader({
    xbox,
    channelId,
    flags: needAck ? FLAG_GAMEPAD_ACKED : FLAG_GAMEPAD,
    payloadLength: payloadBuf.length,
  });

  return sealMessage({ xbox, header, payloadBuf });
}

module.exports = {
  buildGamepadPacket,
  buildTextInputPacket,
  buildTextAckPacket,
  buildTextDonePacket,
};
