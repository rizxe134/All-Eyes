# Plugins

All Eyes loads features through a registry. A plugin can add globe layers, HUD panels, and terminal commands. Core rendering, the shell, and the feed proxy stay put.

The types live in `src/core/types.ts`.

## Add one

1. Copy `src/plugins/example` to `src/plugins/<name>`.
2. Change the plugin id, layer id, panel id, and command name so they are unique.
3. Register it in `src/plugins/index.ts`:

```ts
import { myPlugin } from './my-feature/plugin'

export const builtinPlugins = [
  // ...existing modules
  myPlugin,
]
```

4. Run `npm test` and `npm run dev`. Turn the layer on with the rail or `layer <id> on`.

The example beacon layer is already registered and off by default. `beacon list` and `layer beacons on` exercise it.

## Shape

```ts
import type { AllEyesPlugin, Contact, LayerContext } from '../../core/types'

export const myPlugin: AllEyesPlugin = {
  id: 'my-feature',
  name: 'My Feature',
  version: '1.0.0',
  layers: [
    {
      id: 'my-layer',
      label: 'MINE',
      description: 'What the operator sees.',
      defaultOn: false,
      create(ctx: LayerContext) {
        let on = false
        return {
          setEnabled(next) {
            if (next === on) return
            on = next
            ctx.publish('my-layer', next ? contacts(ctx) : [])
          },
          dispose() {
            on = false
            ctx.publish('my-layer', [])
          },
        }
      },
    },
  ],
  panels: [
    {
      id: 'my-panel',
      title: 'MINE',
      mount(host) {
        host.textContent = 'PANEL'
        return () => {}
      },
    },
  ],
  commands: [
    {
      name: 'mine',
      usage: 'mine <arg>',
      summary: 'Do the thing',
      run(args, ctx) {
        ctx.flyTo(0, 0, 2000)
        return `MINE ${args.join(' ')}`
      },
    },
  ],
}

function contacts(_ctx: LayerContext): Contact[] {
  return []
}
```

`create` must not start network work until `setEnabled(true)`. `dispose` runs when the page unloads. `ctx.signal` aborts in-flight fetches.

## Context

Layers and panels receive `PluginContext`:

| Member | Use |
| --- | --- |
| `publish(layerId, contacts)` | Replace that layer's markers, radar blips, and pick targets |
| `globe` | Fly, set the radar canvas, draw an orbit polyline, read the view |
| `clock` | `now()` is sim time. Subscribe when a layer can replay |
| `settings` | Optional keys from CFG. Never hardcode them |
| `alerts` | `raise(key, title, detail)` for a deduped banner |
| `getPin` / `onPin` | The operator's chosen spot |
| `getTrackId` / `onTrack` | The locked contact |
| `log(layerId, message)` | A fault string on the layer button. Pass `''` to clear |

Commands receive `CommandContext` with `flyTo`, `track`, `getTrackId`, `setLayer`, `findContact`, `searchPlace`, `setTimeMinutes`, `screenshot`, `copyLink`, `setMarkerSize`, `setViewer`, and the same alerts and pin helpers.

A `Contact` is one picked thing: id, lat, lon, altKm, heading, pitch, label, detail, brightness (0 to 1), shape, and scale. `shape` is a sprite id. Built-ins are `dot`, `chevron`, `diamond`, `ring`, `box`, and `drop`, registered in `src/core/sprites.ts`.

## Sprite and viewer model

The globe draws a heading-rotated filled silhouette. Aircraft families (narrowbody, widebody, four-engine, regional, turboprop, light, helicopter, fighter, business jet) each have their own solid top-down shape. Ships, satellites, and weather icons use the same filled style. Zoomed out (past about 2400 km) every contact is a dot. Dense areas keep the brightest contact in each cell. The marker-size slider and `size` scale every marker. A selected aircraft is brighter and gets a ring, a solid history line behind it, and a dashed line ahead when the destination coordinates are known.

`GlobeApi.setHistory` draws that solid trail. `GlobeApi.setRoute` draws the dashed leg. `setOrbit` is still the satellite ground track and does not clear the aircraft lines.

Clicking an aircraft opens the left flight panel: callsign, type-code badge, photo when PlaneSpotters has one, operator, origin and destination, and the speed and altitude grid. Estimated airspeeds are labeled `EST`. Missing fields stay `NOT AVAILABLE`. **3D VIEW** opens the model viewer. **ROUTE**, **FOLLOW**, **SHARE**, and **MORE** sit on the bottom bar. The collapsible speed and altitude graph uses samples the aircraft layer already keeps in memory.

The same `shape` id selects the mesh in the top-right model viewer. Hover or follow a contact and that panel shows the low-poly model on a turntable, with the card underneath. `pitch` tilts aircraft. Helicopter rotors and propellers spin in the viewer. An empty selection shows a rotating wireframe globe and `NO CONTACT SELECTED`. `viewer`, `viewer on`, and `viewer off` collapse the panel.

Give a plugin both:

1. Register the pixels with `registerSprite(id, rows)` from `src/core/sprites.ts`. `#` is a lit pixel. Rows must be the same width. Import that module from the plugin so it runs at startup.
2. Add a mesh under the same id in `src/core/models.ts` (`builders`). The viewer falls back to a small octahedron if the id is missing. Set `contact.shape` to that id.

Optional `card` is a list of `{ k, v }` rows. Empty values are hidden. Set `speedKt` when the row labeled `SPD` should follow the KT / MPH / KM/H toggle. `formatCard` and `withSpeed` in `src/core/cards.ts` build the text. The viewer shows those rows. If the viewer is hidden, the same text follows the pointer.

Aircraft type codes live in `src/plugins/aircraft/types.ts` (`EXACT`, then prefix rules). Add a row there, a filled silhouette in `src/core/silhouettes.ts` (installed from `src/plugins/glyphs.ts` after the pixel modules), and a mesh with the same id in `src/core/models.ts`. The pixel modules remain as the fallback art; the silhouette pass overwrites those ids at startup.

## Rules

- Fetch through `/api/...` so the local proxy can attach headers and avoid browser CORS. Add an allowlisted route in `server/proxy.mjs` instead of calling arbitrary hosts from the page.
- Keep module state private. Other plugins talk through contacts, the pin, and the track id.
- Stay in the green phosphor palette if you add DOM. Use the classes `ae-note` and `ae-k`.
- Put pure parsers in their own file and cover them from `tests/`.

## Commands worth knowing

`help`, `fly`, `goto`, `layer`, `layers`, `track`, `drop`, `time`, `pin`, `where`, `watch`, `pass`, `beacon`, `size`, `viewer`, `mute`, `shot`, `link`.

`size 0.7` (or `size up` / `size down`) matches the marker-size slider in CFG.
