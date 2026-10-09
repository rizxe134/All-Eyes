import { ageLabel, formatCard, withSpeed } from '../../core/cards'
import type { AllEyesPlugin, CardField, Contact, LayerContext, SpeedUnit } from '../../core/types'
import { getJson } from '../../net/http'
import { parseAdsbDb, readAirCache, writeAirCache, type AirMeta } from './lookup'
import { capAir, displayAirAltKm, parseAdsb, parseOpenSky, type AirFix } from './parse'
import './sprites'
import { classifyAir } from './types'

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

const airMeta = readAirCache()
const looked = new Set<string>()

export function airFields(fix: AirFix, extra: AirMeta | undefined, now = Date.now()): CardField[] {
  const code = extra?.type || fix.typeCode
  const glyph = classifyAir(code)
  const named = extra?.typeName || fix.desc || glyph.name
  const typeLine = code && !named.toUpperCase().includes(code) ? `${named} (${code})` : named
  return [
    { k: 'CS', v: fix.callsign },
    { k: 'REG', v: extra?.registration || fix.registration },
    { k: 'TYPE', v: typeLine },
    { k: 'OP', v: extra?.operator || fix.country },
    { k: 'FROM', v: extra?.origin || '' },
    { k: 'TO', v: extra?.destination || '' },
    { k: 'ALT', v: fix.onGround ? 'GROUND' : `${Math.round(fix.altM * 3.28084)} FT` },
    { k: 'SPD', v: '' },
    { k: 'VS', v: `${Math.round(fix.vertFpm)} FPM` },
    { k: 'HDG', v: `${Math.round(fix.track)}°` },
    { k: 'SQ', v: fix.squawk },
    { k: 'POS', v: `${fix.lat.toFixed(2)} ${fix.lon.toFixed(2)}` },
    { k: 'AGE', v: ageLabel(fix.seenMs, now) },
    { k: 'HEX', v: fix.icao.toUpperCase() },
  ]
}

function toContact(fix: AirFix, unit: SpeedUnit): Contact {
  const extra = airMeta.get(fix.icao)
  const glyph = classifyAir(extra?.type || fix.typeCode)
  const label = fix.callsign || fix.registration || fix.icao.toUpperCase()
  const card = withSpeed(airFields(fix, extra), fix.speedKt, unit)
  return {
    id: `air:${fix.icao}`,
    layerId: LAYER,
    kind: 'air',
    lat: fix.lat,
    lon: fix.lon,
    altKm: displayAirAltKm(fix.altM, fix.onGround),
    heading: fix.track,
    label,
    detail: formatCard(card),
    brightness: fix.onGround ? 0.32 : 0.5 + Math.min(0.4, fix.altM / 12000),
    shape: glyph.sprite,
    scale: fix.onGround ? 0.72 : 1,
    callsign: fix.callsign,
    card,
    speedKt: fix.speedKt,
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

        let orbitOwned = false
        const publish = () => {
          const sim = ctx.clock.now()
          const live = Math.abs(sim - Date.now()) < 20_000
          const fixes = live ? latest : atTime(sim)
          const unit = ctx.settings.get().speedUnit
          ctx.publish(LAYER, fixes.map((fix) => toContact(fix, unit)))
          paintTrail()
        }

        const paintTrail = () => {
          const id = ctx.getTrackId()
          if (!id?.startsWith('air:')) {
            if (orbitOwned) {
              ctx.globe.setOrbit(null)
              orbitOwned = false
            }
            return
          }
          const row = trails.get(id.slice(4)) ?? []
          if (row.length < 2) return
          orbitOwned = true
          ctx.globe.setOrbit(row.map((sample) => ({
            lat: sample.lat,
            lon: sample.lon,
            altKm: displayAirAltKm(sample.altM, sample.onGround),
          })))
        }

        const enrich = async (hex: string) => {
          if (!/^[0-9a-f]{6}$/.test(hex) || looked.has(hex) || airMeta.has(hex)) return
          looked.add(hex)
          try {
            const meta = parseAdsbDb(await getJson(`/api/adsbdb?hex=${hex}`, ctx.settings, ctx.signal))
            if (!meta) return
            airMeta.set(hex, meta)
            writeAirCache(airMeta)
            if (on) publish()
          } catch {
            looked.delete(hex)
          }
        }

        const queueMissing = () => {
          let budget = 4
          for (const fix of latest) {
            if (budget <= 0) break
            if (fix.typeCode || airMeta.has(fix.icao) || looked.has(fix.icao)) continue
            budget -= 1
            void enrich(fix.icao)
          }
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
              queueMissing()
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
          queueMissing()
        }

        const offClock = ctx.clock.subscribe(() => { if (on) publish() })
        const offTrack = ctx.onTrack((id) => {
          if (id?.startsWith('air:')) void enrich(id.slice(4))
          if (on) paintTrail()
        })
        const offHover = ctx.globe.onHover((hit) => {
          const id = hit?.marker.id
          if (id?.startsWith('air:')) void enrich(id.slice(4))
        })
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
            offTrack()
            offHover()
            ctx.publish(LAYER, [])
          },
        }
      },
    },
  ],
}
