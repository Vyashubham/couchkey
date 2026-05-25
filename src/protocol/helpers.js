'use strict';

// Translate an error from the SmartGlass library into a message that
// makes sense to a user looking at the GUI.
function parseConnectionError(err) {
  if (err && err.message) {
    if (err.message.includes('anonymous')) {
      return 'Xbox is blocking anonymous connections. On the Xbox, go to '
        + 'Settings -> Devices & connections -> Remote features and set '
        + '"Xbox app preferences" to "Allow connections from any device".';
    }
    if (err.message.includes('disabled')) {
      return 'SmartGlass is disabled on your Xbox. Enable Remote features '
        + 'in Settings -> Devices & connections.';
    }
    return err.message;
  }
  if (err && err.error) return err.error;
  return JSON.stringify(err);
}

// Build a small, human-readable view of a SmartGlass event payload for
// the protocol log. The library's events carry an entire packet object;
// dumping it verbatim spams the GUI, so we pluck out the interesting
// header fields and truncate long binary blobs (certificates, etc.).
function summarizeEventData(eventName, args) {
  try {
    if (args[0] && args[0].packet_decoded) {
      const pd = args[0].packet_decoded;
      const protectedPayload = pd.protected_payload
        ? {
            ...pd.protected_payload,
            certificate: pd.protected_payload.certificate
              ? `[${pd.protected_payload.certificate.length} bytes]`
              : undefined,
          }
        : undefined;
      return {
        type: pd.type,
        name: pd.name || args[0].name,
        flags: pd.flags,
        sequence_number: pd.sequence_number,
        source_participant_id: pd.source_participant_id,
        target_participant_id: pd.target_participant_id,
        protected_payload: protectedPayload,
      };
    }
    return { arg_count: args.length };
  } catch (e) {
    return { error: 'Could not summarize', detail: e.message };
  }
}

module.exports = {
  parseConnectionError,
  summarizeEventData,
};
