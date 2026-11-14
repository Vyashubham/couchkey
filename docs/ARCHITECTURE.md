# Architecture

This document describes how Couchkey is put together today, what is
wrong with that, and the structure we are moving to. Decisions and the
tickets that implement them are in [ROADMAP.md](ROADMAP.md).

---

## 1. What the app does

A small local server that talks to an Xbox over the SmartGlass protocol
(UDP 5050, AES-128-CBC + HMAC) and serves a web GUI. The GUI turns your
laptop keyboard into Xbox input:

| Capability | How | Reaches |
|---|---|---|
| Navigation (d-pad, A/B/X/Y, Xbox/View/Menu) | SmartGlass `SystemInput` gamepad messages | Everything |
| Media (play/pause/next/…) | SmartGlass `SystemMedia` | Apps that report media state |
| Instant text | SmartGlass `SystemText` session | Apps using the **system** keyboard (Edge, Store, system search, sign-in) |
| App-keyboard text (experimental) | Drive the app's own on-screen keyboard with d-pad presses (shortest path per character) | Apps with a custom keyboard (YouTube, Netflix, …) |

Why there is no "real keyboard" path without hardware is written up in
[research/text-input.md](research/text-input.md).

---

## 2. Current structure (as of Nov 2026)

```
Browser (public/index.html: one file, inline CSS + JS, globals)
   │  WebSocket (untyped JSON) + a few REST calls
   ▼
server.js ── src/server/{http,ws}.js
               │
               ▼
        src/xbox/{connection,input,gamepad,text,heartbeat}.js
        src/osk/{layout,planner,typer,registry}.js     ← pure + tested
        src/protocol/{packets,channels,helpers}.js
               │   reaches into library private fields (_events, _console,
               │   _channel_manager, _managers, _send, _request_num …)
               ▼
        xbox-smartglass-core-node 0.6.10 (last published May 2022)

Cross-cutting: src/state.js (one global mutable object), src/bus.js
(EventEmitter), src/logger.js (ring buffer + per-session files).
```

### Problems found in the audit

Grouped by severity. Each maps to a ticket in [ROADMAP.md](ROADMAP.md).

**Security / privacy**
- The server listens on all network interfaces with no authentication, so
  anyone on the same Wi-Fi can open the GUI and control the console.
- Typed text is logged in plain text (`Sending text: "…"`), including what
  you type into sign-in fields, and log files are kept forever.
- Console names from discovery are inserted into the page with `innerHTML`
  unescaped.

**Reliability**
- Library private fields are touched from five different modules. Any
  library change, or swapping the library out, breaks things in many
  places at once.
- Connection lifecycle is spread across timers and flags (`connectionStatus`,
  `inputReady`, generation counter, two timeout paths) instead of one state
  machine. Hard to reason about and untested.
- No process-level error handling (`uncaughtException`,
  `unhandledRejection`) and no Express error middleware.
- HTTP and WebSocket inputs are not validated.
- Gamepad presses are fire-and-forget by default; a dropped press is
  invisible (acked presses exist but are experimental and off).

**Correctness**
- Macros are blind timed button sequences; `screenshot` and `open_search`
  are the same sequence, so at least one is wrong.
- Menu/View bitmask values may be swapped relative to the OpenXbox
  protocol docs (needs a console check).
- README claims GUI media controls that don't exist (only Space → play).

**Maintainability / DX**
- The GUI is a single 480-line HTML file with inline handlers and global
  state; it is excluded from lint and has no tests.
- Only the on-screen-keyboard engine has tests; connection, input, text,
  and protocol code have none.
- Node 18 floor was past end-of-life (fixed in Phase 0: now ≥ 22.9).
- Logs are noisy (every keep-alive acknowledge is logged) and grow without
  bound (34 session files / 3 MB on the maintainer's machine after a few
  days).

---

## 3. Target structure

Principles:

