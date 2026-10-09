# All Eyes

A live "see the whole world" console. The globe fills the window, the interface is green phosphor and 8-bit, and the feeds run with no API keys.

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

## How to install

Open the section for your computer. The desktop builds are unsigned, so the first launch asks you to confirm.

<details>
<summary>macOS</summary>

1. Click the Apple menu, then **About This Mac**.
2. If **Chip** says Apple M1, M2, M3, or M4, download `All-Eyes-1.0.0-macOS-AppleSilicon-arm64.zip`. If the processor line says Intel, download `All-Eyes-1.0.0-macOS-Intel-x64.zip`.
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

1. Download `All-Eyes-1.0.0-Windows-x64-Installer.exe` (recommended), or `All-Eyes-1.0.0-Windows-x64-Portable.exe` if you do not want to install.
2. Double-click the file you downloaded.
3. If you see **Windows protected your PC**, choose **More info**, then **Run anyway**. That warning is expected, because the app is unsigned.
4. Installer: step through the setup. It adds an **All Eyes** shortcut to the Start menu and the desktop. Open the app from either shortcut.
5. Portable: nothing is installed. Double-click `All-Eyes-1.0.0-Windows-x64-Portable.exe` each time you want the globe.

</details>

<details>
<summary>Linux</summary>

**AppImage (any distro)**

1. Download `All-Eyes-1.0.0-Linux-x64.AppImage`.
2. In that folder, run:

```bash
chmod +x All-Eyes-1.0.0-Linux-x64.AppImage
./All-Eyes-1.0.0-Linux-x64.AppImage
```

Or right-click the file, choose **Properties**, turn on **Allow executing file as a program**, and double-click it.

3. On Ubuntu 22.04 or newer, a FUSE error means the AppImage cannot mount itself. Install the library and try again:

```bash
sudo apt install libfuse2
```

Or skip FUSE and run:

```bash
./All-Eyes-1.0.0-Linux-x64.AppImage --appimage-extract-and-run
```

**Debian or Ubuntu package**

1. Download `All-Eyes-1.0.0-Linux-x64.deb`.
2. In that folder, run:

```bash
sudo apt install ./All-Eyes-1.0.0-Linux-x64.deb
```

3. Open **All Eyes** from the applications menu. The package name is `all-eyes`. The program file is `/opt/All Eyes/all-eyes`.

**Archive**

1. Download `All-Eyes-1.0.0-Linux-x64.tar.gz`.
2. Unpack it and start the program. The folder inside the archive is `All-Eyes-1.0.0-linux-x64` (lowercase "linux"):

```bash
tar -xzf All-Eyes-1.0.0-Linux-x64.tar.gz
cd All-Eyes-1.0.0-linux-x64
./all-eyes
```

3. If it quits immediately with a sandbox error, run `./all-eyes --no-sandbox`.

</details>

## Using it

1. Press `/` to open the command line.
2. Try `fly tokyo`, `pass iss`, or `help`.
3. Click **CFG** to add an optional OpenSky or NASA FIRMS key. The globe runs with none of these set.

Drag the globe to look around. Click a contact to follow it.

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
