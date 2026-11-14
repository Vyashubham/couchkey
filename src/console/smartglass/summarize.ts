// Small, safe summaries of library events for debug logs. Packet objects
// are huge and can carry certificates or text, so we pick header fields
// only and never include payload bytes of text messages.

const TEXT_EVENTS = new Set(['_on_systemtextinput', '_on_systemtextconfiguration', '_on_systemtextack', '_on_systemtextdone']);

interface PacketLike {
  packet_decoded?: {
    type?: unknown;
    name?: unknown;
    flags?: unknown;
    sequence_number?: unknown;
    protected_payload?: unknown;
  };
}

export function summarizeEvent(eventName: string, args: unknown[]): Record<string, unknown> {
  const first = args[0] as PacketLike | undefined;
  const pd = first?.packet_decoded;
  if (!pd) return { argCount: args.length };
  const out: Record<string, unknown> = {
    type: pd.type,
    name: pd.name,
    flags: pd.flags,
    sequence: pd.sequence_number,
  };
  if (!TEXT_EVENTS.has(eventName) && pd.protected_payload && typeof pd.protected_payload === 'object'
      && !Buffer.isBuffer(pd.protected_payload)) {
    const payload: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(pd.protected_payload)) {
      if (Buffer.isBuffer(v)) payload[k] = `[${v.length} bytes]`;
      else if (k === 'certificate') payload[k] = '[certificate]';
      else payload[k] = v;
    }
    out.payload = payload;
  }
  return out;
}
