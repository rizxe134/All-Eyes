import { ageLabel, formatCard, withSpeed } from '../../core/cards'
import type { AllEyesPlugin, CardField, Contact, LayerContext, SpeedUnit } from '../../core/types'
import { getJson } from '../../net/http'
import { pitchDeg } from '../../core/models'
import { routeAhead } from './detail'
import { mergeAirMeta, parseAdsbDb, parseAdsbRoute, parseSpotters, readAirCache, writeAirCache, type AirMeta } from './lookup'
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
const lookedRoute = new Set<string>()
const lookedPhoto = new Set<string>()
const trails = new Map<string, Sample[]>()
let showAhead = true
let repaintTrail = () => {}

export function airTrail(icao: string): readonly Sample[] {
  return trails.get(icao) ?? []
}

export function airFixNow(icao: string): AirFix | null {
  const row = trails.get(icao)
  return row?.[row.length - 1] ?? null
}

export function airMetaFor(icao: string): AirMeta | undefined {
  return airMeta.get(icao)
}

export function setAirAhead(on: boolean): void {
  showAhead = on
  repaintTrail()
}

export function airAheadOn(): boolean {
  return showAhead
}

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
    pitch: pitchDeg(fix.vertFpm, fix.speedKt),
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
          const unit = ctx.settings.get().speedUnit
          ctx.publish(LAYER, fixes.map((fix) => toContact(fix, unit)))
          paintTrail()
        }

        const paintTrail = () => {
          const id = ctx.getTrackId()
          if (!id?.startsWith('air:')) {
            ctx.globe.setHistory(null)
            ctx.globe.setRoute(null)
            return
          }
          const hex = id.slice(4)
          const row = trails.get(hex) ?? []
          const alt = (sample: Sample) => displayAirAltKm(sample.altM, sample.onGround)
          ctx.globe.setHistory(row.length < 2 ? null : row.map((sample) => ({
            lat: sample.lat,
            lon: sample.lon,
            altKm: alt(sample),
          })))
          const fix = row[row.length - 1]
          const ahead = showAhead && fix ? routeAhead(fix.lat, fix.lon, airMeta.get(hex)) : null
          const height = fix ? alt(fix) : 8
          ctx.globe.setRoute(ahead ? ahead.map((point) => ({ ...point, altKm: height })) : null)
        }
        repaintTrail = paintTrail

        const storeMeta = (hex: string, extra: Partial<AirMeta>) => {
          airMeta.set(hex, mergeAirMeta(airMeta.get(hex), extra))
          writeAirCache(airMeta)
          if (on) publish()
        }

        const enrich = async (hex: string) => {
          if (!/^[0-9a-f]{6}$/.test(hex) || looked.has(hex)) return
          if (airMeta.get(hex)?.type || airMeta.get(hex)?.registration) return
          looked.add(hex)
          try {
            const meta = parseAdsbDb(await getJson(`/api/adsbdb?hex=${hex}`, ctx.settings, ctx.signal))
            if (!meta) return
            storeMeta(hex, meta)
          } catch {
            looked.delete(hex)
          }
        }

        const enrichRoute = async (hex: string, callsign: string) => {
          const cs = callsign.trim().toUpperCase()
          if (!/^[A-Z0-9]{3,8}$/.test(cs) || lookedRoute.has(hex)) return
          if (airMeta.get(hex)?.origin && airMeta.get(hex)?.destination) return
          lookedRoute.add(hex)
          try {
            const route = parseAdsbRoute(await getJson(`/api/adsbdb/callsign?cs=${encodeURIComponent(cs)}`, ctx.settings, ctx.signal))
            if (!route) return
            storeMeta(hex, route)
          } catch {
            lookedRoute.delete(hex)
          }
        }

        const enrichPhoto = async (hex: string) => {
          if (!/^[0-9a-f]{6}$/.test(hex) || lookedPhoto.has(hex)) return
          if (airMeta.get(hex)?.photoCredit?.includes('PlaneSpotters')) return
          lookedPhoto.add(hex)
          try {
            const photo = parseSpotters(await getJson(`/api/spot?hex=${hex}`, ctx.settings, ctx.signal))
            if (!photo) return
            storeMeta(hex, photo)
          } catch {
            lookedPhoto.delete(hex)
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
            const incoming = await loadAdsb(ctx, cursor)
            const now = Date.now()
            const merged = new Map<string, AirFix>()
            for (const fix of latest) merged.set(fix.icao, fix)
            for (const fix of incoming) merged.set(fix.icao, fix)
            remember(incoming, now)
            const fresh = [...merged.values()].filter((fix) => {
              const last = trails.get(fix.icao)?.at(-1)?.t ?? now
              return now - last < 4 * 60 * 1000
            })
            latest = capAir(fresh, 8000)
            ctx.log(LAYER, latest.length ? '' : 'AIR FEED EMPTY')
          } catch (err) {
            ctx.log(LAYER, err instanceof Error ? err.message : 'AIR FEED FAULT')
          }
          publish()
          queueMissing()
        }

        const offClock = ctx.clock.subscribe(() => { if (on) publish() })
        const offTrack = ctx.onTrack((id) => {
          if (id?.startsWith('air:')) {
            const hex = id.slice(4)
            const fix = trails.get(hex)?.at(-1)
            void enrich(hex)
            void enrichRoute(hex, fix?.callsign ?? '')
            void enrichPhoto(hex)
          }
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
