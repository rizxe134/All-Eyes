# All Eyes

A live "see the whole world" console. The globe fills the window in natural color, the panels stay green phosphor and 8-bit, and the feeds run with no API keys.

## What's new in 1.4.2

- The globe asks for the aircraft you are looking at. Circles tile the camera view, busy airports (Atlanta, Chicago, Dallas, London, and the rest) stay on a refresh list, and a slower sweep fills in the rest of the world. Contacts still merge by ICAO and stay for 90 seconds.
- Zooming into an airport shows every aircraft there, including ones on the ground. Ground traffic is amber. The **GND** button hides it. Wide-zoom thinning only stacks dots that overlap on screen. It does not erase a region, and there is no stride cap that throws away part of a feed.
- The top bar shows how many aircraft are loaded, how many are in view, and each source as OK, PARTIAL, RATE-LIMITED, or OFFLINE. If a feed cannot cover the spot you are looking at, it says FEED COVERAGE LIMIT.

## What's new in 1.4.1

- Aircraft stay on the globe. An empty, failed, or rate-limited poll keeps the last good contacts and merges by ICAO. A contact drops off only after 90 seconds without a fresh hit, and positions coast along their last track between polls.
- Zoomed-out markers stay a solid dot at least 4 px, so the CRT mask no longer rounds them away. The feed tries airplanes.live, adsb.lol, and adsb.fi around the view, then OpenSky. The top bar shows the AIR count, OK / RATE-LIMITED / OFFLINE, and which source answered.

## What's new in 1.4.0

- Plane markers are much smaller. Silhouettes appear only when you are zoomed in (about 640 km). Farther out they are 1–3 px dots. Dense areas thin harder. The hit target stays about 12 px, the nearest contact wins, and another click on the same spot cycles overlaps. The lock cross and the selection ring are smaller. **CFG** and `size` default to 0.45.
- A flight photo no longer keeps the NO PHOTO label on top of a real picture. The placeholder and colour bars are removed once the image loads, and they return only when there is no photo or the load fails.
- The globe is natural color (NASA Blue Marble, city lights on the night side) with the same flat CRT treatment as the flight photo: scanlines, a phosphor mask, a little color fringe, and a soft flicker. No curved glass. `theme green` switches the globe back to phosphor. `crt` sets the strength. The panels stay green. Markers stay light green-white with a dark outline.

1.3.1, 1.3.0, 1.2.0, 1.1.0, and 1.0.0 are still on the releases page.

## What's new in 1.3.1

- The flight photo is a flat rectangle in full color, with scanlines, a phosphor mask, a little color fringe, and a soft glow. With no photo, the same frame shows color bars and static. The route row stays under the screen, and the speed list scrolls while **3D VIEW**, **ROUTE**, **FOLLOW**, **SHARE**, and **MORE** stay pinned at the bottom.

## What's new in 1.3.0

- Aircraft on the globe are solid top-down silhouettes, one shape per family (narrowbody, widebody, four-engine, regional, turboprop, light, helicopter, fighter, business jet). They point along their heading and stay small. Ships, satellites, and weather icons use the same filled style. Zoomed out they are still dots. **CFG** and `size` still scale them.
- Click a plane for the left flight panel: callsign, type-code badge, photo when a free source has one, operator, origin and destination, altitude, speed, track, and squawk. The selected plane is brighter, with a ring, a solid line for where it has been, and a dashed line toward the destination when that airport is known. **3D VIEW** opens the top-right model viewer. **ROUTE**, **FOLLOW**, **SHARE**, and **MORE** sit on the panel. A collapsible graph draws the speed and altitude this contact has already reported.
- Fields the feeds do not have stay `NOT AVAILABLE`. Airspeeds computed from ground speed are marked `EST`. Nothing is invented.
- **3D VIEW** opens a realistic model on its own canvas: white airliners, a helicopter, ships, and satellites, with studio light and a credit under the picture. Model authors and licences are in [THIRD_PARTY_LICENSES](THIRD_PARTY_LICENSES).

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
| Apple Silicon (M1/M2/M3/M4), recommended | `All-Eyes-1.4.2-macOS-AppleSilicon-arm64.zip` | Zip of All Eyes.app |
| Intel | `All-Eyes-1.4.2-macOS-Intel-x64.zip` | Zip of All Eyes.app |

### Windows

| Your computer | Download this file | What it is |
| --- | --- | --- |
| 64-bit Windows, recommended | `All-Eyes-1.4.2-Windows-x64-Installer.exe` | Installer |
| 64-bit Windows, no install | `All-Eyes-1.4.2-Windows-x64-Portable.exe` | Portable exe |

### Linux

| Your computer | Download this file | What it is |
| --- | --- | --- |
| 64-bit Linux, recommended | `All-Eyes-1.4.2-Linux-x64.AppImage` | AppImage |
| Debian or Ubuntu | `All-Eyes-1.4.2-Linux-x64.deb` | Debian package |
| Any 64-bit Linux | `All-Eyes-1.4.2-Linux-x64.tar.gz` | Archive |

