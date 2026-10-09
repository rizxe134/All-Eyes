import type { AllEyesPlugin, Contact, LayerContext } from '../../core/types'

/**
 * Template module.
 * Copy this folder, rename the ids, and append the plugin in src/plugins/index.ts.
 * Enable it from the rail or with: layer beacons on
 */

interface Beacon {
  id: string
  name: string
  lat: number
  lon: number
  note: string
}

const BEACONS: Beacon[] = [
  { id: 'greenwich', name: 'GREENWICH', lat: 51.4769, lon: -0.0005, note: 'PRIME MERIDIAN' },
  { id: 'arecibo', name: 'ARECIBO', lat: 18.344, lon: -66.753, note: 'RADIO DISH' },
  { id: 'uluru', name: 'ULURU', lat: -25.344, lon: 131.037, note: 'MONOLITH' },
  { id: 'cern', name: 'CERN', lat: 46.234, lon: 6.053, note: 'RING' },
  { id: 'svalbard', name: 'SVALBARD', lat: 78.229, lon: 15.397, note: 'POLAR GATE' },
  { id: 'easter', name: 'EASTER ISLAND', lat: -27.112, lon: -109.35, note: 'MOAI' },
]

function contacts(): Contact[] {
  return BEACONS.map((beacon) => ({
    id: `beacon:${beacon.id}`,
    layerId: 'beacons',
    kind: 'beacon',
    lat: beacon.lat,
    lon: beacon.lon,
    altKm: 0,
    heading: 0,
    label: beacon.name,
    detail: `${beacon.name}\n${beacon.note}\nTEMPLATE LAYER`,
    brightness: 0.85,
    shape: 'drop',
    scale: 1.1,
  }))
}

export const examplePlugin: AllEyesPlugin = {
  id: 'example-beacons',
  name: 'Example Beacons',
  version: '1.0.0',
  layers: [
    {
      id: 'beacons',
      label: 'BEACON',
      description: 'Example layer. A few fixed sites, no network.',
      defaultOn: false,
      create(ctx: LayerContext) {
        let on = false
        return {
          setEnabled(next) {
            if (next === on) return
            on = next
            ctx.publish('beacons', next ? contacts() : [])
          },
          dispose() {
            on = false
            ctx.publish('beacons', [])
          },
        }
      },
    },
  ],
  panels: [
    {
      id: 'beacon-help',
      title: 'TEMPLATE',
      mount(host) {
        host.className = 'ae-note'
        host.textContent = 'COPY plugins/example\nREGISTER IN plugins/index.ts\nVERB: BEACON <NAME>'
        return () => {}
      },
    },
  ],
  commands: [
    {
      name: 'beacon',
      usage: 'beacon <name>',
      summary: 'Fly to an example beacon',
      run(args, ctx) {
        const q = args.join(' ').trim().toLowerCase()
        if (!q || q === 'list') return BEACONS.map((beacon) => beacon.name).join('\n')
        const hit = BEACONS.find((beacon) => beacon.name.toLowerCase().includes(q) || beacon.id.includes(q))
        if (!hit) return 'NO BEACON. TRY BEACON LIST'
        ctx.setLayer('beacons', true)
        ctx.flyTo(hit.lat, hit.lon, 1600)
        ctx.setPin(hit.lat, hit.lon)
        return `BEACON ${hit.name}`
      },
    },
  ],
}
