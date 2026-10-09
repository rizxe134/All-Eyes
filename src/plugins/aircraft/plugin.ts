import type { AllEyesPlugin, Contact, LayerContext } from '../../core/types'
import { getJson } from '../../net/http'
import { capAir, displayAirAltKm, parseAdsb, parseOpenSky, type AirFix } from './parse'

const LAYER = 'aircraft'
const HUBS: Array<[number, number]> = [
  [40.64, -73.78],
  [33.94, -118.41],
  [41.98, -87.9],
  [51.47, -0.46],
  [50.04, 8.56],
  [25.25, 55.36],
  [1.36, 103.99],
  [35.55, 139.78],
  [22.31, 113.91],
  [-33.95, 151.18],
  [-23.43, -46.47],
  [28.56, 77.1],
  [25.8, -80.29],
  [37.62, -122.38],
  [55.97, 37.41],
  [-26.13, 28.24],
]

interface Sample extends AirFix {
  t: number
}

function toContact(fix: AirFix): Contact {
  const label = fix.callsign || fix.icao.toUpperCase()
  return {
    id: `air:${fix.icao}`,
    layerId: LAYER,
    kind: 'air',
    lat: fix.lat,
    lon: fix.lon,
    altKm: displayAirAltKm(fix.altM, fix.onGround),
    heading: fix.track,
    label,
    detail: [
      label,
      fix.country,
      fix.onGround ? 'GROUND' : `${Math.round(fix.altM * 3.28084)}FT`,
      `${Math.round(fix.speedKt)}KT`,
      `TRK ${Math.round(fix.track)}`,
      fix.icao.toUpperCase(),
    ].filter(Boolean).join('\n'),
    brightness: fix.onGround ? 0.35 : 0.55 + Math.min(0.45, fix.altM / 12000),
    shape: 'chevron',
    scale: fix.onGround ? 0.7 : 1,
    callsign: fix.callsign,
  }
}

async function loadAdsb(ctx: LayerContext, cursor: { i: number }): Promise<AirFix[]> {
  const batch: Array<[number, number]> = []
  for (let n = 0; n < 8; n++) batch.push(HUBS[(cursor.i + n) % HUBS.length]!)
  cursor.i = (cursor.i + 8) % HUBS.length
  const jobs = batch.map(([lat, lon]) =>
    getJson(`/api/adsb/point?lat=${lat}&lon=${lon}&dist=230`, ctx.settings, ctx.signal).then(parseAdsb).catch(() => [] as AirFix[]),
  )
  jobs.push(getJson('/api/adsb/mil', ctx.settings, ctx.signal).then(parseAdsb).catch(() => [] as AirFix[]))
  const groups = await Promise.all(jobs)
  const merged = new Map<string, AirFix>()
  for (const group of groups) {
    for (const fix of group) if (fix.icao) merged.set(fix.icao, fix)
  }
  return capAir([...merged.values()], 8000)
}

export const aircraftPlugin: AllEyesPlugin = {
  id: 'aircraft',
  name: 'Aircraft',
  version: '1.0.0',
  layers: [
    {
      id: LAYER,
      label: 'AIR',
      description: 'Live flights from OpenSky, with regional ADS-B if that feed is quiet.',
      defaultOn: true,
      create(ctx) {
        let timer = 0
        let on = false
        const trails = new Map<string, Sample[]>()
        let latest: AirFix[] = []
        const cursor = { i: 0 }

        const remember = (fixes: AirFix[], t: number) => {
          for (const fix of fixes) {
            const row = trails.get(fix.icao) ?? []
            row.push({ ...fix, t })
            trails.set(fix.icao, row.slice(-24))
          }
        }

        const atTime = (sim: number): AirFix[] => {
          const out: AirFix[] = []
          for (const row of trails.values()) {
            let best: Sample | null = null
            for (const sample of row) {
              if (Math.abs(sample.t - sim) > 3 * 60 * 1000) continue
              if (!best || Math.abs(sample.t - sim) < Math.abs(best.t - sim)) best = sample
            }
            if (best) out.push(best)
          }
          return out
        }

        const publish = () => {
          const sim = ctx.clock.now()
          const live = Math.abs(sim - Date.now()) < 20_000
          const fixes = live ? latest : atTime(sim)
          ctx.publish(LAYER, fixes.map(toContact))
        }

        const tick = async () => {
          if (!on || ctx.signal.aborted) return
          try {
            const payload = await getJson('/api/opensky/states', ctx.settings, ctx.signal)
            const parsed = parseOpenSky(payload)
            if (parsed.length > 40) {
              latest = parsed
              remember(parsed, Date.now())
              ctx.log(LAYER, '')
              publish()
              return
            }
          } catch {
            /* fall through to regional ads-b */
          }
          try {
            latest = await loadAdsb(ctx, cursor)
            remember(latest, Date.now())
            ctx.log(LAYER, latest.length ? '' : 'AIR FEED EMPTY')
          } catch (err) {
            ctx.log(LAYER, err instanceof Error ? err.message : 'AIR FEED FAULT')
          }
          publish()
        }

        const offClock = ctx.clock.subscribe(() => { if (on) publish() })
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
            timer = window.setInterval(() => void tick(), 25000)
          },
          dispose() {
            on = false
            window.clearInterval(timer)
            offClock()
            ctx.publish(LAYER, [])
          },
        }
      },
    },
  ],
}
