# Couchkey

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.13-brightgreen)](https://nodejs.org/)
[![CI](https://github.com/Vyashubham/couchkey/actions/workflows/ci.yml/badge.svg)](https://github.com/Vyashubham/couchkey/actions/workflows/ci.yml)

> Control your Xbox Series X|S or Xbox One from your laptop keyboard over your local network.
> No mobile app. No controller. No Microsoft account login. Just `npm start` and open a browser tab.
>
> *Couchkey is an independent project, not affiliated with or endorsed by Microsoft. Xbox is a trademark of Microsoft.*

Couchkey is a small Node.js server that speaks the Xbox SmartGlass
protocol over UDP, serves a tiny web GUI, and bridges keystrokes from your
browser into gamepad input on your Xbox. Free and open-source — the goal
is that anyone with a console and a laptop on the same Wi-Fi can use it.

---

## Why

Sometimes the controller is dead, sometimes you're in bed, sometimes
you want to type a YouTube search into the Xbox without thumb-clicking
through the on-screen keyboard. The Xbox mobile app does some of this,
but it requires a Microsoft account, a phone, and patience for its
random disconnects. This is the small, local-only alternative.

## Features

- **Auto-discovery** of Xbox consoles on your subnet (UDP broadcast)
- **Keyboard capture** — toggle with `Ctrl+Shift+K`, your keys become gamepad input
- **D-pad and face buttons** mapped to arrow keys / Enter / Backspace / X / Y
- **Xbox / View / Menu** mapped to `Escape` / `Tab` / `M`
- **Macros** with `Ctrl+G/H/F/S/R/P/Q` for Guide, Home, Search, Screenshot, Record clip, Parties, Quick settings
- **Text input** — type into the GUI, the Xbox text field updates as you go
  (works where the Xbox shows its *system* keyboard: Edge, Store, system
  search, sign-in)
- **App keyboard typing** *(experimental)* — types into apps with their own
  on-screen keyboard (YouTube, Netflix) by pressing through it for you,
  about 1–2 letters per second
- **Play/pause** with `Space`
- **Real-time protocol log** in the GUI for diagnostics
- **Auto-reconnect** on connection drop
- Works headless — single Node process, no external services

## Requirements

- **Node.js 22.13 or newer**
- **Xbox Series X|S or Xbox One** on the same local network as your computer
- Xbox setting: **Settings → Devices & connections → Remote features → Xbox app preferences → Allow connections from any device**

## Quick start

```bash
git clone https://github.com/Vyashubham/couchkey.git
cd couchkey
npm install
npm start        # builds, then starts the server
```

Then open <http://localhost:3247> in your browser.

1. Click **Scan** — your Xbox appears in the list (or paste its IP manually).
2. Click **Connect**.
3. Once the channel indicators turn green, click the keyboard capture banner (or press `Ctrl+Shift+K`).
4. Your keys now control the Xbox. Press `Ctrl+Shift+K` again to release.

## Keyboard map

When the keyboard is captured (banner is green):

| Key            | Xbox action            |
| -------------- | ---------------------- |
| `↑ ↓ ← →`      | D-pad                  |
| `Enter`        | A (select)             |
| `Backspace`    | B (back)               |
| `X` / `Y`      | X / Y                  |
| `Esc`          | Xbox / Guide (nexus)   |
| `Tab`          | View                   |
| `M`            | Menu                   |
| `Ctrl+G`       | Open Guide             |
| `Ctrl+H`       | Go Home                |
| `Ctrl+F`       | Open Search            |
| `Ctrl+S`       | Take Screenshot        |
| `Ctrl+R`       | Record last clip       |
| `Ctrl+P`       | Parties & Chats        |
| `Ctrl+Q`       | Quick Settings         |

For text fields on the Xbox, click into the text box in the GUI and type
normally. Enter submits, Esc cancels.

For apps with their own keyboard (YouTube, Netflix), open the app's search
keyboard on the Xbox, then use **App keyboard** in the GUI: pick the app,
type, press Enter, and watch it type on the TV. Layouts live in `layouts/`
and haven't been verified on every console yet. Why apps differ is
explained in [docs/research/text-input.md](docs/research/text-input.md).

## Configuration

All knobs are environment variables. Copy `.env.example` to `.env` and edit
it (`npm start` loads it), or set them inline before `npm start`:

| Variable                              | Default | What it does                                         |
| ------------------------------------- | ------: | ---------------------------------------------------- |
| `PORT`                                |  `3247` | HTTP/WebSocket port                                  |
| `BUTTON_MIN_INTERVAL_MS`              |   `150` | Min ms between gamepad sends (rate limit)            |
| `GAMEPAD_ACK`                         |     `0` | `1` = Xbox confirms every press (experimental)       |
| `GAMEPAD_HOLD_MS`                     |    `60` | Button hold time when `GAMEPAD_ACK=1`                |
| `GAMEPAD_ACK_TIMEOUT_MS`              |  `1000` | How long to wait for a press confirmation            |
| `RECONNECT_DELAY_MS`                  |  `5000` | Wait before auto-reconnect after disconnect          |
| `HEARTBEAT_TIMEOUT_SEC`               |    `30` | Seconds of silence before declaring the link dead    |
| `HEARTBEAT_KEEPALIVE_AFTER_SEC`       |     `3` | Start sending keep-alives after this much silence    |
| `HEARTBEAT_KEEPALIVE_INTERVAL_SEC`    |     `2` | Re-send keep-alives at this interval                 |
| `LOG_DIR`                             | `./logs`| Where session logs are written                       |
| `SMARTGLASS_DEBUG`                    |   `(on)`| `0` to silence the library's debug output            |

## How it works

```
┌────────────┐   WebSocket    ┌──────────────┐   UDP 5050 (SmartGlass)   ┌──────────┐
│  Browser   │ ◀────────────▶ │ Node server  │ ◀───────────────────────▶ │   Xbox   │
│ (capture)  │                │ (this repo)  │   AES-128-CBC + HMAC      │          │
└────────────┘                └──────────────┘                           └──────────┘
```

- The server uses [`xbox-smartglass-core-node`](https://github.com/unknownskl/xbox-smartglass-core-node)
  for discovery, the ECDH handshake, and the AES + HMAC layer
- After connecting, the server opens three SmartGlass channels —
  `SystemInput` (gamepad), `SystemMedia` (transport), and `SystemText` (text)
- Series X consoles do not send the `console_status` broadcast that
  the library uses to trigger channel opening, so the server opens the
  channels manually (see `src/protocol/channels.js`)
- The `SystemText` channel is not implemented in the library at all, so
  the server builds the raw `SystemTextInput` / `SystemTextAcknowledge` /
  `SystemTextDone` packets itself (see `src/protocol/packets.js`)
- A custom heartbeat (`src/xbox/heartbeat.js`) replaces the library's
  aggressive 8-second timeout so rapid input bursts don't trigger
  false disconnects

For a deeper writeup of the protocol details, see [docs/PROTOCOL.md](docs/PROTOCOL.md).

## Project layout

```
server.ts                    Entry point: builds HTTP + WS, wires modules, listens
public/index.html            The GUI (single file, no build step — being replaced, see roadmap)
layouts/                     App on-screen keyboard layouts (JSON)
src/
  config.ts                  All tunables (env-driven)
  paths.ts                   Project-root paths (works from src/ and dist/)
  state.js                   Shared mutable connection / text-channel state
  bus.ts                     EventEmitter that decouples domain modules from transports
  logger.js                  Protocol logger: ring buffer + per-session files + bus events
  macros.js                  Multi-step button sequences
  osk/                       App-keyboard typing: layout model, path planner, typer
  protocol/                  Raw SmartGlass packet builders, channel-open workaround
  xbox/                      Connection, heartbeat, gamepad/media input, text channel
  server/                    Express routes and WebSocket dispatch
test/                        Vitest tests (unit/, integration/)
docs/
  ARCHITECTURE.md            How it fits together, audit, target design
  ROADMAP.md                 Plan and ticket backlog
  PROTOCOL.md                SmartGlass protocol notes
  research/                  Investigations (e.g. why text input is limited)
```

## Troubleshooting

**"No consoles found"**
Make sure the Xbox is fully on (not standby) and on the same Wi-Fi
subnet as your laptop. Some routers isolate guest networks — both
devices must share one. If discovery still fails, look up the Xbox IP
in **Settings → General → Network settings → Advanced** and paste it
into the IP field directly.

**"Xbox is blocking anonymous connections"**
On the Xbox, go to **Settings → Devices & connections → Remote features**
and change **Xbox app preferences** to **Allow connections from any device**.

**"SmartGlass is disabled"**
Same screen as above — turn on **Enable remote features**.

**Connection drops during heavy input**
The custom heartbeat (`HEARTBEAT_TIMEOUT_SEC`, default 30) is lenient,
but you can extend it further:
`HEARTBEAT_TIMEOUT_SEC=60 npm start`. Also try raising
`BUTTON_MIN_INTERVAL_MS` to 200 if your network is slow.

**Text input doesn't appear on Xbox**
The Xbox needs a text field to be in focus on screen for the text
channel to be active. Open a text box on the console (search bar,
search field in an app) before typing in the GUI.

## Security

Read [SECURITY.md](SECURITY.md) before running this on a shared network:
the server currently accepts connections from your whole network, and logs
include text you type.

## Contributing

Issues and pull requests welcome. See [CONTRIBUTING.md](CONTRIBUTING.md)
for the workflow, [docs/ROADMAP.md](docs/ROADMAP.md) for what's planned,
and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Adding a keyboard layout for
an app you use is a great first contribution.

## Credits

- [`xbox-smartglass-core-node`](https://github.com/unknownskl/xbox-smartglass-core-node) by unknownskl — the Node SmartGlass library this builds on
- [`OpenXbox/xbox-smartglass-csharp`](https://github.com/OpenXbox/xbox-smartglass-csharp) — reference implementation in C# that documents the on-the-wire format for the text channel

## License

MIT — see [LICENSE](LICENSE).
