import type { AllEyesPlugin, Contact } from '../../core/types'
import { getJson } from '../../net/http'
import { navLabel, parseAis, type ShipFix } from './parse'

const LAYER = 'ships'

function toContact(fix: ShipFix): Contact {
  const moving = fix.sog > 0.5 && fix.navStat !== 5 && fix.navStat !== 1
  return {
    id: `ship:${fix.mmsi}`,
    layerId: LAYER,
    kind: 'ship',
    lat: fix.lat,
    lon: fix.lon,
    altKm: 0,
    heading: fix.heading,
    label: `MMSI ${fix.mmsi}`,
    detail: `MMSI ${fix.mmsi}\n${navLabel(fix.navStat)}\n${fix.sog.toFixed(1)} KT\nCOG ${Math.round(fix.cog)}\nBALTIC AIS`,
    brightness: moving ? 0.9 : 0.4,
    shape: 'box',
    scale: moving ? 1 : 0.7,
    time: fix.time,
  }
}

export const shipPlugin: AllEyesPlugin = {
  id: 'ships',
  name: 'Ships',
  version: '1.0.0',
  layers: [
    {
      id: LAYER,
      label: 'SHIPS',
      description: 'Keyless AIS from Fintraffic for the Baltic.',
      defaultOn: true,
      create(ctx) {
        let timer = 0
        let on = false
        const tick = async () => {
          if (!on || ctx.signal.aborted) return
          try {
            const fixes = parseAis(await getJson('/api/ais/locations', ctx.settings, ctx.signal))
            ctx.publish(LAYER, fixes.map(toContact))
            ctx.log(LAYER, fixes.length ? '' : 'NO AIS')
          } catch (err) {
            ctx.log(LAYER, err instanceof Error ? err.message : 'AIS FAULT')
          }
        }
        return {
          setEnabled(next) {
            if (next === on) return
            on = next
            if (!next) {
              window.clearInterval(timer)
              ctx.publish(LAYER, [])
              return
            }
            void tick()
            timer = window.setInterval(() => void tick(), 45_000)
          },
          dispose() {
            on = false
            window.clearInterval(timer)
          },
        }
      },
    },
  ],
  panels: [
    {
      id: 'ships-note',
      title: 'AIS',
      mount(host) {
        host.className = 'ae-note'
        host.textContent = 'BALTIC ONLY\nFINNISH DIGITRAFFIC\nFLY HELSINKI'
        return () => {}
      },
    },
  ],
}
