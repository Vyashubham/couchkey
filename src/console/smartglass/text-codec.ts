// Parsers for text-channel messages from the Xbox. The library has no
// schema for them, so `decrypted_payload` arrives raw.

import type { TextAckFromConsole, TextConfiguration, TextInputFromConsole } from '../types';

/** SystemTextConfiguration: session u32, buffer_version u32, options u32, input_scope u32, max_len i32. */
export function parseTextConfiguration(buf: Buffer | undefined): TextConfiguration | null {
  if (!buf || buf.length < 4) return null;
  const out: TextConfiguration = { sessionId: buf.readUInt32BE(0) };
  if (buf.length >= 8) out.bufferVersion = buf.readUInt32BE(4);
  if (buf.length >= 12) out.options = buf.readUInt32BE(8);
  if (buf.length >= 16) out.inputScope = buf.readUInt32BE(12);
  if (buf.length >= 20) out.maxLength = buf.readInt32BE(16);
  return out;
}

/** SystemTextInput from the Xbox: same leading layout as ours. The text itself is deliberately not decoded. */
export function parseTextInput(buf: Buffer | undefined): TextInputFromConsole | null {
  if (!buf || buf.length < 28) return null;
  return {
    sessionId: buf.readUInt32BE(0),
    baseVersion: buf.readUInt32BE(4),
    submittedVersion: buf.readUInt32BE(8),
  };
}

/** SystemTextAcknowledge: session u32, version_ack u32. */
export function parseTextAck(buf: Buffer | undefined): TextAckFromConsole | null {
  if (!buf || buf.length < 8) return null;
  return { sessionId: buf.readUInt32BE(0), versionAck: buf.readUInt32BE(4) };
}
