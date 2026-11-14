// Raw SmartGlass packet builders for messages the library doesn't
// implement (text channel) or implements without acks (gamepad).
//
// SmartGlass message envelope (after the 2-byte type marker 0xD00D):
//   header: payload-length, sequence, target/source participant IDs,
//           flags (version|need_ack|fragment|type), channel ID
//   body:   payload, zero-padded to 16-byte alignment, AES-128-CBC encrypted
//   tail:   HMAC-SHA-256 signature
//
// Layouts follow the OpenXbox C# reference implementation:
// https://github.com/OpenXbox/xbox-smartglass-csharp

import PacketStructure from 'xbox-smartglass-core-node/src/packet/structure';
import type { SgConsole } from 'xbox-smartglass-core-node';

// Message flag values (16-bit): version(2)|need_ack(1)|is_fragment(1)|type(12)
const FLAG_SYSTEM_TEXT_INPUT = Buffer.from('af2c', 'hex'); // 0xF2C
const FLAG_SYSTEM_TEXT_ACK = Buffer.from('af34', 'hex'); // 0xF34
const FLAG_SYSTEM_TEXT_DONE = Buffer.from('af35', 'hex'); // 0xF35
// Gamepad (0xF0A). The library sends 0x8f0a (no ack requested); with the
// need_ack bit set the Xbox confirms every press it processed.
const FLAG_GAMEPAD_ACKED = Buffer.from('af0a', 'hex');
const FLAG_GAMEPAD = Buffer.from('8f0a', 'hex');
// Acknowledge (0x001). The library only ever sends 0x8001 (no reply
// requested); a keep-alive must request one or the Xbox has no reason
// to answer.
const FLAG_ACK = Buffer.from('8001', 'hex');
const FLAG_ACK_NEEDS_ACK = Buffer.from('a001', 'hex');
const CORE_CHANNEL = Buffer.alloc(8);

const PACKET_TYPE_MESSAGE = Buffer.from('d00d', 'hex');
const BLOCK_SIZE = 16;

export const TEXT_DONE_ACCEPT = 0;
export const TEXT_DONE_CANCEL = 1;

interface Envelope {
  xbox: SgConsole;
  channelId: Buffer;
}

/**
 * SmartGlass string: u16 byte length, UTF-8 bytes, NUL terminator.
 * The library's writeSGString uses the JS string length (UTF-16 units)
 * for the prefix, which is wrong for any non-ASCII text, so we encode
 * it ourselves, matching OpenXbox's BEWriter.WriteSGString.
 */
export function encodeSGString(text: string): Buffer {
  const bytes = Buffer.from(text, 'utf8');
  if (bytes.length > 0xffff) throw new RangeError('SmartGlass string too long');
  const len = Buffer.alloc(2);
  len.writeUInt16BE(bytes.length);
  return Buffer.concat([len, bytes, Buffer.from([0])]);
}

export function padTo16(buf: Buffer): Buffer {
  const remainder = buf.length % BLOCK_SIZE;
  if (remainder === 0) return buf;
  const padLen = BLOCK_SIZE - remainder;
  return Buffer.concat([buf, Buffer.alloc(padLen, padLen)]);
}

function seal({ xbox, channelId }: Envelope, flags: Buffer, payloadBuf: Buffer): Buffer {
  const header = PacketStructure();
  header.writeBytes(PACKET_TYPE_MESSAGE);
  header.writeUInt16(payloadBuf.length);
  header.writeUInt32(xbox._request_num);
  header.writeUInt32(xbox._target_participant_id);
  header.writeUInt32(xbox._source_participant_id);
  header.writeBytes(flags);
  header.writeBytes(Buffer.from(channelId));
  const headerBuf = header.toBuffer();

  const iv = xbox._crypto._encrypt(headerBuf.subarray(0, BLOCK_SIZE), xbox._crypto.getIv());
  const encrypted = xbox._crypto._encrypt(padTo16(payloadBuf), xbox._crypto.getEncryptionKey(), iv);
  const unsigned = Buffer.concat([headerBuf, encrypted]);
  return Buffer.concat([unsigned, Buffer.from(xbox._crypto._sign(unsigned))]);
}

