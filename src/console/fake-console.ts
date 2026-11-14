// In-memory Xbox for tests and demo mode. Implements ConsoleAdapter and
// can be scripted: which consoles discovery finds, whether connect
// succeeds, how gamepad confirmations behave, and when the console opens
// a text session. Every call is recorded for assertions.

import { TypedEmitter } from './emitter';
import { ConsoleError } from './errors';
import type {
  ChannelName,
  ConsoleAdapter,
  ConsoleEventName,
  ConsoleEvents,
  DiscoveredConsole,
  Listener,
  MediaCommand,
  SendOutcome,
} from './types';
import { BUTTON_MASKS } from './types';

export type AckBehavior = 'confirm' | 'reject' | 'drop';

export interface FakeConsoleOptions {
  consoles?: DiscoveredConsole[];
  /** Error to throw from connect(), or null to succeed. */
  connectError?: ConsoleError | null;
  /** How confirmations behave for acked gamepad sends. Can be a function of the send index. */
  ack?: AckBehavior | ((index: number) => AckBehavior);
  /** Open channels as soon as connect resolves (default true). */
  autoOpenChannels?: boolean;
}

export type FakeCall =
  | { kind: 'gamepad'; mask: number; ack: boolean; outcome: SendOutcome }
  | { kind: 'media'; command: MediaCommand }
  | { kind: 'text-input'; sessionId: number; baseVersion: number; submittedVersion: number; text: string }
  | { kind: 'text-ack'; sessionId: number; versionAck: number }
  | { kind: 'text-done'; sessionId: number; version: number; accept: boolean };

const MASK_TO_BUTTON = new Map<number, string>(Object.entries(BUTTON_MASKS).map(([b, m]) => [m, b]));

export class FakeConsole implements ConsoleAdapter {
  readonly calls: FakeCall[] = [];
  private readonly events = new TypedEmitter<ConsoleEvents>();
  private connectedIp: string | null = null;
  private open: Record<ChannelName, boolean> = { input: false, media: false, text: false };
  private gamepadSends = 0;

  constructor(private options: FakeConsoleOptions = {}) {}

  configure(options: Partial<FakeConsoleOptions>): void {
    this.options = { ...this.options, ...options };
  }

  discover(ip?: string): Promise<DiscoveredConsole[]> {
    const all = this.options.consoles ?? [{ name: 'Fake Xbox', ip: '192.0.2.10' }];
    return Promise.resolve(ip ? all.filter(c => c.ip === ip) : all);
  }

  connect(ip: string): Promise<void> {
    if (this.options.connectError) return Promise.reject(this.options.connectError);
    this.connectedIp = ip;
    this.events.emit('connected', { ip });
    if (this.options.autoOpenChannels !== false) this.openChannels();
    return Promise.resolve();
  }

  disconnect(): void {
    this.drop('requested');
  }

  isConnected(): boolean {
    return this.connectedIp !== null;
  }

  channels(): Record<ChannelName, boolean> {
    return { ...this.open };
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- async so channel errors reject
  async sendGamepadState(mask: number, opts: { ack?: boolean } = {}): Promise<SendOutcome> {
    this.requireChannel('input');
    const ack = opts.ack === true;
    const index = this.gamepadSends++;
    let outcome: SendOutcome = 'sent';
    if (ack) {
      const rule = this.options.ack ?? 'confirm';
      const behavior = typeof rule === 'function' ? rule(index) : rule;
      outcome = behavior === 'confirm' ? 'confirmed' : behavior === 'reject' ? 'rejected' : 'timeout';
    }
    this.calls.push({ kind: 'gamepad', mask, ack, outcome });
    return outcome;
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- async so channel errors reject
  async sendMedia(command: MediaCommand): Promise<void> {
    this.requireChannel('media');
    this.calls.push({ kind: 'media', command });
  }

  sendTextInput(input: { sessionId: number; baseVersion: number; submittedVersion: number; text: string }): void {
    this.requireChannel('text');
    this.calls.push({ kind: 'text-input', ...input });
  }

  sendTextAck(sessionId: number, versionAck: number): void {
    this.requireChannel('text');
    this.calls.push({ kind: 'text-ack', sessionId, versionAck });
  }

  sendTextDone(sessionId: number, version: number, accept: boolean): void {
    this.requireChannel('text');
    this.calls.push({ kind: 'text-done', sessionId, version, accept });
  }

  on<E extends ConsoleEventName>(event: E, listener: Listener<E>): () => void {
    return this.events.on(event, listener);
  }

  // --- scripting helpers -------------------------------------------------

  /** Open all channels (call manually when autoOpenChannels is false). */
  openChannels(): void {
    for (const name of ['input', 'media', 'text'] as const) {
      this.open[name] = true;
      this.events.emit('channel', { name, open: true });
    }
  }

  /** The console focuses a system text field. */
  openTextSession(sessionId = 1): void {
    this.events.emit('text-config', { sessionId, bufferVersion: 0 });
  }

  /** The console reports its own edit (e.g. someone typed with a controller). */
  consoleEdited(sessionId: number, submittedVersion: number): void {
    this.events.emit('text-input', { sessionId, baseVersion: submittedVersion - 1, submittedVersion });
  }

  /** Simulate the connection dropping. */
  drop(reason: 'requested' | 'timeout' | 'error' = 'timeout'): void {
    if (this.connectedIp === null) return;
    this.connectedIp = null;
    this.open = { input: false, media: false, text: false };
    this.events.emit('disconnected', { reason });
  }

  /** Buttons pressed so far, in order (non-zero gamepad states). */
  pressedButtons(): string[] {
    return this.calls
      .filter((c): c is Extract<FakeCall, { kind: 'gamepad' }> => c.kind === 'gamepad' && c.mask !== 0)
      .map(c => MASK_TO_BUTTON.get(c.mask) ?? `mask:${c.mask}`);
  }

  private requireChannel(name: ChannelName): void {
    if (!this.isConnected()) throw new ConsoleError('NOT_CONNECTED', 'Not connected to an Xbox');
    if (!this.open[name]) throw new ConsoleError('CHANNEL_NOT_READY', `The ${name} channel is not open yet`);
  }
}
