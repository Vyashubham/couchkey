# Contributing to Couchkey

Thanks for considering a contribution. This project is small and the
maintainer load is one person, so the bar is:

- Be specific in issues. Tell me what console, what firmware, what
  you tried, and what happened. Protocol logs from
  `logs/latest.log` after reproducing the issue help a lot.
- Keep pull requests focused. One bug or one feature per PR is much
  easier to review than a sweep.
- Don't ask before opening a small fix — just open it. For larger
  changes (new dependencies, restructure, new channels), open an
  issue first to align on direction.

## Development setup

```bash
git clone https://github.com/Vyashubham/couchkey.git
cd couchkey
npm install
npm start
```

Requires Node.js 22.9 or newer. To change settings, copy `.env.example`
to `.env`; `npm start` picks it up.

There's no build step yet. Edits to `server.js` or `src/*.js` need a
restart; edits to `public/index.html` just need a browser refresh.

Before you start larger work, read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
and pick (or propose) a ticket in [docs/ROADMAP.md](docs/ROADMAP.md).

## Where things live

See the **Project layout** section of the [README](README.md) for the
short version. Two notes:

- **Domain modules don't import from the transport layers.** Anything
  in `src/xbox/` or `src/protocol/` should not require anything under
  `src/server/`. They communicate to the GUI by emitting on the bus
  (`src/bus.js`); `src/server/ws.js` is the one place that turns those
  events into WebSocket broadcasts.
- **Shared state lives in `src/state.js`.** Modules read/mutate it
  directly. There's no class layer yet — keep it that way unless you
  have a concrete reason.

## Testing changes

We work test-first: write a failing test, make it pass, then clean up.

```bash
npm test          # unit tests (node:test, in test/)
npm run lint
npm run check     # both; CI runs the same on Node 22, 24 and 26
```

Then a manual check:

1. `npm start` — the banner should print without errors.
2. Open <http://localhost:3247>, connect to your Xbox, exercise the
   thing you changed. Watch `logs/latest.log` for protocol errors.

When changing anything in `src/protocol/`, please verify on real
hardware before opening a PR — the packet layouts and channel
behaviors are not documented anywhere we can lint against.

## Branches and commits

- Don't commit to `main`. Work on a branch named `feature/<name>`,
  `fix/<name>`, `chore/<name>`, or `docs/<name>` and open a pull request.
- Use [Conventional Commits](https://www.conventionalcommits.org/):
  `feat(osk): add Prime Video layout`, `fix(ui): keep panel width`,
  `docs: …`, `test: …`, `refactor: …`, `chore: …`.
- Subject under 72 characters; the body explains *why*.
- One logical change per commit, one ticket per PR.
- Add user-visible changes to `CHANGELOG.md` under *Unreleased*.

## Easiest first contribution: an app keyboard layout

If an app on your Xbox has its own on-screen keyboard, you can teach
Couchkey to type into it. Take a photo of the keyboard, write a
`layouts/<app>.json` (format at the top of `src/osk/layout.js`, examples in
`layouts/`), add a planner test, and test it on your console. Set
`"verified": true` only once it typed correctly.

## Adding new features

A few patterns to follow:

- **New env-configurable knob?** Add it to `src/config.js` with a
  default, document it in the README's *Configuration* table.
- **New WebSocket message type?** Add handler + ACK type to the
  `HANDLERS` / `ACK_TYPE` maps in `src/server/ws.js`.
- **New SmartGlass packet builder?** Put it in `src/protocol/packets.js`
  alongside `buildTextInputPacket`. Keep the API uniform —
  `({ xbox, channelId, ... })`. Throw on missing inputs; the caller
  catches.
- **New macro?** Add to `src/macros.js` and a default key binding in
  `public/index.html`'s `MACRO_MAP`.
- **Never log typed text** or anything secret. Log lengths and outcomes.

## Reporting protocol weirdness

If you find a console that behaves differently — different firmware,
different connection mode, different channel-open dance — please
include:

- Console model and firmware version (Settings → System → Console info)
- A copy of `logs/latest.jsonl` covering the failure
- What you expected vs what happened

The protocol notes in [docs/PROTOCOL.md](docs/PROTOCOL.md) only cover
what we've actually observed; if you discover something new, that
file is a fine place to send a PR.
