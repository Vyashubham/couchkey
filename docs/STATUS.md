# Project status — where we left off (2026-11-15)

## TL;DR

Couchkey works today as a SmartGlass remote driven from a laptop browser:
auto-connect to a known Xbox, d-pad/face buttons, LB/RB, Menu/View, media,
and typing into system text fields (Edge, system search) with auto-focus.
Live testing showed hard limits of SmartGlass, and the official Xbox app
already covers basic remote use, so the project is **paused on one
decision: build the USB HID bridge or not** (ROADMAP D8).

## Verified on a real Series X (Nov 14, 2026)

Works:
- Auto-connect to the last console; reconnect after drops; connect timeout.
- Buttons incl. LB/RB (Edge tab switching), Menu=4/View=8 (library had them
  swapped), X = new tab in Edge.
- System text input into Edge's address bar with automatic text-box focus.
- Keep-alive that requests a reply (fixed silent session timeouts during
  input bursts).

Does not work (proven):
- Moving Edge's cursor via analog stick or SystemTouch (accepted, no effect).
- Typing into Netflix/YouTube via system text (no text session opens).
- App-keyboard (OSK) typing: layouts unverified; Netflix typed nothing,
  YouTube hit wrong keys.

Known issues:
- Idle sessions occasionally drop after a console_status message; auto
  recovery takes ~35–50 s. Possibly the official Xbox app taking over.
- Reconnect log noise every ~15 s while the console is off.
- Logs still contain typed text (T-105 redaction not done). `logs/` and
  `data/` are git-ignored.

Full findings: [research/text-input.md](research/text-input.md).

## The open decision

Recommendation: a Wi-Fi ESP32-S3 board in the Xbox's USB port acting as a
real keyboard + mouse, driven by the Couchkey hub, with SmartGlass kept for
wake/media. Unlocks: Edge cursor and real shortcuts, full keyboard
dashboard control, KB/M games, macros, accessibility, phone as trackpad.
Probably does **not** unlock typing into Netflix/YouTube search.
Report: [research/usb-hid-bridge/report.md](research/usb-hid-bridge/report.md).

## Next steps (in order)

1. Test any spare USB keyboard + mouse on the Xbox: Netflix/YouTube search
   typing, Edge shortcuts (Ctrl+T/W/L, Ctrl+Tab, F5), wheel, right-click,
   Windows key on the dashboard. This settles most open questions for free.
2. If going ahead: order 2–3 Seeed XIAO ESP32S3 (backup: Adafruit QT Py
   ESP32-S3 #5426) and a short USB-A→USB-C **data** cable.
3. Confirm the idle-drop hypothesis (does opening the official Xbox app
   kick Couchkey off?) and add faster drop detection.
4. Resume M1 (T-105 logging/redaction, T-106 audit, T-107 errors, T-108
   config validation, T-109 CI) re-scoped for the chosen direction.

## Housekeeping

- GitHub Actions can't run: the maintainer's GitHub account is locked over
  billing. PRs are verified locally on Node 22/24/26 until fixed.
- Open Dependabot PRs #2–#5 (actions/checkout, setup-node, ws, express 5)
  are unreviewed; express 5 is a major upgrade.
