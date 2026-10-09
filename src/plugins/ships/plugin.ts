import { formatCard, formatSpeed } from '../../core/cards'
import type { AllEyesPlugin, Contact } from '../../core/types'
import { getJson } from '../../net/http'
import { navLabel, parseAis, parseVessels, type ShipFix, type ShipMeta } from './parse'
import { classifyShip, flagFromMmsi } from './sprites'

const LAYER = 'ships'

const vesselMeta = new Map<number, ShipMeta>()

function toContact(fix: ShipFix, unit: 'kt' | 'mph' | 'kmh'): Contact {
  const meta = vesselMeta.get(fix.mmsi)
  const kind = classifyShip(meta?.shipType ?? 0)
  const moving = fix.sog > 0.5 && fix.navStat !== 5 && fix.navStat !== 1
  const name = meta?.name || `MMSI ${fix.mmsi}`
  const card = [
    { k: 'NAME', v: name },
    { k: 'MMSI', v: String(fix.mmsi) },
    { k: 'TYPE', v: kind.name },
    { k: 'SPD', v: formatSpeed(fix.sog, unit) },
    { k: 'CSE', v: `${Math.round(fix.cog)}°` },
    { k: 'DEST', v: meta?.destination || '' },
    { k: 'FLAG', v: flagFromMmsi(fix.mmsi) },
    { k: 'NAV', v: navLabel(fix.navStat) },
  ]
  return {
    id: `ship:${fix.mmsi}`,
    layerId: LAYER,
    kind: 'ship',
    lat: fix.lat,
    lon: fix.lon,
    altKm: 0,
    heading: fix.heading,
    label: name,
    detail: formatCard(card),
    brightness: moving ? 0.72 : 0.34,
    shape: kind.sprite,
    scale: moving ? 0.9 : 0.7,
    time: fix.time,
    card,
    speedKt: fix.sog,
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
            const [locations, vessels] = await Promise.all([
              getJson('/api/ais/locations', ctx.settings, ctx.signal).then(parseAis),
              getJson('/api/ais/vessels', ctx.settings, ctx.signal).then(parseVessels).catch(() => [] as ShipMeta[]),
            ])
            for (const vessel of vessels) vesselMeta.set(vessel.mmsi, vessel)
            const fixes = locations
            ctx.publish(LAYER, fixes.map((fix) => toContact(fix, ctx.settings.get().speedUnit)))
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
