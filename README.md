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

## Download

Apple menu, then **About This Mac**: Chip is Apple M1 or later for Apple Silicon, or the processor line says Intel.

### macOS

| Your computer | Download this file | What it is |
| --- | --- | --- |
| Apple Silicon (M1/M2/M3/M4), recommended | `All-Eyes-1.0.0-macOS-AppleSilicon-arm64.zip` | Zip of All Eyes.app |
| Intel | `All-Eyes-1.0.0-macOS-Intel-x64.zip` | Zip of All Eyes.app |

### Windows

| Your computer | Download this file | What it is |
| --- | --- | --- |
| 64-bit Windows, recommended | `All-Eyes-1.0.0-Windows-x64-Installer.exe` | Installer |
| 64-bit Windows, no install | `All-Eyes-1.0.0-Windows-x64-Portable.exe` | Portable exe |

### Linux

| Your computer | Download this file | What it is |
| --- | --- | --- |
| 64-bit Linux, recommended | `All-Eyes-1.0.0-Linux-x64.AppImage` | AppImage |
| Debian or Ubuntu | `All-Eyes-1.0.0-Linux-x64.deb` | Debian package |
| Any 64-bit Linux | `All-Eyes-1.0.0-Linux-x64.tar.gz` | Archive |

## First launch

The desktop builds are unsigned.

- **macOS:** Unzip, right-click `All Eyes.app`, choose **Open**, then **Open** again.
- **Windows:** If SmartScreen appears, choose **More info**, then **Run anyway**.
- **Linux:** `chmod +x All-Eyes-1.0.0-Linux-x64.AppImage`, then run it.

## Desktop build

`npm run dist:mac`, `npm run dist:win`, `npm run dist:linux`, or `npm run dist:all` write those files into `release/`. The app starts a local server and opens the globe. You do not start a terminal yourself.

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
