# All Eyes

A live "see the whole world" console. The globe fills the window, the interface is green phosphor and 8-bit, and the feeds run with no API keys.

The concept was inspired by [gods-eye-view](https://github.com/bilawalsidhu/gods-eye-view). This app is a separate codebase: its own globe, module system, and interface.

## Run

```bash
npm install
npm run dev
```

Open http://127.0.0.1:4173. `npm run build` then `npm run preview` serves the production bundle the same way.

No keys are required. Aircraft, satellites, earthquakes, weather radar, Baltic ships, tropical cyclones, natural events, and upcoming launches come from public feeds. Optional keys live in [.env.example](.env.example) or the in-app **CFG** panel. They are never hardcoded.

## Mac app

```bash
npm run dist:mac
```

That builds the web app and writes unsigned arm64 and x64 zips of `All Eyes.app` into `release/`. The app starts a local server and opens the globe. You do not start a terminal yourself.

macOS Gatekeeper will block the unsigned app the first time. Right-click `All Eyes.app`, choose **Open**, then **Open** again. Or:

```bash
xattr -dr com.apple.quarantine "/path/to/All Eyes.app"
```

## What you can do

- Spin the full-window globe, zoom, and click a contact to lock a follow cam.
- Toggle layers from the left rail or `layer aircraft off`.
- Type commands: `fly tokyo`, `track ual`, `pass iss`, `watch quake 5`, `time -120`, `shot`, `link`, `help`. Press `/` to focus the prompt.
- Scrub the last 12 hours and 6 hours ahead. Satellites and quakes move in time. Aircraft keep a short session trail.
- Arm watches for a quake magnitude, a callsign, or a satellite pass over the pin. Alerts blink and beep. **MUT** silences the square-wave sounds.
- Read the corner radar, copy a share link, and save a stamped screenshot.
- Drop a pin on the ground, then ask for the next passes of the ISS or whatever you are tracking.

## Modules

Layers, panels, and commands are plugins. Copy `src/plugins/example`, then add one import in `src/plugins/index.ts`. The contract is in [docs/plugins.md](docs/plugins.md).

## Data

Keyless upstreams, reached through the local `/api` proxy:

- OpenSky Network, with [adsb.lol](https://adsb.lol) as a regional fallback
- [CelesTrak](https://celestrak.org) TLEs
- USGS earthquake feeds
- [RainViewer](https://www.rainviewer.com) radar
- Fintraffic / Digitraffic AIS (Baltic)
- NOAA National Hurricane Center and SWPC
- NASA EONET, plus optional NASA FIRMS
- The Space Devs Launch Library 2
- OpenStreetMap Nominatim, after the bundled city list

Earth imagery is NASA Blue Marble and night lights (public domain), stored in `public/textures`. Press Start 2P and VT323 are SIL Open Font License fonts in `public/fonts` and are not covered by the MIT license.

## License

Source code is [MIT](LICENSE). Live feeds and the bundled fonts keep their own terms.
