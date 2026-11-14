# Roadmap & backlog

Status: **proposal, awaiting maintainer review** (Nov 2026).
Architecture background: [ARCHITECTURE.md](ARCHITECTURE.md).

Every ticket lists acceptance criteria (AC) and the tests that prove them.
Tests are written first (TDD): a ticket is done when its tests were seen
failing, now pass, and CI is green.

Ticket IDs are stable; once the plan is approved they become GitHub issues
with the same titles.

---

## Decisions needed before M1

| # | Decision | Recommendation | Why |
|---|---|---|---|
| D1 | Language | **TypeScript** (server + client), strict mode | Shared WS schema types between server and GUI; safer refactors of protocol code; expected by contributors. |
| D2 | GUI stack | **Vite + React + TypeScript**, plain CSS modules with design tokens | Biggest contributor pool, mature testing (Vitest, Testing Library, Playwright). App is local, so bundle size doesn't matter. Alternative: keep no-build vanilla JS (simpler, but slower to build a polished UI and harder to test). |
| D3 | Project name | Keep **xbox-keyboard** (repo `Vyashubham/xbox-keyboard`) | Already public; describes the core idea. Local folder name doesn't matter. |
| D4 | Network exposure | **localhost by default**; opt-in LAN mode protected by a pairing code | Today anyone on your Wi-Fi can control your Xbox. LAN mode later enables using a phone as the remote. |
| D5 | SmartGlass library | **Keep, but isolate behind an adapter**; revisit replacing it after M2 | It works and is the only Node implementation, but it's unmaintained since 2022. The adapter makes replacing it a one-file job. |
| D6 | Test without an Xbox | **FakeConsole at the adapter level** + recorded packet fixtures | A full UDP SmartGlass simulator (handshake + crypto) is weeks of work; the adapter fake covers services, server, and UI. |

---

## Milestones

| Milestone | Goal | Exit criteria |
|---|---|---|
| **M0 Foundation** ✅ this PR | Clean repo, docs, conventions | Docs below merged; CI on Node 22/24/26 |
| **M1 Backbone** | Toolchain, test harness, logging, error handling, adapter | All existing behavior still works; CI runs typecheck + unit + integration + e2e |
| **M2 Core services** | Rewrite server logic on the new backbone, TDD | Feature parity with today, every service covered by tests against FakeConsole |
| **M3 New GUI** | The polished UI from ARCHITECTURE §4 | All flows usable keyboard-only; e2e covers every screen; a11y checks pass |
| **M4 On-console verification** | Prove it on real hardware | Test protocol run on Series X; layouts marked verified; findings documented |
| **M5 Release 1.0** | Ship to the public | `npx xbox-keyboard` works; release automation; docs with GIFs |

---

## M1 — Backbone

**T-101 TypeScript toolchain** (D1)
- AC: `tsconfig` strict; `npm run typecheck`; build to `dist/`; `npm start` runs built output; `npm run dev` runs with watch; existing JS converted file-by-file without behavior change.
- Tests: CI typecheck job; existing OSK + gamepad tests pass unchanged after conversion.

**T-102 Test harness**
- AC: Vitest for unit/integration with coverage report; Playwright for e2e; `npm test` runs unit + integration; `npm run test:e2e` runs browser tests; coverage thresholds enforced in CI for `src/core` (≥ 90%) and overall (≥ 75%).
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

**T-207 HTTP API hardening + localhost bind** (D4)
- AC: `HOST` default `127.0.0.1`; input validation; consistent error shape; LAN mode behind `HOST=0.0.0.0` + pairing code (pairing can land in M3).
- Tests: integration tests for every route incl. bad input; bind address test.

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

**T-501 Packaging** — `npx xbox-keyboard`, single command, opens the browser.
**T-502 Versioning & release automation** — semver, CHANGELOG, tagged releases with notes.
**T-503 Docs** — README with GIFs, troubleshooting, FAQ ("why can't it type in X?").
**T-504 Community** — issue labels, good-first-issues (layouts are ideal), discussion templates.

---

## Done in M0 (this PR)

- Audit (ARCHITECTURE §2)
- Node floor 18 → 22.9 (18 and 20 are end-of-life); CI matrix 22/24/26
- `.env` support (`--env-file-if-exists`) and `.env.example`
- Research log moved to `docs/research/text-input.md`
- README corrected (no false media-controls claim; app-keyboard feature documented as experimental)
- CLAUDE.md, CONTRIBUTING (branching, conventional commits, TDD), SECURITY.md, CODE_OF_CONDUCT.md, CHANGELOG.md, Dependabot, updated PR template
