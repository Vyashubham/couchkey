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

// SystemTextInput payload (flag 0xF2C). Layout matches the OpenXbox
// C# reference (SmartGlass/Channels/Text/SystemTextInputMessage):
//   session_id (u32), version (u32), flags (u16), text (SGString),
//   delta_offset (u32), delta_length (u32),
//   selection_start (i32), selection_length (i32)
// Omitting the four trailing fields makes the Xbox silently drop the
// input — it acknowledges the packet but never updates the field.
function buildTextInputPacket({ xbox, channelId, text, sessionId, version }) {
  if (!xbox || !channelId) throw new Error('buildTextInputPacket: missing xbox or channelId');

  const payload = PacketStructure();
  payload.writeUInt32(sessionId);
  payload.writeUInt32(version);
  payload.writeUInt16(0);              // flags (0 = full replace)
  payload.writeSGString(text);         // text chunk
  payload.writeUInt32(0);              // delta_offset
  payload.writeUInt32(0);              // delta_length
  payload.writeInt32(text.length);     // selection_start (cursor at end)
  payload.writeInt32(0);               // selection_length (no selection)

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

// SystemTextDone payload (flag 0xF35) — Accept (result=0) or Cancel (result=1)
// the current text session.
function buildTextDonePacket({ xbox, channelId, sessionId, version, result }) {
  if (!xbox || !channelId) throw new Error('buildTextDonePacket: missing xbox or channelId');

  const payload = PacketStructure();
  payload.writeUInt32(sessionId);
  payload.writeUInt32(version);
  payload.writeUInt16(0);
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

module.exports = {
  buildTextInputPacket,
  buildTextAckPacket,
  buildTextDonePacket,
};