/**
 * SystemTextInput (0xF2C), per OpenXbox SystemTextInputMessage.Serialize:
 * session_id u32, base_version u32, submitted_version u32, total_len u32,
 * selection_start i32 (-1), selection_length i32 (-1), flags u16,
 * chunk_byte_start u32, chunk (u16-prefixed string). Text goes LAST.
 */
export function buildTextInputPacket(
  env: Envelope & { text: string; sessionId: number; baseVersion: number; submittedVersion: number },
): Buffer {
  const payload = PacketStructure();
  payload.writeUInt32(env.sessionId);
  payload.writeUInt32(env.baseVersion);
  payload.writeUInt32(env.submittedVersion);
  payload.writeUInt32(Buffer.byteLength(env.text, 'utf8'));
  payload.writeInt32(-1);
  payload.writeInt32(-1);
  payload.writeUInt16(0);
  payload.writeUInt32(0);
  payload.writeBytes(encodeSGString(env.text));
  return seal(env, FLAG_SYSTEM_TEXT_INPUT, payload.toBuffer());
}

/** SystemTextAcknowledge (0xF34): session_id u32, version_ack u32. */
export function buildTextAckPacket(env: Envelope & { sessionId: number; versionAck: number }): Buffer {
  const payload = PacketStructure();
  payload.writeUInt32(env.sessionId);
  payload.writeUInt32(env.versionAck);
  return seal(env, FLAG_SYSTEM_TEXT_ACK, payload.toBuffer());
}

/** SystemTextDone (0xF35): session_id u32, version u32, flags u32 (not u16), result u32. */
export function buildTextDonePacket(
  env: Envelope & { sessionId: number; version: number; result: number },
): Buffer {
  const payload = PacketStructure();
  payload.writeUInt32(env.sessionId);
  payload.writeUInt32(env.version);
  payload.writeUInt32(0);
  payload.writeUInt32(env.result);
  return seal(env, FLAG_SYSTEM_TEXT_DONE, payload.toBuffer());
}

/**
 * Acknowledge (0x001): low_watermark u32, processed_list (u32 count + u32
 * ids), rejected_list (u32 count + u32 ids), on the core channel.
 * `lowWatermark` is the highest sequence number we've received from the
 * Xbox, not our own outgoing counter.
 */
export function buildAckPacket(env: {
  xbox: SgConsole;
  lowWatermark: number;
  processed?: number[];
  needAck?: boolean;
}): Buffer {
  const payload = PacketStructure();
  payload.writeUInt32(env.lowWatermark);
  const processed = env.processed ?? [];
  payload.writeUInt32(processed.length);
  for (const id of processed) payload.writeUInt32(id);
  payload.writeUInt32(0);
  return seal({ xbox: env.xbox, channelId: CORE_CHANNEL }, env.needAck ? FLAG_ACK_NEEDS_ACK : FLAG_ACK, payload.toBuffer());
}

/**
 * Gamepad (0xF0A), same layout the library packs: timestamp u64 ms,
 * buttons u16 bitmask, then triggers and thumbsticks (6 x 4 bytes, zero).
 */
export function buildGamepadPacket(
  env: Envelope & { buttons: number; needAck?: boolean; now?: number },
): Buffer {
  const payload = PacketStructure();
  const ts = Buffer.alloc(8);
  ts.writeBigUInt64BE(BigInt(env.now ?? Date.now()));
  payload.writeBytes(ts);
  payload.writeUInt16(env.buttons);
  for (let i = 0; i < 6; i++) payload.writeUInt32(0);
  return seal(env, env.needAck === false ? FLAG_GAMEPAD : FLAG_GAMEPAD_ACKED, payload.toBuffer());
}
