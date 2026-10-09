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

Commands receive `CommandContext` with `flyTo`, `track`, `getTrackId`, `setLayer`, `findContact`, `searchPlace`, `setTimeMinutes`, `screenshot`, `copyLink`, and the same alerts and pin helpers.

A `Contact` is one picked thing: id, lat, lon, altKm, heading, pitch, label, detail, brightness (0 to 1), shape, and scale. `shape` is a model id from `src/core/models.ts`. Built-ins are `dot`, `chevron`, `diamond`, `ring`, `box`, and `drop`. The globe draws a low-poly mesh in green, oriented to heading and tilted by `pitch`. Zoomed out, and past the nearest 200 contacts, it draws a dot instead. Helicopter rotors and propeller discs spin. Satellites yaw slowly.

Optional `card` is a list of `{ k, v }` rows for the hover card. Empty values are hidden. Set `speedKt` when the row labeled `SPD` should follow the KT / MPH / KM/H toggle. `formatCard` and `withSpeed` in `src/core/cards.ts` build the text.

Aircraft type codes live in `src/plugins/aircraft/types.ts` (`EXACT`, then prefix rules). Add a row there and a mesh with the same id in `src/core/models.ts` to teach the globe a new type.

## Rules

- Fetch through `/api/...` so the local proxy can attach headers and avoid browser CORS. Add an allowlisted route in `server/proxy.mjs` instead of calling arbitrary hosts from the page.
- Keep module state private. Other plugins talk through contacts, the pin, and the track id.
- Stay in the green phosphor palette if you add DOM. Use the classes `ae-note` and `ae-k`.
- Put pure parsers in their own file and cover them from `tests/`.

## Commands worth knowing

`help`, `fly`, `goto`, `layer`, `layers`, `track`, `drop`, `time`, `pin`, `where`, `watch`, `pass`, `beacon`, `size`, `mute`, `shot`, `link`.

`size 0.7` (or `size up` / `size down`) matches the marker-size slider in CFG.
