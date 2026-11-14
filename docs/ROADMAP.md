# Roadmap & backlog

Status: **approved** (Nov 2026). Decisions below are settled unless marked open.
Architecture background: [ARCHITECTURE.md](ARCHITECTURE.md).

Every ticket lists acceptance criteria (AC) and the tests that prove them.
Tests are written first (TDD): a ticket is done when its tests were seen
failing, now pass, and CI is green.

Ticket IDs are stable; once the plan is approved they become GitHub issues
with the same titles.

---

## Decisions

| # | Decision | Outcome |
|---|---|---|
| D1 | Language | **TypeScript**, strict, server + client. |
| D2 | GUI stack | **Vite + React + TypeScript**, CSS modules with design tokens. Vitest, Testing Library, Playwright. |
| D3 | Name | **Couchkey** (renamed from xbox-keyboard; "Xbox" in a product name conflicts with Microsoft's trademark guidance). |
| D4 | Where it runs | **Desktop app (Electron) that hosts or joins.** Anyone downloads it; on launch it looks for a Couchkey host on the Wi-Fi and joins it, otherwise becomes the host. One host per network, automatic handover when the host leaves. Phones join through the browser. Anyone on the Wi-Fi may use it (household mode); approved-devices mode and a host lock are optional. See ARCHITECTURE §6. |
| D5 | SmartGlass library | Keep `xbox-smartglass-core-node`, isolated behind one adapter. Replacing it becomes a one-file change. |
| D6 | Testing without an Xbox | **FakeConsole at the adapter level** + recorded packet fixtures. Every PR that touches console behavior lists what to check on real hardware. |
| D7 | Always-on hosts (later) | TV (LG webOS can't keep a background server), Cox gateway and Echo can't run custom software. Docker / Raspberry Pi images stay on the backlog for people who have an always-on device. Microsoft's cloud remote API is a possible later add-on for power/navigation from anywhere (needs Microsoft login, slower, no confirmed text input). |

## Milestones

| Milestone | Goal | Exit criteria |
|---|---|---|
| **M0 Foundation** ✅ this PR | Clean repo, docs, conventions | Docs below merged; CI on Node 22/24/26 |
| **M1 Backbone** | Toolchain, test harness, logging, error handling, adapter | All existing behavior still works; CI runs typecheck + unit + integration + e2e |
| **M2 Core services** | Rewrite server logic on the new backbone, TDD; host/join and multi-user | Feature parity with today plus host election, every service covered by tests against FakeConsole |
| **M3 New GUI** | The polished UI from ARCHITECTURE §4 | All flows usable keyboard-only; e2e covers every screen; a11y checks pass |
| **M4 On-console verification** | Prove it on real hardware | Test protocol run on Series X; layouts marked verified; findings documented |
| **M5 Release 1.0** | Desktop app for macOS/Windows/Linux | Installers on GitHub Releases, auto-update check, `npx couchkey` for developers; docs with GIFs |

---

## M1 — Backbone

**T-101 TypeScript toolchain** (D1)
- AC: `tsconfig` strict; `npm run typecheck`; build to `dist/`; `npm start` runs built output; `npm run dev` runs with watch; existing JS converted file-by-file without behavior change.
- Tests: CI typecheck job; existing OSK + gamepad tests pass unchanged after conversion.

**T-102 Test harness**
- AC: Vitest for unit/integration with coverage report; `npm test` runs unit + integration; coverage thresholds enforced per folder in CI (pure core ≥ 90%), ratcheting the overall threshold up to ≥ 75% as M2 replaces legacy modules. Playwright e2e lands with the new GUI (T-302), since there is nothing worth driving in the legacy page.
- Tests: a deliberately failing sample test fails CI (verified once, then removed).

**T-103 ConsoleAdapter + SmartGlassAdapter** (D5)
- AC: one interface (`discover`, `connect`, `disconnect`, `openChannels`, `sendGamepad`, `sendMedia`, `sendText*`, events); only `smartglass-adapter.ts` imports the library or touches `_private` fields; lint rule forbids importing the library anywhere else.
- Tests: contract test suite that both adapters must pass; lint rule test.

**T-104 FakeConsole** (D6)
- AC: implements the adapter; scriptable (accept/reject connect, drop/ack presses, open text session with given text, report active app); records every call for assertions; also usable as `--demo` mode in the GUI.
- Tests: passes the adapter contract suite.

**T-105 Structured logger**
- AC: JSON lines, levels (`error|warn|info|debug|trace`) via `LOG_LEVEL`; redaction of typed text and secrets; retention (keep last `LOG_KEEP_SESSIONS`, default 10); keep-alive/ack noise at `trace`; GUI log stream subscribes by level.
- Tests: redaction (typed text never appears in output for any API that sends text), retention deletes oldest, level filtering.

**T-106 Audit log of user actions**
- AC: every user action (connect, disconnect, button, macro, media, text, OSK type/cancel, settings change) writes one audit event with `ts, session, client, action, params (redacted), result, durationMs, stateBefore/After`.
- Tests: integration test drives each action through WS against FakeConsole and asserts exactly one well-formed audit event.

**T-107 Global error handling**
- AC: process handlers log and exit cleanly; Express error middleware; WS handler wrapper returns `{ ok:false, code, message }` and never a stack trace; client `ErrorBoundary` + `window.onerror` report to server.
- Tests: injected throw in a route/WS handler → safe response + logged stack; simulated unhandled rejection is logged.

**T-108 Config validation**
- AC: config parsed with a schema; invalid env values fail fast at startup with a clear message; `.env.example` generated from / checked against the schema.
- Tests: bad values rejected; `.env.example` drift test.

**T-109 CI pipeline**
- AC: jobs for lint, typecheck, unit+integration (Node 22/24/26), e2e (Node 24), coverage upload as artifact; required checks on `main`; Dependabot enabled.
- Tests: CI itself; branch protection documented in CONTRIBUTING.

---

## M2 — Core services (TDD, against FakeConsole)

**T-201 Connection state machine**
- AC: explicit states and transitions (ARCHITECTURE §3); one source of truth; auto-reconnect with backoff; stale-callback protection; every transition logged and broadcast.
- Tests: transition table tests; reconnect after simulated timeout; disconnect during connecting; double connect.

**T-202 InputService**
- AC: rate limiting, optional acks, ordered queue, cancel, per-press result; held-key auto-repeat; Menu/View mapping configurable until T-402 verifies it.
- Tests: rate limit timing (fake clock), ack timeout path, cancel mid-queue, ordering under load.

**T-203 Macros v2**
- AC: macros defined as data with per-step delays; fix the duplicated `screenshot`/`open_search`; user-defined macros from settings; macros cancellable.
- Tests: runner with fake clock; definitions validated.

**T-204 TextService (SystemText)**
- AC: session state machine (configuration → editing → done/cancel), version bookkeeping, acks; typed text never logged.
- Tests: version races (rapid edits before ack), cancel, Xbox-initiated close, redaction.

**T-205 OskService + automatic method choice**
- AC: one `type(text)` API: SystemText if a session is open; else app keyboard for the active app (title-id → layout map); else a clear "not supported in this app" error. Progress events and cancel.
- Tests: method selection matrix; progress events; cancel; unknown app.

**T-206 Typed WS protocol**
- AC: shared schema for every message; server validates inbound, client validates inbound; unknown/invalid messages rejected with a code; protocol version handshake.
- Tests: schema round-trip; invalid message rejection; version mismatch.

**T-207 HTTP API hardening**
- AC: input validation on every route; consistent error shape; listens on the LAN (household mode, D4) with `HOST` override; `HOST=127.0.0.1` gives a private single-user mode.
- Tests: integration tests for every route incl. bad input; bind address test.

**T-208 Host discovery and election** (D4)
- AC: hosts advertise `_couchkey._tcp` over mDNS with a host id, version, and start time; a launching app joins an existing host instead of starting a second one; if two start at once, a deterministic rule picks one (earliest start, then lowest id) and the other demotes itself within 3 s; when the host disappears, a remaining app takes over within 5 s and clients reconnect automatically.
- Tests: election unit tests with a fake clock and fake mDNS (simultaneous start, host leaves, split brain heals); integration with two server instances on loopback.

**T-209 Multi-user sessions**
- AC: each client has a device name and id; state broadcasts include who is connected; app-keyboard typing takes a lock and shows who holds it; optional host lock ("only my devices") and approved-devices mode.
- Tests: two WS clients: concurrent buttons both delivered; second typer gets a clear "Shubham's phone is typing" error; lock enforcement.

**T-210 Xbox presence and power-on**
- AC: hub watches for the console (cheap unicast discovery every few seconds), connects when it appears, shows "Xbox is off/asleep" otherwise; "Turn on Xbox" uses the SmartGlass power-on packet with the live id remembered from the last discovery.
- Tests: FakeConsole appear/disappear cycles; power-on packet builder against a known-good fixture.

---

## M3 — New GUI (D2)

**T-301 Design system** — tokens (color, type, spacing, radius, motion), light/dark, components: Button, IconButton, Input, Select, Toggle, Badge, Toast, Dialog, Tooltip, Kbd.
- AC: documented in a component gallery page; WCAG AA contrast checked automatically.
- Tests: component unit tests; axe checks in e2e.

**T-302 App shell + connection provider** — TopBar, routing, WS client with reconnect and offline banner.
- Tests: e2e: server down → offline banner → recovers.

**T-303 Connect screen** — scan, list, manual IP, remembered consoles, setup help driven by error codes.
- Tests: e2e with FakeConsole: success, not found, anonymous-blocked, disabled.

**T-304 Control screen** — capture surface (clear on/off state, release hint), live controller view, media bar, now playing.
- Tests: e2e: key → expected adapter call; capture toggling; focus never trapped.

**T-305 Type screen** — single composer, method badge (Instant / App keyboard / Not available), progress + stop, history.
- Tests: e2e per method using FakeConsole scripting.

**T-306 Settings** — keymap editor (conflict detection, reset), input speed + ack, privacy (log level, LAN mode/pairing), persisted server-side.
- Tests: unit for conflict detection; e2e persist + reload.

**T-307 Diagnostics** — log viewer (virtualized, filter, collapsed JSON), connection timeline, "copy debug report".
- Tests: e2e: report contains versions and no typed text.

**T-308 Accessibility & polish pass** — keyboard-only walkthrough, screen reader labels, reduced motion, 360 px layout.
- Tests: axe on every screen; Playwright keyboard-only scenarios.

---

## M4 — On-console verification

**T-401 Hardware test protocol** — a written checklist + a `npm run hw-check` script that runs safe probes (speed test, ack test) and writes a report.

**T-402 Verify input details** — acks on gamepad messages, safe press gap, Menu/View mapping, held-key repeat.

**T-403 Verify app layouts** — YouTube, Netflix, system keyboard; record title IDs for automatic layout choice; mark `verified: true`.

**T-404 Layout recorder** — GUI tool to map a new app keyboard by pressing directions and naming keys; exports JSON for a PR.

**T-405 More apps** — Prime Video, Hulu, Apple TV, Disney+ (community-contributed layouts).

---

## M5 — Release

**T-501 Desktop app** — Electron shell around the server: tray/menu-bar icon, host/join status, open GUI, start at login (optional), system-level keyboard capture with a release hotkey, first-run local-network permission explainer.
**T-502a Installers** — macOS (dmg), Windows (exe), Linux (AppImage/deb) built in CI and attached to GitHub Releases; unsigned at first with clear install steps; signing when funded. `npx couchkey` for developers.
**T-502b Update check** — notify when a newer release exists so hosts and clients don't drift; version mismatch between host and client handled gracefully.
**T-502 Versioning & release automation** — semver, CHANGELOG, tagged releases with notes.
**T-503 Docs** — README with GIFs, troubleshooting, FAQ ("why can't it type in X?").
**T-504 Community** — issue labels, good-first-issues (layouts are ideal), discussion templates.

---

## Done in M0 (this PR)

- Audit (ARCHITECTURE §2)
- Node floor 18 → 22.13 (18 and 20 are end-of-life); CI matrix 22/24/26
- `.env` support (`--env-file-if-exists`) and `.env.example`
- Research log moved to `docs/research/text-input.md`
- Renamed to Couchkey; desktop host/join model decided (D3, D4)
- README corrected (no false media-controls claim; app-keyboard feature documented as experimental)
- CLAUDE.md, CONTRIBUTING (branching, conventional commits, TDD), SECURITY.md, CODE_OF_CONDUCT.md, CHANGELOG.md, Dependabot, updated PR template