1. **One place touches the SmartGlass library.** Everything else talks to
   a small `ConsoleAdapter` interface. Tests use a `FakeConsole` that
   implements the same interface — no Xbox needed for CI.
2. **Pure core, thin shells.** Logic that decides things (keymaps,
   macros, OSK planning, text-session versioning, connection state
   transitions) is pure and unit-tested. I/O lives at the edges.
3. **Explicit state machines** for connection and text sessions, with
   every transition logged.
4. **Typed, validated boundaries.** One shared message schema for the
   WebSocket protocol, validated on both ends.
5. **Private by default.** Bind to localhost, redact typed text, rotate
   logs.

```
packages (single repo, no workspaces needed at first)

src/
  core/                    pure, no I/O, 100% unit tested
    keymap/                key → action resolution, user-editable bindings
    macros/                macro definitions + runner (timing injected)
    osk/                   layouts, planner (exists today)
    text-session/          version bookkeeping for SystemText
    connection-machine/    states: idle → discovering → connecting →
                           opening-channels → ready → reconnecting → error
  protocol/                packet builders/parsers, tested against
                           recorded fixtures from a real console
  console/
    adapter.ts             ConsoleAdapter interface
    smartglass-adapter.ts  the ONLY file importing xbox-smartglass-core-node
    fake-console.ts        in-memory fake for tests and demo mode
    services/              InputService (rate limit, ack, queue, cancel),
                           TextService, MediaService, OskService
  server/
    http.ts                routes, validation, error middleware
    ws.ts                  typed message router, per-client session id
    schema.ts              shared message schema (also used by the client)
  logging/
    logger.ts              structured JSON logs, levels, redaction,
                           rotation/retention, crash handler
    audit.ts               user-action events (see §5)
  config.ts                env parsing + validation, documented defaults

web/                       the GUI (see §4)
test/
  unit/                    core + protocol
  integration/             services + server against FakeConsole
  e2e/                     browser tests against server + FakeConsole
```

### Data flow (target)

```
Browser ──typed WS msg──▶ ws router ──▶ service ──▶ ConsoleAdapter ──▶ Xbox
   ▲                                       │
   └──── state/events (typed) ◀── event bus ◀── adapter events
```

---

## 4. Client (GUI)

### Screens and flows

1. **First run / connect** — scan, pick console, or enter IP. Inline help
   for the two Xbox settings that block connections, shown only when the
   error says so.
2. **Control** (main screen) — big "keyboard captured" state, live
   on-screen controller that lights up with your keys, current app on the
   console, media bar.
3. **Type** — one text box. The app picks the method automatically:
   instant system text when a text session is open, otherwise the app
   keyboard for the current app (with live progress and Stop), otherwise a
   clear "this app can't receive typing" message.
4. **Settings** — key bindings (editable), press speed and confirmation,
   network exposure, logging level.
5. **Diagnostics** — protocol log (filterable, collapsed by default),
   connection timeline, "copy debug report" for bug reports.

### Component hierarchy (sketch)

```
App
├─ ConnectionProvider        (WS client, reconnect, connection state)
├─ Shell
│  ├─ TopBar                 (console name, status pill, capture toggle)
│  ├─ Routes
│  │  ├─ ConnectScreen       (ConsoleList, ManualIpForm, SetupHelp)
│  │  ├─ ControlScreen       (CaptureSurface, ControllerView, MediaBar, NowPlaying)
│  │  ├─ TypeScreen          (TextComposer, MethodBadge, ProgressBar)
│  │  ├─ SettingsScreen      (KeymapEditor, InputSettings, PrivacySettings)
│  │  └─ DiagnosticsScreen   (LogViewer, Timeline, DebugReport)
│  └─ Toasts / ErrorBoundary
```

### State management

- **The host is the source of truth** for connection, channels, text session,
  and typing progress. The client holds a read-only mirror updated by
  typed WS events, plus local UI state (open panels, form drafts).
