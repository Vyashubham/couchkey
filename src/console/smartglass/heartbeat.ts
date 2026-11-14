// Replacement for the library's keep-alive loop.
//
// The library sends one keep-alive 4 s after the last received packet
// and aborts after 8 s of silence. Under rapid gamepad input the event
// loop is busy with sends, inbound acks queue up, and the "last
// received" timestamp falls behind even though the Xbox is fine. So we
// send keep-alives repeatedly and tolerate a longer silence.

import type { SgClient } from 'xbox-smartglass-core-node';
import { buildAckPacket } from './packets';

export interface HeartbeatOptions {
  timeoutSec: number;
  keepAliveAfterSec: number;
  keepAliveIntervalSec: number;
  onTimeout: (silentSec: number) => void;
  onKeepAliveError?: (err: unknown) => void;
  nowSec?: () => number;
}

const defaultNowSec = (): number => Math.floor(Date.now() / 1000);

/** Sequence number from a raw SmartGlass message header (0xD00D), if any. */
export function sequenceOf(raw: unknown): number | null {
  if (!Buffer.isBuffer(raw) || raw.length < 8) return null;
  if (raw.readUInt16BE(0) !== 0xd00d) return null;
  return raw.readUInt32BE(4);
}

/**
 * Keep-alive: an Acknowledge that requests a reply (need_ack), reporting
 * the last sequence number we received. The library's version did
 * neither, so once the Xbox stopped pinging us (it does after gamepad
 * input) nothing made it answer and the session timed out.
 */
function sendKeepAlive(client: SgClient, lastReceivedSeq: number): void {
  const xbox = client._console;
  xbox.get_requestnum();
  client._send(buildAckPacket({ xbox, lowWatermark: lastReceivedSeq, needAck: true }));
}

/** Install our heartbeat on a connected client. Returns a function that stops it. */
export function installHeartbeat(client: SgClient, opts: HeartbeatOptions): () => void {
  const nowSec = opts.nowSec ?? defaultNowSec;
  if (client._interval_timeout) {
    clearInterval(client._interval_timeout);
    client._interval_timeout = false;
  }

  let lastReceivedSeq = 0;
  const onReceive = (raw: unknown): void => {
    const seq = sequenceOf(raw);
    if (seq !== null && seq > lastReceivedSeq) lastReceivedSeq = seq;
  };
  client._events.on('receive', onReceive);

  const handle = setInterval(() => {
    if (!client._connection_status) {
      clearInterval(handle);
      return;
    }
    const silent = nowSec() - client._last_received_time;

    if (silent >= opts.keepAliveAfterSec && silent % opts.keepAliveIntervalSec === 0) {
      try {
        sendKeepAlive(client, lastReceivedSeq);
      } catch (err) {
        opts.onKeepAliveError?.(err);
      }
    }

    if (silent > opts.timeoutSec) {
      clearInterval(handle);
      try { client._closeClient(); } catch { /* already closed */ }
      opts.onTimeout(silent);
    }
  }, 1000);

  client._interval_timeout = handle;
  return () => {
    client._events.off('receive', onReceive);
    clearInterval(handle);
    if (client._interval_timeout === handle) client._interval_timeout = false;
  };
}
