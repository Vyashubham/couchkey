// ConsoleAdapter backed by xbox-smartglass-core-node. This folder is the
// only place allowed to import the library or touch its private fields.

import Smartglass, { type SgClient } from 'xbox-smartglass-core-node';
import SystemInputChannel from 'xbox-smartglass-core-node/src/channels/systeminput';
import SystemMediaChannel from 'xbox-smartglass-core-node/src/channels/systemmedia';
import { TypedEmitter } from '../emitter';
import { ConsoleError, toConnectError } from '../errors';
import type {
  ChannelName,
  ConsoleAdapter,
  ConsoleEventName,
  ConsoleEvents,
  DiscoveredConsole,
  Listener,
  MediaCommand,
  SendOutcome,
} from '../types';
import { AckTracker } from './ack-tracker';
import { CHANNEL_DEFS, adoptChannelIntoManager, openChannels } from './channels';
import { installHeartbeat } from './heartbeat';
import {
  TEXT_DONE_ACCEPT,
  TEXT_DONE_CANCEL,
  buildGamepadPacket,
  buildTextAckPacket,
  buildTextDonePacket,
  buildTextInputPacket,
} from './packets';
import { summarizeEvent } from './summarize';
import { parseTextAck, parseTextConfiguration, parseTextInput } from './text-codec';

export interface SmartGlassAdapterOptions {
  createClient?: () => SgClient;
  heartbeat?: { timeoutSec: number; keepAliveAfterSec: number; keepAliveIntervalSec: number };
  channelOpenDelayMs?: number;
  channelOpenStaggerMs?: number;
  ackTimeoutMs?: number;
}

interface RawMessage {
  packet_decoded?: { decrypted_payload?: Buffer; protected_payload?: unknown };
}

const QUIET_EVENTS = new Set(['newListener', 'removeListener', 'receive']);

export class SmartGlassAdapter implements ConsoleAdapter {
  private readonly events = new TypedEmitter<ConsoleEvents>();
  private readonly acks = new AckTracker();
  private client: SgClient | null = null;
  private channelIds: Partial<Record<ChannelName, Buffer>> = {};
  private cleanups: (() => void)[] = [];
  private readonly opts: Required<SmartGlassAdapterOptions>;

  constructor(options: SmartGlassAdapterOptions = {}) {
    this.opts = {
      createClient: options.createClient ?? (() => Smartglass()),
      heartbeat: options.heartbeat ?? { timeoutSec: 30, keepAliveAfterSec: 3, keepAliveIntervalSec: 2 },
      channelOpenDelayMs: options.channelOpenDelayMs ?? 500,
      channelOpenStaggerMs: options.channelOpenStaggerMs ?? 200,
      ackTimeoutMs: options.ackTimeoutMs ?? 1000,
    };
  }

  async discover(ip?: string): Promise<DiscoveredConsole[]> {
    try {
      const found = await this.opts.createClient().discovery(ip);
      return found.map(c => ({
        name: c.message.name ?? 'Xbox',
        ip: c.remote.address,
        ...(c.message.type !== undefined ? { type: c.message.type } : {}),
      }));
    } catch (err) {
      throw new ConsoleError('DISCOVERY_FAILED', 'Could not search the network for an Xbox', err);
    }
  }

  async connect(ip: string): Promise<void> {
    this.teardown();
    const client = this.opts.createClient();
    this.client = client;
    this.instrument(client);
    client.addManager('system_input', SystemInputChannel());
    client.addManager('system_media', SystemMediaChannel());

    try {
      await client.connect(ip);
    } catch (err) {
      if (this.client === client) this.client = null;
      throw toConnectError(err);
    }
    if (this.client !== client) return; // superseded by a newer connect/disconnect

    this.cleanups.push(
      installHeartbeat(client, {
        ...this.opts.heartbeat,
        onTimeout: silent => {
          if (this.client === client) this.drop('timeout', `No reply from the Xbox for ${silent}s`);
        },
        onKeepAliveError: err => {
          this.events.emit('protocol', { event: 'keepalive-error', detail: { error: String(err) } });
        },
      }),
    );
    this.listenForTextAndAcks(client);
    // The library's own timeout path (kept as a safety net).
    const onTimeout = (): void => {
      if (this.client === client) this.drop('timeout');
    };
    client._events.on('_on_timeout', onTimeout);
    this.cleanups.push(() => client._events.off('_on_timeout', onTimeout));

    const timer = setTimeout(() => {
      this.cleanups.push(
        openChannels(client, {
          staggerMs: this.opts.channelOpenStaggerMs,
          onOpen: (def, channelId) => {
            this.channelIds[def.name] = channelId;
            adoptChannelIntoManager(client, def, channelId);
            this.events.emit('channel', { name: def.name, open: true });
          },
          onRejected: (def, result) => {
            this.events.emit('protocol', { event: 'channel-rejected', detail: { channel: def.name, result } });
          },
          onSendError: (def, err) => {
            this.events.emit('protocol', { event: 'channel-request-failed', detail: { channel: def.name, error: String(err) } });
          },
        }),
      );
    }, this.opts.channelOpenDelayMs);
    this.cleanups.push(() => { clearTimeout(timer); });

    this.events.emit('connected', { ip });
  }

