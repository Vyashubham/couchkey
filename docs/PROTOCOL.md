# SmartGlass on the wire

Notes on the bits of the SmartGlass protocol that this project actually
exercises. The authoritative reference is the C# implementation at
[OpenXbox/xbox-smartglass-csharp](https://github.com/OpenXbox/xbox-smartglass-csharp);
this document collects only what we needed to know to make the Series X
work and to fix the text channel.

## Transport

- SmartGlass speaks UDP on port **5050**, both directions.
- Discovery is a single UDP broadcast (`PresenceRequest`) on port 5050;
  every console on the subnet replies with its name, UUID, and
  certificate.
- Once connected, every message is **AES-128-CBC encrypted** with an
  **HMAC-SHA-256 signature** appended. Keys are derived via ECDH from
  the certificate exchange during connect.

We delegate the crypto and the connect handshake to
`xbox-smartglass-core-node`. Everything in this repo is either
*on top of* the established encrypted session, or a workaround for
quirks the library doesn't handle.

## Message envelope

After the 2-byte `0xD00D` type marker, every encrypted message has the
same header:

```
+----------------------------------+
| 0xD00D                  (u16)    |  packet type: message
| payload_length          (u16)    |  unencrypted payload length
| sequence_number         (u32)    |  per-source send counter
| target_participant_id   (u32)    |  who this is for
| source_participant_id   (u32)    |  who sent it
| message_flags           (u16)    |  see below
| channel_id              (u64)    |  which channel
+----------------------------------+
| encrypted payload, padded to 16 |
+----------------------------------+
| HMAC-SHA-256 signature  (32B)    |
+----------------------------------+
```

`message_flags` is two bytes, packed as:

```
| version (2 bits) | need_ack (1) | is_fragment (1) | type (12 bits) |
```

The 12-bit `type` is what identifies the actual message. Values used
in this project:

| Hex flags | type (12 bit) | Meaning                  |
| --------- | -------------:| ------------------------ |
| `0x8F0A`  |       `0xF0A` | Gamepad input            |
| `0xA026`  |       `0x026` | StartChannelRequest      |
| `0xAF2C`  |       `0xF2C` | SystemTextInput          |
| `0xAF34`  |       `0xF34` | SystemTextAcknowledge    |
| `0xAF35`  |       `0xF35` | SystemTextDone           |

## Channels

Each SmartGlass channel is identified by a 16-byte service UUID. The
client requests a channel with a `StartChannelRequest`, the Xbox
responds with a `StartChannelResponse` that includes the runtime
channel ID (8 bytes) used in subsequent messages on that channel.

| Channel       | Service UUID                          |
| ------------- | ------------------------------------- |
| SystemInput   | `fa20b8ca-66fb-46e0-adb6-0b978a59d35f` |
| SystemMedia   | `48a9ca24-eb6d-4e12-8c43-d57469edd3cd` |
| SystemText    | `7af3e6a2-488b-40cb-a931-79c04b7da3a0` |

### Series X workaround: console_status

On Xbox One, the library opens these channels automatically because
the console sends a `console_status` broadcast immediately after the
anonymous connect resolves. The library's channel manager hooks on
that event and fires the `StartChannelRequest`s.

On Xbox Series X|S with an anonymous connection, that broadcast never
arrives. The library waits forever. We work around this in
`src/protocol/channels.js` by manually building and sending the
`StartChannelRequest`s 500 ms after the connect resolves. We use
client request IDs `10/11/12` so they don't collide with the library's
own managers (which use `0` and `1`).

When the response arrives, we either populate the library manager's
private fields (`_channel_status`, `_channel_server_id`,
`_smartglass`) for `SystemInput` and `SystemMedia`, or store the
assigned channel ID in our own state for `SystemText`.

## SystemText channel

The library has no manager for `SystemText`, so the entire client side
is in this repo (`src/xbox/text.js` and `src/protocol/packets.js`).

### Session lifecycle

```
Xbox  →  client : SystemTextConfiguration  (text field gained focus)
client →  Xbox  : SystemTextInput          (one or more, with version 1..N)
client →  Xbox  : SystemTextAcknowledge    (after every input)
client →  Xbox  : SystemTextDone           (Accept = 0, Cancel = 1)
```

`SystemTextConfiguration` carries the `text_session_id` we have to
echo on every subsequent send. The version counter starts at 0 each
time a configuration arrives and increments by 1 on every input.

### SystemTextInput payload (flag `0xAF2C`)

```
text_session_id   (u32)
text_version      (u32)
flags             (u16)   0 = full replace, the only mode we use
text_chunk        (SGString, u16 length-prefixed)
delta_offset      (u32)   0 — full replace doesn't offset
delta_length      (u32)   0 — nothing to delete
selection_start   (i32)   cursor position; we put it at text.length
selection_length  (i32)   0 — no selection
```

**Common bug** that bit this project: omitting the four trailing
fields after `text_chunk`. The Xbox acknowledges the packet (the
HMAC and decryption succeed) but the deserializer reads past the
end and the text never lands in the focused field. Symptom: the
input flows in your protocol log, the ack flows back, and nothing
visible happens on screen.

### SystemTextAcknowledge payload (flag `0xAF34`)

```
text_session_id   (u32)
text_version_ack  (u32)
```

The C# reference client sends one of these after every
`SystemTextInput` with the same version. Skipping it lets the
console's view of the session version drift and future edits get
silently rejected.

### SystemTextDone payload (flag `0xAF35`)

```
text_session_id   (u32)
text_version      (u32)
flags             (u16)
result            (u32)   0 = Accept, 1 = Cancel
```

## Heartbeat

The library installs a 1 Hz timer that:

1. Sends a single `Acknowledge` packet (the "keep-alive") exactly 4
   seconds after the last received packet, and
2. Aborts the connection after 8 seconds of silence.

This is too brittle for rapid input. When we fire gamepad packets at
the maximum rate, the Node event loop is occupied with send work, and
the receive callback that updates `_last_received_time` lags. We see
"timeout" even though the link is healthy.

`src/xbox/heartbeat.js` replaces the library's interval with one that
keeps sending keep-alives every 2 seconds once 3 seconds of silence
elapses, and tolerates up to 30 seconds before declaring the link
dead. All three thresholds are env-configurable
(`HEARTBEAT_TIMEOUT_SEC`, `HEARTBEAT_KEEPALIVE_AFTER_SEC`,
`HEARTBEAT_KEEPALIVE_INTERVAL_SEC`).

## Useful references

- [OpenXbox/xbox-smartglass-csharp](https://github.com/OpenXbox/xbox-smartglass-csharp)
  — definitive source for message layouts. See `SmartGlass/Channels/Text/`
  for the text channel and `SmartGlass/Channels/Input/` for the gamepad.
- [unknownskl/xbox-smartglass-core-node](https://github.com/unknownskl/xbox-smartglass-core-node)
  — the Node library we depend on for discovery, crypto, and the
  established session.
