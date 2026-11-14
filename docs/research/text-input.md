# Findings — Xbox text input research

A running log of what we tried, what worked, what didn't, and what we learned
about the limits of controlling a retail Xbox Series X over a local network
from a Linux laptop. Recorded so the next person picking this up doesn't
have to redo the investigation.

## TL;DR

1. **Gamepad / media control** works reliably over SmartGlass and is what
   this project does well today.
2. **Text input via SmartGlass SystemText** now works correctly after we
   matched the OpenXbox C# wire format. It reaches **Edge's URL bar and
   system-level text fields**, including sign-in screens and the Microsoft
   Store search.
3. **Text input does NOT reach in-app text fields** in YouTube, Netflix,
   most third-party apps, or in-game text input. This is a SmartGlass
   protocol limitation — the app has to opt into a system text session
   for SystemText to engage. Most third-party apps render their own text
   UI and never trigger the system OSK, so no `SystemTextConfiguration`
   ever fires.
4. **Microsoft's own official Xbox mobile app has the same limitation.**
   This isn't a gap in our implementation; it's the actual boundary of
   what SmartGlass exposes.
5. **There is no software-only, no-hardware, no-display-takeover way to
   inject keystrokes into arbitrary Xbox apps** from a remote device on
   a retail console. The community has been looking for 12 years.

## The original bug we fixed

The handoff doc that started this project described a payload format for
`SystemTextInput` (flag `0xAF2C`) that does not match the actual on-wire
format. The Xbox silently dropped every input we sent: it ACKed the
encrypted envelope (HMAC + decrypt succeeded), then the deserializer ran
off the end of the buffer when reading fields, and the input never reached
the focused field.