  disconnect(): void {
    const client = this.client;
    if (!client) return;
    try { client.disconnect(); } catch { /* socket may already be gone */ }
    this.drop('requested');
  }

  isConnected(): boolean {
    return this.client?.isConnected() === true;
  }

  channels(): Record<ChannelName, boolean> {
    const out = { input: false, media: false, text: false };
    for (const def of CHANNEL_DEFS) out[def.name] = this.channelIds[def.name] !== undefined;
    return out;
  }

  async sendGamepadState(mask: number, opts: { ack?: boolean } = {}): Promise<SendOutcome> {
    const { client, channelId } = this.ready('input');
    const ack = opts.ack === true;
    client._console.get_requestnum();
    const seq = client._console._request_num;
    const packet = buildGamepadPacket({ xbox: client._console, channelId, buttons: mask, needAck: ack });
    const outcome = ack ? this.acks.track(seq, this.opts.ackTimeoutMs) : Promise.resolve<SendOutcome>('sent');
    try {
      client._send(packet);
    } catch (err) {
      throw new ConsoleError('SEND_FAILED', 'Could not send to the Xbox', err);
    }
    return outcome;
  }

  async sendMedia(command: MediaCommand): Promise<void> {
    const { client } = this.ready('media');
    const mgr = client.getManager('system_media');
    if (!mgr) throw new ConsoleError('CHANNEL_NOT_READY', 'The media channel is not open yet');
    try {
      await mgr.sendCommand(command);
    } catch (err) {
      throw new ConsoleError('SEND_FAILED', 'Could not send the media command', err);
    }
  }

  sendTextInput(input: { sessionId: number; baseVersion: number; submittedVersion: number; text: string }): void {
    const { client, channelId } = this.ready('text');
    client._console.get_requestnum();
    client._send(buildTextInputPacket({ xbox: client._console, channelId, ...input }));
  }

  sendTextAck(sessionId: number, versionAck: number): void {
    const { client, channelId } = this.ready('text');
    client._console.get_requestnum();
    client._send(buildTextAckPacket({ xbox: client._console, channelId, sessionId, versionAck }));
  }

  sendTextDone(sessionId: number, version: number, accept: boolean): void {
    const { client, channelId } = this.ready('text');
    client._console.get_requestnum();
    client._send(buildTextDonePacket({
      xbox: client._console,
      channelId,
      sessionId,
      version,
      result: accept ? TEXT_DONE_ACCEPT : TEXT_DONE_CANCEL,
    }));
  }

  on<E extends ConsoleEventName>(event: E, listener: Listener<E>): () => void {
    return this.events.on(event, listener);
  }

  // --- internals ---------------------------------------------------------

  private ready(name: ChannelName): { client: SgClient; channelId: Buffer } {
    const client = this.client;
    if (!client?.isConnected()) throw new ConsoleError('NOT_CONNECTED', 'Not connected to an Xbox');
    const channelId = this.channelIds[name];
    if (!channelId) throw new ConsoleError('CHANNEL_NOT_READY', `The ${name} channel is not open yet`);
    return { client, channelId };
  }

  /** Mirror library events into our 'protocol' stream (summaries only). */
  private instrument(client: SgClient): void {
    const original = client._events.emit.bind(client._events);
    client._events.emit = (eventName: string | symbol, ...args: unknown[]): boolean => {
      if (typeof eventName === 'string' && !QUIET_EVENTS.has(eventName)) {
        this.events.emit('protocol', { event: eventName, detail: summarizeEvent(eventName, args) });
      }
      return original(eventName, ...args);
    };
  }

  private listenForTextAndAcks(client: SgClient): void {
    const on = (event: string, fn: (m: RawMessage) => void): void => {
      client._events.on(event, fn);
      this.cleanups.push(() => client._events.off(event, fn));
    };
    on('_on_acknowledge', m => { this.acks.handle(m.packet_decoded?.protected_payload); });
    on('_on_systemtextconfiguration', m => {
      const cfg = parseTextConfiguration(m.packet_decoded?.decrypted_payload);
      if (cfg) this.events.emit('text-config', cfg);
    });
    on('_on_systemtextinput', m => {
      const input = parseTextInput(m.packet_decoded?.decrypted_payload);
      if (input) this.events.emit('text-input', input);
    });
    on('_on_systemtextack', m => {
      const ack = parseTextAck(m.packet_decoded?.decrypted_payload);
      if (ack) this.events.emit('text-ack', ack);
    });
  }

  private drop(reason: 'requested' | 'timeout' | 'error', message?: string): void {
    this.teardown();
    this.events.emit('disconnected', message ? { reason, message } : { reason });
  }

  private teardown(): void {
    for (const fn of this.cleanups.splice(0)) {
      try { fn(); } catch { /* best effort */ }
    }
    this.acks.clear();
    const wasOpen = Object.keys(this.channelIds) as ChannelName[];
    this.channelIds = {};
    for (const name of wasOpen) this.events.emit('channel', { name, open: false });
    this.client = null;
  }
}
