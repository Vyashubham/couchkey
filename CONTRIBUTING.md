# Contributing to xbox-keyboard

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
git clone https://github.com/Vyashubham/xbox-keyboard.git
cd xbox-keyboard
npm install
npm start
```

That's it — there's no build step, no compile, no bundler. Edits to
`server.js` or `src/*.js` need a restart; edits to `public/index.html`
just need a browser refresh.

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

There's no automated test suite yet (PRs to add one are welcome). For
now, the smoke test loop is:

1. `node -c server.js` and every module under `src/` — parse check.
2. `npm start` — the banner should print without errors.
3. Open <http://localhost:3247>, connect to your Xbox, exercise the
   thing you changed. Watch `logs/latest.log` for protocol errors.

When changing anything in `src/protocol/`, please verify on real
hardware before opening a PR — the packet layouts and channel
behaviors are not documented anywhere we can lint against.

## Commit style

- Imperative subject line, < 70 chars (`Add foo`, not `Added foo`).
- Body explains *why*. The diff already shows *what*.
- One logical change per commit. If you're touching three unrelated
  things, that's three commits.

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
