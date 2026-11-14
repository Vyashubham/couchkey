# Security policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems. Use GitHub's
private reporting instead: **Security → Report a vulnerability** on the
repository page. We aim to respond within 7 days.

## What to know before running Couchkey

- **Network exposure (by design).** Couchkey is meant to be shared by
  everyone on your Wi-Fi, so the server accepts connections from your local
  network without a login. Anyone on the same network can open the GUI and
  control your console. Run it only on networks you trust, or set
  `HOST=127.0.0.1` to keep it to this computer. A host lock and an
  approved-devices mode are planned (ROADMAP T-209).
- **Logs.** Session logs in `logs/` currently include text you type into
  the Xbox, which can include sign-in details. Delete them if that matters
  to you; redaction is planned (ROADMAP T-105).
- **Xbox setting.** The tool needs *Allow connections from any device* in
  the Xbox's Remote features settings. That lets any device on your network
  connect to the console's SmartGlass service, not just this tool.

## Supported versions

Only the latest release on `main` receives fixes.
