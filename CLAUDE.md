# CLAUDE.md

Guidance for AI coding agents (and humans) working in this repo.

## What this is

Couchkey: a local Node server + web GUI that controls an Xbox over the
SmartGlass protocol. Read `docs/ARCHITECTURE.md` first; the plan and open
decisions are in `docs/ROADMAP.md`.

## Commands

```bash
npm install          # Node >= 22.13
npm run dev          # tsx watch mode, http://localhost:3247 (loads .env)
npm start            # build to dist/ and run it
npm test             # vitest (test/**/*.test.ts)
npm run coverage     # vitest + coverage thresholds
npm run typecheck    # tsc --noEmit, strict
npm run lint         # eslint (typescript-eslint strict-type-checked)
npm run check        # lint + typecheck + coverage (run before every commit)
```

Config is env-driven: see `.env.example` and `src/config.js`.

## Workflow rules

- Never commit to `main`. Branch as `feature/<name>`, `fix/<name>`,
  `chore/<name>`, or `docs/<name>`; merge via PR.
- Conventional commits: `feat(osk): …`, `fix(ui): …`, `chore: …`,
  `docs: …`, `test: …`, `refactor: …`. Subject < 72 chars, body says why.
- TDD: write the failing test first, then the code. A change without a
  test needs a reason in the PR.
- Keep PRs to one ticket from `docs/ROADMAP.md` (reference its ID).
- Run `npm run check` before committing.

## Code rules

- New code is TypeScript (strict). Remaining `.js` files under `src/` are
  legacy CommonJS that M2 rewrites; don't add new `.js` modules.
- Modules that legacy JS `require()`s use `export =` when the JS expects
  the module itself (config, bus). New modules use named exports.
- Pass dependencies in (send functions, loggers, clocks) instead of
  importing I/O modules, so code stays testable without a console.
- Domain code (`src/xbox`, `src/protocol`, `src/osk`) must not import from
  `src/server`. Talk to the GUI through the event bus (`src/bus.js`).
- Only `src/console/smartglass/` may import `xbox-smartglass-core-node`
  or touch its private fields (lint-enforced). Everything else uses the
  `ConsoleAdapter` interface from `src/console`; tests use `FakeConsole`.
- New adapter behavior goes in `test/contract/console-adapter.contract.ts`
  so both the fake and the real adapter are held to it.
- Pure logic (planning, mapping, version bookkeeping) goes in modules with
  no I/O so it can be unit tested.
- Never log typed text, console certificates, or crypto keys. Log lengths
  and outcomes instead.
- User-facing errors say what to do next; stack traces go to logs only.

## Protocol & hardware

- Packet layouts follow the OpenXbox C# reference; cite it in comments when
  you change a layout.
- Anything under `src/protocol/` or `src/xbox/` can't be fully verified
  without a console. Say so explicitly in the PR and list what the
  maintainer should test on hardware.
- Layouts in `layouts/*.json` stay `"verified": false` until typed
  correctly on a real console.

## Docs

- `README.md` — users. `CONTRIBUTING.md` — contributors.
- `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`, `docs/PROTOCOL.md`,
  `docs/research/` — design, plan, protocol notes, investigations.
- Update `CHANGELOG.md` (Unreleased) for user-visible changes.
