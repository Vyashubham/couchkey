// The contract between Couchkey and an Xbox. Everything above this layer
// (services, server, GUI) talks to a ConsoleAdapter; only the SmartGlass
// implementation knows about the protocol library. Tests and demo mode
// use FakeConsole.

export const BUTTON_MASKS = {
  nexus: 2,
  // NOTE: OpenXbox docs list Menu = 4 and View = 8; the library has them
  // the other way round. Kept as the library has it until verified on a
  // console (ROADMAP T-402).
  view: 4,
  menu: 8,
  a: 16,
  b: 32,
  x: 64,
  y: 128,
  up: 256,
  down: 512,
  left: 1024,
  right: 2048,
  left_shoulder: 4096,
  right_shoulder: 8192,
  left_thumbstick: 16384,
  right_thumbstick: 32768,
} as const;

export type Button = keyof typeof BUTTON_MASKS;

export function isButton(name: string): name is Button {
  return Object.hasOwn(BUTTON_MASKS, name);
}

export const MEDIA_COMMANDS = [
  'play', 'pause', 'playpause', 'stop', 'record', 'next_track', 'prev_track',
  'fast_forward', 'rewind', 'channel_up', 'channel_down', 'back', 'view', 'menu',
] as const;
export type MediaCommand = (typeof MEDIA_COMMANDS)[number];

export function isMediaCommand(name: string): name is MediaCommand {
  return (MEDIA_COMMANDS as readonly string[]).includes(name);
}

export type ChannelName = 'input' | 'media' | 'text';

export interface DiscoveredConsole {
  name: string;
  ip: string;
  /** Console type id from the discovery response, if present. */
  type?: number;
}

/** Outcome of one gamepad state send. */
export type SendOutcome =
  | 'sent'       // no confirmation requested
  | 'confirmed'  // Xbox acknowledged it
  | 'rejected'   // Xbox explicitly rejected it
  | 'timeout';   // confirmation requested but none arrived

export interface TextConfiguration {
  sessionId: number;
  bufferVersion?: number;
  options?: number;
  inputScope?: number;
  maxLength?: number;
}

export interface TextInputFromConsole {
  sessionId: number;
  baseVersion: number;
  submittedVersion: number;
}

export interface TextAckFromConsole {
  sessionId: number;
  versionAck: number;
}

export type DisconnectReason = 'requested' | 'timeout' | 'error';

export interface ConsoleEvents {
  connected: { ip: string };
  disconnected: { reason: DisconnectReason; message?: string };
  channel: { name: ChannelName; open: boolean };
  'text-config': TextConfiguration;
  'text-input': TextInputFromConsole;
  'text-ack': TextAckFromConsole;
  /** Low-level protocol activity for debug logs. Never contains typed text. */
  protocol: { event: string; detail?: Record<string, unknown> };
}

export type ConsoleEventName = keyof ConsoleEvents;
export type Listener<E extends ConsoleEventName> = (payload: ConsoleEvents[E]) => void;

export interface ConsoleAdapter {
  discover(ip?: string): Promise<DiscoveredConsole[]>;
  /** Resolves once the session is up; channels open asynchronously (see 'channel'). */
  connect(ip: string): Promise<void>;
  disconnect(): void;
  isConnected(): boolean;
  channels(): Record<ChannelName, boolean>;

  /** Send a full gamepad button state (bitmask; 0 = all released). */
  sendGamepadState(mask: number, opts?: { ack?: boolean }): Promise<SendOutcome>;
  sendMedia(command: MediaCommand): Promise<void>;

  sendTextInput(input: { sessionId: number; baseVersion: number; submittedVersion: number; text: string }): void;
  sendTextAck(sessionId: number, versionAck: number): void;
  sendTextDone(sessionId: number, version: number, accept: boolean): void;

  on<E extends ConsoleEventName>(event: E, listener: Listener<E>): () => void;
}
