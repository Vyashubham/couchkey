// Channel-open handshake, done by hand because the library waits for a
// console_status broadcast before opening channels and the Xbox Series X
// doesn't send one on anonymous connections.
//
// Each channel is a fixed service UUID. We use client request ids 10/11/12
// so we don't collide with the library's own managers (0 and 1).

import Packer from 'xbox-smartglass-core-node/src/packet/packer';
import type { SgClient } from 'xbox-smartglass-core-node';
import type { ChannelName } from '../types';

export interface ChannelDef {
  name: ChannelName;
  /** Library manager that owns this channel, if any (text has none). */
  manager: 'system_input' | 'system_media' | null;
  uuid: string;
  clientId: number;
}

export const CHANNEL_DEFS: readonly ChannelDef[] = [
  { name: 'input', manager: 'system_input', uuid: 'fa20b8ca66fb46e0adb60b978a59d35f', clientId: 10 },
  { name: 'media', manager: 'system_media', uuid: '48a9ca24eb6d4e128c43d57469edd3cd', clientId: 11 },
  { name: 'text', manager: null, uuid: '7af3e6a2488b40cba93179c04b7da3a0', clientId: 12 },
];

interface ChannelResponse {
  packet_decoded?: { protected_payload?: { channel_request_id?: number; result?: number; target_channel_id?: Buffer } };
}

export interface OpenChannelsOptions {
  staggerMs: number;
  onOpen: (def: ChannelDef, channelId: Buffer) => void;
  onRejected: (def: ChannelDef, result: number) => void;
  onSendError: (def: ChannelDef, err: unknown) => void;
}

/** Wire the library manager's private state so its sendCommand() works on our channel. */
export function adoptChannelIntoManager(client: SgClient, def: ChannelDef, channelId: Buffer): void {
  if (!def.manager) return;
  const cm = client.getManager(def.manager)?._channel_manager;
  if (!cm) return;
  cm._channel_status = true;
  cm._channel_server_id = channelId;
  cm._smartglass = client;
}

/** Send StartChannelRequests for all channels, staggered. Returns a cleanup function. */
export function openChannels(client: SgClient, opts: OpenChannelsOptions): () => void {
  const onResponse = (response: ChannelResponse): void => {
    const payload = response.packet_decoded?.protected_payload;
    if (!payload) return;
    const def = CHANNEL_DEFS.find(c => c.clientId === payload.channel_request_id);
    if (!def) return;
    if (payload.result !== 0 || !payload.target_channel_id) {
      opts.onRejected(def, payload.result ?? -1);
      return;
    }
    opts.onOpen(def, Buffer.from(payload.target_channel_id));
  };
  client._events.on('_on_start_channel_response', onResponse);

  const timers = CHANNEL_DEFS.map((def, i) =>
    setTimeout(() => {
      try {
        const request = Packer('message.start_channel_request');
        request.set('channel_request_id', def.clientId);
        request.set('title_id', 0);
        request.set('service', Buffer.from(def.uuid, 'hex'));
        request.set('activity_id', 0);
        client._console.get_requestnum();
        client._send(request.pack(client._console));
      } catch (err) {
        opts.onSendError(def, err);
      }
    }, i * opts.staggerMs),
  );

  return () => {
    timers.forEach(clearTimeout);
    client._events.off('_on_start_channel_response', onResponse);
  };
}
