# All Eyes

A green, 8-bit live globe. Aircraft, ships, satellites, earthquakes, traffic, weather, and public cameras share one phosphor display you can search, track, and fly.

All Eyes is based on [bilawalsidhu/gods-eye-view](https://github.com/bilawalsidhu/gods-eye-view) by Bilawal Sidhu. The original project is a browser intelligence console: a 3D Cesium globe, live public feeds, optional photorealistic 3D tiles, and hands-free voice control. This repo keeps that behavior and restyles the whole interface as a green monochrome pixel terminal. The MIT license and copyright in [LICENSE](LICENSE) are unchanged. Third-party datasets are not MIT; see [DATA_SOURCES.md](DATA_SOURCES.md) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Run it

Use **Node.js 24.14 or newer (24.x) or Node 26.x**.

```bash
npm ci
npm run dev
```

Open [http://localhost:4173](http://localhost:4173). The dev server listens on localhost. Pick **Live Contacts**, **Space Missions**, **Environmental**, or **Explore Manually** on the first screen.

No API keys are required to start. The keyless basemap is Esri satellite imagery, with OpenStreetMap as a fallback. Flights, military traffic, satellites, earthquakes, public cameras, radio, and launches work without keys.

Production build:

```bash
npm run build
npm run preview
```

## Keys

Copy [.env.example](.env.example) to `.env` if you want to set keys in a file. You can also use the **POWER UP** chip inside the app (dev server only). It writes `.env` on this machine and restarts. Do not commit `.env`.

Browser-exposed keys (visible in devtools; restrict them at the provider):

| Variable | What it unlocks |
| --- | --- |
| `CESIUM_ION_TOKEN` | Cesium ion photorealistic 3D tiles, Bing imagery, world terrain |
| `GOOGLE_MAPS_API_KEY` | Direct Google photorealistic 3D tiles and place search |
| `MAPILLARY_CLIENT_TOKEN` | Street-level Mapillary imagery |

Server-side keys (stay on this machine):

| Variable | What it unlocks |
| --- | --- |
| `OPENAI_API_KEY` | Hands-free realtime voice control |
| `FIRMS_MAP_KEY` | NASA FIRMS active fires |
| `OPENSKY_CLIENT_ID` / `OPENSKY_CLIENT_SECRET` | Higher-quota OpenSky aircraft |
| `GOOGLE_MAPS_SERVER_API_KEY` | Optional separate key for server Places and Street View |
| `LL2_API_TOKEN` | Optional higher Launch Library allowance |

`PORT` defaults to `4173`. `HOST` defaults to localhost. Binding `0.0.0.0` exposes every key-brokering proxy to your network; only do that on a network you trust. Upstream variable names such as `GEV_*` are kept so the original setup docs still apply. Details and rate limits are in [.env.example](.env.example) and [SECURITY.md](SECURITY.md).

## What you can do

- Track a live aircraft, ship, satellite, quake, or fire and open its metadata.
- Ride a tracked flight in cockpit view.
- Search a city, landmark, or coordinate and fly there. Bundled places work offline; other names use Google when configured, then Photon and Nominatim.
- Turn layers on from the dock: flights, vessels, satellites, traffic, transit, bikes, CCTV, radio, weather, fires, launches, cables, and more.
- Switch sensor grades (CRT, night vision, thermal, noir, snow). The screen stays green and pixelated either way.
- Copy a share link for the current camera, style, layers, and tracked target.
- Talk to the map with the mic control when an OpenAI key or a configured ChatGPT sign-in is present.

## Theme

The chrome uses a near-black green field, phosphor greens, square pixel borders, and no soft gradients. Headings use [Press Start 2P](https://fonts.google.com/specimen/Press+Start+2P). Body and controls use [VT323](https://fonts.google.com/specimen/VT323), which stays readable at interface sizes. Both are licensed under the SIL Open Font License. The globe, and embedded camera or street-level imagery, are graded with a green tint, posterized steps, pixel blocks, and scanlines.

## License

Source code is [MIT](LICENSE), copyright (c) 2026 Bilawal Sidhu. Bundled data and live feeds keep their own licenses. TeleGeography submarine cables are CC BY-NC-SA 3.0 and are not for commercial use.
