# Changelog

All notable changes are recorded here. Format:
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Remembers your Xbox and reconnects automatically on startup
  (`AUTO_CONNECT=0` to disable).
- LB/RB on Q/E (or [ and ]): previous/next tab in Edge.
- SystemTouch packet builder and touch probe diagnostic (accepted by the
  Xbox, no visible effect in Edge; see research notes).
- USB HID bridge research report (`docs/research/usb-hid-bridge/`).
- Analog stick messages and a stick probe diagnostic (the Xbox accepts
  them but SmartGlass doesn't move Edge's cursor; see research notes).
- App keyboard typing (experimental): types into apps that draw their own
  on-screen keyboard (YouTube, Netflix) by driving it with d-pad presses.
  Layouts in `layouts/`, not yet verified on a console.
- Confirmed gamepad presses (experimental, off by default): the Xbox
  acknowledges each press so a dropped press is reported.
- Press speed test and press settings in the GUI.
- `.env` support and `.env.example`.
- Architecture, roadmap, security policy, code of conduct, CLAUDE.md.

### Changed
- Requires Node.js 22.13 or newer (18 and 20 are end-of-life).
- Research notes moved to `docs/research/text-input.md`.

### Fixed
- Connecting no longer hangs forever if the Xbox doesn't answer (10 s
  timeout, then retry), and stopping the server disconnects from the
  Xbox cleanly so the next start doesn't hit a stale session.
- Menu and View were swapped (library bug); Tab now sends View and M
  sends Menu, verified on a Series X.
- Connection no longer times out after bursts of button presses: the
  keep-alive now asks the Xbox to reply.
- Presses sent by Couchkey and by the library no longer conflict (one
  sender, one timestamp encoding).
- Text with accents or emoji: SmartGlass string length is now the UTF-8
  byte count (the library wrote the character count). Needs on-console
  confirmation.
- Connection errors are matched case-insensitively and "Device limit
  exceeded" gets its own explanation.
- SystemText wire format now matches the OpenXbox reference, so typing
  reaches Edge, Store, and system search fields.
- GUI control panel no longer gets squeezed by long log lines.
