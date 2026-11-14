# Security policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems. Use GitHub's
private reporting instead: **Security → Report a vulnerability** on the
repository page. We aim to respond within 7 days.

## What to know before running xbox-keyboard

- **Network exposure.** The server currently listens on all network
  interfaces with no authentication. Anyone on the same network can open
  the GUI and control your console. Run it only on networks you trust.
  Binding to localhost by default is planned (ROADMAP T-207).
- **Logs.** Session logs in `logs/` currently include text you type into
  the Xbox, which can include sign-in details. Delete them if that matters
  to you; redaction is planned (ROADMAP T-105).
- **Xbox setting.** The tool needs *Allow connections from any device* in
  the Xbox's Remote features settings. That lets any device on your network
  connect to the console's SmartGlass service, not just this tool.

## Supported versions

Only the latest release on `main` receives fixes.