- One small store (no global mutable variables). Every outbound action goes
  through one `send(action)` function that also records the UI audit event.
- Every async action has explicit `idle | pending | success | error`
  states rendered in the UI.

### UX requirements

- Keyboard-first, fully operable without a mouse; visible focus.
- WCAG 2.2 AA contrast, `aria-live` for status changes, reduced-motion
  support.
- Every action gives feedback within 100 ms (pressed state), and every
  failure says what to do next.
- Works at 360 px wide: phones on the same Wi-Fi are first-class clients.

---

## 5. Logging & error handling

Two streams, both structured JSON lines with ISO timestamps:

| Stream | Contents | Default level |
|---|---|---|
| **app** | lifecycle, connection transitions, errors with stack traces, protocol summaries at `debug` | `info` |
| **audit** | user actions: `{ ts, session, client, action, params, result, durationMs, stateBefore, stateAfter }` | always on |

Rules:

- **Redaction:** typed text is never logged; log its length and method
  instead (`{ chars: 12, method: "osk:youtube" }`). Console certificates
  and keys are never logged.
- **Retention:** keep the last N sessions (default 10), cap file size.
- **Crashes:** `uncaughtException` / `unhandledRejection` are logged with
  stack and recent context, then the process exits cleanly (the user
  restarts; no zombie state). Express and WS handlers catch and return a
  safe error code + message; stack traces never go to the browser.
- **Client errors:** an error boundary in the GUI reports to the server
  (`client_error` message) so browser-side crashes land in the same log.
- **Debug report:** one button bundles recent logs (already redacted),
  versions, and settings for bug reports.

---

## 6. Deployment: host or join

There is no always-on device to rely on (the TV, router and smart
speakers can't run custom software), so Couchkey ships as a **desktop app
that any household member can run**. Whoever opens it first hosts.

```
   Laptop A (host)                 Laptop B (client)        Phone (client)
 ┌──────────────────┐            ┌────────────────┐       ┌──────────────┐
 │ Electron shell   │            │ Electron shell │       │ Browser/PWA  │
 │  ├ server (hub)  │◀──WS/HTTP──│  └ GUI         │       │  └ GUI       │
 │  │  └ SmartGlass ─┼──UDP──▶ Xbox                │       └──────┬───────┘
 │  └ GUI           │◀──────────────────────────────────────WS/HTTP┘
 └──────────────────┘
        ▲  mDNS: _couchkey._tcp (host id, version, started-at)
```

**Launch sequence**

1. Browse mDNS for `_couchkey._tcp` for ~1.5 s.
2. Found a host → open its GUI as a client (no second SmartGlass session).
3. None found → start the server, advertise, connect to the Xbox when it
   appears (polling discovery), and open the local GUI.

**Collisions and handover**

- *Two apps start at once:* both advertise; each sees the other; the one
  with the earliest start time (tie: lowest host id) stays host, the other
  stops its server and becomes a client. Converges within 3 s.
- *Host quits or sleeps:* clients lose the WebSocket and the mDNS record
  expires; the remaining desktop apps re-run the election; the winner
  starts hosting and clients reconnect to it. Typing in progress is
  cancelled and reported, not silently replayed.
- *Version mismatch:* host and client exchange protocol versions on
  connect; an incompatible client is told to update instead of
  misbehaving.
- *Guest Wi-Fi with client isolation:* devices there can't see the host;
  the GUI explains this when no host and no Xbox can be found.

**Multi-user rules**

- Everyone on the Wi-Fi can control the console (household mode).
- Button presses from different people interleave; app-keyboard typing
  takes a lock that shows who holds it.
- The host can lock control to their own devices; an approved-devices
  mode exists for shared networks.

**Desktop shell responsibilities** (Electron): tray icon showing
host/client status, start-at-login (optional), system-level keyboard
capture with a release hotkey, local-network permission prompt with an
explanation, update check against GitHub Releases.
