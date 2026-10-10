# Contributing

All Eyes is an original app. Do not paste modules, shaders, or large blocks from earlier copies of this repository. Use those projects only as a hint for ideas and for which public datasets exist.

## Setup

```bash
npm install
npm test
npm run dev
```

`npm run build` typechecks and produces `dist/`. `npm run dist:mac` also packs unsigned Mac zips. That needs network access so electron-builder can download the Mac runtimes.

## Add a feature

New behavior belongs in a plugin. Read [docs/plugins.md](docs/plugins.md), copy `src/plugins/example`, and register it with one line in `src/plugins/index.ts`.

Keep optional credentials in `.env` or the CFG panel. Do not commit keys. The panels stay in the phosphor palette. The globe may be natural color; marker sprites stay light so they read on land and ocean.

## Tests

Parser and registry tests live in `tests/`. Add a case when you add a feed decoder. `npm test` must pass before you open a pull request.
