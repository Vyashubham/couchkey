// Errors the console layer can raise, with stable codes the GUI can map
// to help text. Messages are safe to show users; details go to logs.

export type ConsoleErrorCode =
  | 'NOT_CONNECTED'
  | 'CHANNEL_NOT_READY'
  | 'CONNECT_FAILED'
  | 'ANONYMOUS_BLOCKED'
  | 'REMOTE_DISABLED'
  | 'DEVICE_LIMIT'
  | 'DISCOVERY_FAILED'
  | 'UNKNOWN_BUTTON'
  | 'UNKNOWN_MEDIA_COMMAND'
  | 'SEND_FAILED';

export class ConsoleError extends Error {
  readonly code: ConsoleErrorCode;
  override readonly cause?: unknown;

  constructor(code: ConsoleErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'ConsoleError';
    this.code = code;
    this.cause = cause;
  }
}

function messageOf(err: unknown): string | undefined {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object') {
    const o = err as { message?: unknown; error?: unknown };
    if (typeof o.message === 'string') return o.message;
    if (typeof o.error === 'string') return o.error;
  }
  return undefined;
}

/** Translate a SmartGlass connect failure into a ConsoleError with user-facing help. */
export function toConnectError(err: unknown): ConsoleError {
  // Messages come from the library's connect_result table, e.g.
  // "No anonymous connections", "Smartglass is disabled on the Xbox console".
  const msg = messageOf(err) ?? 'Connection failed';
  const lower = msg.toLowerCase();
  if (lower.includes('anonymous')) {
    return new ConsoleError(
      'ANONYMOUS_BLOCKED',
      'Xbox is blocking connections from this device. On the Xbox, go to Settings → Devices & connections → '
        + 'Remote features and set "Xbox app preferences" to "Allow connections from any device".',
      err,
    );
  }
  if (lower.includes('device limit')) {
    return new ConsoleError(
      'DEVICE_LIMIT',
      'The Xbox has too many devices connected. Close the Xbox app or Couchkey on another device and try again.',
      err,
    );
  }
  if (lower.includes('disabled')) {
    return new ConsoleError(
      'REMOTE_DISABLED',
      'Remote features are turned off on your Xbox. Turn on Settings → Devices & connections → Remote features.',
      err,
    );
  }
  return new ConsoleError('CONNECT_FAILED', msg, err);
}