## How to install

Open the section for your computer. The desktop builds are unsigned, so the first launch asks you to confirm.

<details>
<summary>macOS</summary>

1. Click the Apple menu, then **About This Mac**.
2. If **Chip** says Apple M1, M2, M3, or M4, download `All-Eyes-1.4.2-macOS-AppleSilicon-arm64.zip`. If the processor line says Intel, download `All-Eyes-1.4.2-macOS-Intel-x64.zip`.
3. Double-click the zip. macOS unpacks it and shows `All Eyes.app`.
4. Drag `All Eyes.app` into **Applications**.
5. First launch: right-click `All Eyes.app`, choose **Open**, then **Open** again. macOS says it cannot verify the developer. That warning is expected, because the app is unsigned.
6. If there is no **Open** choice, go to **System Settings**, then **Privacy & Security**, and click **Open Anyway**.
7. If macOS says the app is damaged, open **Terminal** and paste this, then try again:

```bash
xattr -dr com.apple.quarantine "/Applications/All Eyes.app"
```

</details>

<details>
<summary>Windows</summary>

1. Download `All-Eyes-1.4.2-Windows-x64-Installer.exe` (recommended), or `All-Eyes-1.4.2-Windows-x64-Portable.exe` if you do not want to install.
2. Double-click the file you downloaded.
3. If you see **Windows protected your PC**, choose **More info**, then **Run anyway**. That warning is expected, because the app is unsigned.
4. Installer: step through the setup. It adds an **All Eyes** shortcut to the Start menu and the desktop. Open the app from either shortcut.
5. Portable: nothing is installed. Double-click `All-Eyes-1.4.2-Windows-x64-Portable.exe` each time you want the globe.

</details>

<details>
<summary>Linux</summary>

**AppImage (any distro)**

1. Download `All-Eyes-1.4.2-Linux-x64.AppImage`.
2. In that folder, run:

```bash
chmod +x All-Eyes-1.4.2-Linux-x64.AppImage
./All-Eyes-1.4.2-Linux-x64.AppImage
```

Or right-click the file, choose **Properties**, turn on **Allow executing file as a program**, and double-click it.

3. On Ubuntu 22.04 or newer, a FUSE error means the AppImage cannot mount itself. Install the library and try again:

```bash
sudo apt install libfuse2
```

Or skip FUSE and run:

```bash
./All-Eyes-1.4.2-Linux-x64.AppImage --appimage-extract-and-run
```

**Debian or Ubuntu package**

1. Download `All-Eyes-1.4.2-Linux-x64.deb`.
2. In that folder, run:

```bash
sudo apt install ./All-Eyes-1.4.2-Linux-x64.deb
```

3. Open **All Eyes** from the applications menu. The package name is `all-eyes`. The program file is `/opt/All Eyes/all-eyes`.

**Archive**

1. Download `All-Eyes-1.4.2-Linux-x64.tar.gz`.
2. Unpack it and start the program. The folder inside the archive is `All-Eyes-1.4.2-Linux-x64`:

```bash
tar -xzf All-Eyes-1.4.2-Linux-x64.tar.gz
cd All-Eyes-1.4.2-Linux-x64
./all-eyes
```

3. If it quits immediately with a sandbox error, run `./all-eyes --no-sandbox`.

</details>

## Using it

1. Press `/` to open the command line.
2. Try `fly tokyo`, `pass iss`, `size 0.8`, or `help`.
3. Hover a marker. The top-right viewer shows a realistic 3D model and the card. Click a plane to open the flight panel and follow it. Drag the globe to look around without closing the panel. The **KT** button switches speed units. `viewer off` hides the model viewer.
4. Click **CFG** to add an optional OpenSky or NASA FIRMS key, or to set marker size, globe theme, and CRT. The globe runs with none of the keys set. `theme green` and `crt 0` are there if you want the old phosphor globe with no overlay.

Drag the globe to look around. Click empty ground to drop the follow lock and set the pin.

## Troubleshooting

- A blank globe needs an internet connection. The feeds are live and do not work offline.
- "Cannot verify the developer", **Windows protected your PC**, and "is damaged" are the unsigned-app warnings above.
- Still stuck: open an issue at <https://github.com/rizxe134/All-Eyes/issues>.

## Build from source

```bash
npm install
npm run dev
```

`npm run dist:mac`, `npm run dist:win`, `npm run dist:linux`, or `npm run dist:all` write the download files into `release/`.

## Modules

Layers, panels, and commands are plugins. Copy `src/plugins/example`, then add one import in `src/plugins/index.ts`. The contract is in [docs/plugins.md](docs/plugins.md).

## Data

Keyless upstreams, reached through the local `/api` proxy:

- OpenSky Network, with [adsb.lol](https://adsb.lol) as a regional fallback, [adsbdb](https://adsbdb.com) for type, registration, operator, and route, and [PlaneSpotters.net](https://www.planespotters.net) public photos by ICAO24 hex when that site has one
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