**The real layout**, taken from
[OpenXbox C# SystemTextInputMessage.Serialize](https://github.com/OpenXbox/xbox-smartglass-csharp/blob/master/SmartGlass/Messaging/Session/Messages/SystemTextInputMessage.cs):

```
text_session_id        (u32 BE)
base_version           (u32 BE)   the version we believe the field is at
submitted_version      (u32 BE)   the new version after our edit
total_text_bytelength  (u32 BE)
selection_start        (i32 BE)   -1 = no selection
selection_length       (i32 BE)   -1 = no selection
flags                  (u16 BE)
text_chunk_byte_start  (u32 BE)
text_chunk             (u16-prefixed string)
```

Key differences from the handoff doc:

- **Two version fields**, not one: `base_version` (what we knew) and
  `submitted_version` (what we're setting it to). The handoff doc had a
  single `version`.
- **`text_chunk` is at the END** of the payload, not in the middle.
- **Selection defaults to `-1, -1`**, not `text.length, 0`.
- **`SystemTextDone.flags` is u32**, not u16 as the handoff doc claimed.
- **We must ACK every `SystemTextInput` the Xbox sends us** with a
  `SystemTextAcknowledge`. The handoff doc didn't mention this. Without
  the ack, the Xbox's view of our session version drifts and our future
  edits are dropped.

Fix is in commit `f6b7b1b`. Verified working against a live Xbox Series X
by inspecting the Xbox's own outbound `SystemTextInput` broadcasts (Edge's
URL bar broadcasts the current URL as a SystemTextInput, which lets us
confirm we're roundtripping correctly).

## What works after the fix

- Edge browser URL/address bar (confirmed: a `test` send actually navigated
  Edge to a Bing search URL)
- Xbox system search
- Sign-in / account credential text fields
- Microsoft Store search
- Any text field that uses the system on-screen keyboard

## What still does not work and why

- **YouTube app's search bar** — no `SystemTextConfiguration` is fired
  when this field gains focus. YouTube ships its own custom text input
  UI as part of its React/HTML5 app shell, bypassing the system OSK.
  SmartGlass `SystemText` is never engaged, so we have nothing to send to.
- **Netflix, Disney+, Spotify, Twitch, etc.** — same pattern as YouTube.
  Third-party apps almost universally use their own text UI.
- **In-game text fields** — chat boxes, character naming screens, etc.
  Games handle their own input. SystemText doesn't apply.
- **Some Microsoft first-party apps** that ship custom shells

This is not fixable on our end. The check for "does this field accept a
system text session" lives in each app, not in the SmartGlass protocol.

## Every alternative we investigated

| Approach | Universal? | Keeps TV display? | Needs hardware? | Needs MS account? | Status |
|---|---|---|---|---|---|
| **SmartGlass `SystemText`** | No (per-app opt-in) | Yes | No | No | What we have. Works in cooperating apps. |
| **SmartGlass `SystemInput`** | Gamepad only | Yes | No | No | Already used. Not for text. |
| **SmartGlass other channels** (Title, SystemInputTVRemote, SystemBroadcast, SystemMedia) | No | Yes | No | No | None carry arbitrary keystrokes. |
| **Nano / Remote Play** | Yes | **No — TV switches to "Remote Play in progress"** | No | Yes | Greenlight implements this. Inherent display takeover, enforced by Xbox firmware. |
| **Xbox Device Portal `/ext/remoteinput`** | Yes | N/A | No | No | **Dev Mode only.** Dev Mode disables retail apps and games — solves nothing for our use case. |
| **USB HID keyboard** | Yes | Yes | Yes (the keyboard) | No | Works in literally every app because it injects below the per-app text layer. |
| **Bluetooth HID keyboard** | — | — | — | — | **Xbox Series X/S does not accept BT keyboards.** Firmware-level restriction on the Marvell Avastar BT stack — only Xbox Wireless controller profile + small headset whitelist are enabled. No Insider build has ever opened this. |
| **Emulate USB HID from laptop** | — | — | — | — | **Impossible on standard laptops.** Laptop USB ports are host-only (xHCI host controller, no UDC). `/sys/class/udc/` is empty. The `g_hid` kernel module exists but has nothing to bind to. |
| **Emulate Xbox controller wirelessly** | Gamepad only | Yes | Would need RF hardware | No | **XSM3 silicon-fused authentication.** Every Microsoft-licensed accessory has a per-device key burnt into its chip. No SDR project has emulated the pairing handshake. Cronus Zen / XIM Apex are USB devices, not wireless emulators. |
| **Emulate controller + chatpad wirelessly** | All inputs | Yes | RF hardware required | No | Chatpad is UART-19200 wrapped in GIP frames over the controller's wireless link. Same XSM3 wall as above. |
| **BLE HID-over-GATT** | — | — | — | — | The Xbox's BT stack doesn't load the HOGP server profile. Confirmed dead end. |
| **WebHID / WebUSB on Xbox Edge** | — | — | — | — | Xbox Edge has device APIs disabled to prevent peripheral spoofing. Even if exposed, would only let pages read devices, not synthesize OS-level events. |
| **USB/IP, network-attached USB** | — | — | — | — | Requires the Xbox to be a USB/IP client. It isn't. |
| **Miracast / DLNA / AirPlay input** | — | — | — | — | These are media transports. None carry HID. Xbox doesn't receive Miracast anymore. |
| **Pi Zero / Pico W / ESP32 USB-HID bridge** | Yes | Yes | Yes (~$6–$15) | No | Plug a tiny board into the Xbox's USB port. Board acts as a USB keyboard. Laptop talks to it over Wi-Fi. **The canonical workaround** for this exact problem. |

## The three locks that gate everything

If you take nothing else away from this document, take these three:

1. **XSM3 — silicon-fused accessory authentication.** Every wireless Xbox
   accessory authenticates via challenge-response using a key physically
   burnt into the device's chip. The keys are not extractable from network
   captures because they never leave the silicon — they're used to sign
   responses to challenges. This locks out any wireless RF emulation.

2. **Marvell Avastar Bluetooth firmware policy.** The Xbox has BT
   hardware capable of HID-over-GATT, but the system firmware doesn't
   load the profile. This is a firmware decision, not a hardware limit,
   and not reachable from any retail-mode software path.

3. **Nano always hijacks the local display.** When any Remote Play
   session connects (Greenlight, the official Xbox app, anything we
   could build) the Xbox firmware switches the TV output to a
   "Remote Play in progress" message. This is not a flag in any packet
   we can flip — it's hard-coded behavior in the Xbox shell. Building
   our own from-scratch Greenlight gives the exact same UX as Greenlight.

## On reverse-engineering deeper

The protocol layer is already exhaustively reverse-engineered:

- [`OpenXbox/smartglass-documentation`](https://github.com/OpenXbox/smartglass-documentation)
  — every channel, every message, every flag value
- [`OpenXbox/xbox-smartglass-csharp`](https://github.com/OpenXbox/xbox-smartglass-csharp)
  — full C# implementation, what we use as our wire-format reference
- [`unknownskl/xbox-smartglass-core-node`](https://github.com/unknownskl/xbox-smartglass-core-node)
  — Node library we depend on
- [`unknownskl/greenlight`](https://github.com/unknownskl/greenlight) and
  [`unknownskl/xbox-xcloud-player`](https://github.com/unknownskl/xbox-xcloud-player)
  — full Nano / Remote Play implementations
- [`OpenXbox/xbox-smartglass-nano-python`](https://github.com/OpenXbox/xbox-smartglass-nano-python)
  — Python Nano implementation
- [`MS-GIPUSB` open spec](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-gipusb/)
  (Microsoft open-spec'd controller USB protocol in Sep 2024)
- [`medusalix/xone`](https://github.com/medusalix/xone)
  — Linux driver for Xbox controllers
- [`xboxoneresearch/wiki`](https://xboxoneresearch.github.io/wiki/)
  — community reverse engineering reference
- [Chatpad UART format](https://github.com/frequem/Chatpad)
- [XSM3 authentication research](https://oct0xor.github.io/2017/05/03/xsm3/)

If a path to universal text input over LAN existed at the protocol level,
it would already be in one of these projects.

The next layer — Xbox firmware reverse engineering with arbitrary code
execution — has been unsuccessful on Series X for 5+ years. Not realistic
for a side project: years of work, requires offensive security expertise,
DMCA §1201 illegal in the US, bricks the device on failure, gets the
Xbox Live account banned, and Microsoft patches each crack as it's found.

## Realistic options for getting universal text input

Ranked by effort and trade-off:

1. **Add a $6 Raspberry Pi Zero W (or Pico W) plugged into the Xbox's
   USB port.** It runs a tiny server, our laptop tells it what to type,
   it presents as a USB keyboard. Works in every app on the Xbox. Keeps
   the TV display normal. This is the cleanest engineering answer.
   Roughly a weekend of integration work on top of what we have.

2. **Integrate Greenlight (or fork it and strip it down).** Works in
   every app. Requires Microsoft account login. **TV switches to
   Remote Play screen during a typing session.** The Xbox firmware
   enforces this; no client-side workaround exists. ~1–2 weeks to
   integrate, several months to rebuild from scratch.

3. **Ship what we have.** SmartGlass `SystemText` covers a meaningful
   slice of real-world cases (Edge URL bar, sign-in, system search).
   For YouTube-style apps, the user uses a controller for those rare
   typing moments, or uses Greenlight on the side.

## What's actually buildable that adds value to this project

- **A polished combined GUI** that auto-falls-back: try SystemText
  first, if no configuration arrives within a timeout, suggest the user
  switch to Greenlight (or to a hardware bridge if installed). Don't
  silently fail.
- **A clean Node.js SmartGlass library** factored out of this project so
  others can build on it without depending on the older
  `xbox-smartglass-core-node`.
- **A "hardware bridge" companion project** with documented Pi Zero /
  Pico W firmware that speaks a simple protocol our existing GUI
  already knows how to talk. This is the right answer if we want
  universal text without compromise.
- **Better protocol logging UI** in the GUI itself, exposing the kind
  of hex dumps we used to debug the SystemText fix, so future contributors
  can debug new fields and apps live.

## Sources

- Xbox SmartGlass protocol docs: <https://openxbox.org/smartglass-documentation/>
- TextChannel C# reference: <https://github.com/OpenXbox/xbox-smartglass-csharp/blob/master/SmartGlass/Channels/TextChannel.cs>
- Greenlight (Linux Remote Play client): <https://github.com/unknownskl/greenlight>
- Greenlight wiki — InputChannel: <https://github.com/unknownskl/greenlight/wiki/InputChannel>
- xbox-xcloud-player: <https://github.com/unknownskl/xbox-xcloud-player>
- MS-GIPUSB open spec: <https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-gipusb/>
- Xbox controller protocol notes: <https://gist.github.com/TheNathannator/c5d3b41a12db739b7ffc3d8d1a87c60a>
- Chatpad UART protocol: <https://github.com/frequem/Chatpad>
- XSM3 authentication: <https://oct0xor.github.io/2017/05/03/xsm3/>
- xone Linux driver: <https://github.com/medusalix/xone>
- Xbox keyboard support (official): <https://support.xbox.com/en-US/help/hardware-network/accessories/mouse-keyboard>
- Xbox Bluetooth support discussion: <https://www.windowscentral.com/will-xbox-series-x-support-bluetooth>
- Greenlight keyboard text input feature request: <https://github.com/unknownskl/greenlight/issues/1280>
