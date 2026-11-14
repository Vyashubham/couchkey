// Replacement for the library's keep-alive loop.
//
// The library sends one keep-alive 4 s after the last received packet
// and aborts after 8 s of silence. Under rapid gamepad input the event
// loop is busy with sends, inbound acks queue up, and the "last
// received" timestamp falls behind even though the Xbox is fine. So we
// send keep-alives repeatedly and tolerate a longer silence.

import Packer from 'xbox-smartglass-core-node/src/packet/packer';
import type { SgClient } from 'xbox-smartglass-core-node';

export interface HeartbeatOptions {
  timeoutSec: number;
  keepAliveAfterSec: number;
  keepAliveIntervalSec: number;
  onTimeout: (silentSec: number) => void;
  onKeepAliveError?: (err: unknown) => void;
  nowSec?: () => number;
}

const defaultNowSec = (): number => Math.floor(Date.now() / 1000);

function sendKeepAlive(client: SgClient): void {
  const xbox = client._console;
  xbox.get_requestnum();
  const ack = Packer('message.acknowledge');
  ack.set('low_watermark', xbox._request_num);
  client._send(ack.pack(xbox));
}

/** Install our heartbeat on a connected client. Returns a function that stops it. */
export function installHeartbeat(client: SgClient, opts: HeartbeatOptions): () => void {
  const nowSec = opts.nowSec ?? defaultNowSec;
  if (client._interval_timeout) {
    clearInterval(client._interval_timeout);
    client._interval_timeout = false;
  }

  const handle = setInterval(() => {
    if (!client._connection_status) {
      clearInterval(handle);
      return;
    }
    const silent = nowSec() - client._last_received_time;

    if (silent >= opts.keepAliveAfterSec && silent % opts.keepAliveIntervalSec === 0) {
      try {
        sendKeepAlive(client);
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
    clearInterval(handle);
    if (client._interval_timeout === handle) client._interval_timeout = false;
  };
}
