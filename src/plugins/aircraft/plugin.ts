import { ageLabel, formatCard, withSpeed } from '../../core/cards'
import type { AllEyesPlugin, CardField, Contact, LayerContext, SpeedUnit } from '../../core/types'
import { getJson } from '../../net/http'
import { pitchDeg } from '../../core/models'
import { routeAhead } from './detail'
import { mergeAirMeta, parseAdsbDb, parseAdsbRoute, parseSpotters, readAirCache, writeAirCache, type AirMeta } from './lookup'
import { FEED_SOURCES, backoffMs, feedFailure, feedStatusLine, openSkyBox, pointUrl, viewSamples, type FeedState } from './feed'
import { capAir, displayAirAltKm, parseAdsb, parseOpenSky, type AirFix } from './parse'
import { STALE_MS, deadReckonFix, mergeHeld, type HeldContact } from './retain'
import './sprites'
import { classifyAir } from './types'

const LAYER = 'aircraft'

interface Sample extends AirFix {
  t: number
}

const sourceBackoff = new Map<string, number>()

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

function collectFixes(groups: AirFix[][]): AirFix[] {
  const merged = new Map<string, AirFix>()
  for (const group of groups) {
    for (const fix of group) if (fix.icao) merged.set(fix.icao, fix)
  }
  return [...merged.values()]
}

async function loadRegional(ctx: LayerContext, lat: number, lon: number, rangeKm: number): Promise<{ fixes: AirFix[]; source: string; state: FeedState }> {
  const points = viewSamples(lat, lon, rangeKm)
  const now = Date.now()
  let sawRate = false
  for (const source of FEED_SOURCES) {
    if ((sourceBackoff.get(source.id) ?? 0) > now) continue
    const probe = points[0]
    if (!probe) continue
    let first: AirFix[] = []
    try {
      first = parseAdsb(await getJson(pointUrl(source, probe), ctx.settings, ctx.signal))
    } catch (err) {
      const kind = feedFailure(err)
      if (kind === 'rate') sawRate = true
      sourceBackoff.set(source.id, now + backoffMs(kind))
      continue
    }
    const rest = await Promise.all(points.slice(1).map((sample) =>
      getJson(pointUrl(source, sample), ctx.settings, ctx.signal).then(parseAdsb).catch((err: unknown) => {
        if (feedFailure(err) === 'rate') sawRate = true
        return [] as AirFix[]
      }),
    ))
    if (source.id === 'ADSB.LOL') {
      rest.push(await getJson('/api/adsb/mil', ctx.settings, ctx.signal).then(parseAdsb).catch(() => [] as AirFix[]))
    }
    const fixes = capAir(collectFixes([first, ...rest]), 8000)
    if (fixes.length) return { fixes, source: source.id, state: sawRate ? 'RATE-LIMITED' : 'OK' }
  }
  return { fixes: [], source: 'NONE', state: sawRate ? 'RATE-LIMITED' : 'OFFLINE' }
}

export const aircraftPlugin: AllEyesPlugin = {
  id: 'aircraft',
  name: 'Aircraft',
  version: '1.0.0',
  layers: [
    {
      id: LAYER,
      label: 'AIR',
      description: 'Live flights around the view. The last good positions stay up if a feed stalls.',
      defaultOn: true,
      create(ctx) {
        let timer = 0
        let drift = 0
        let on = false
        let held: Map<string, HeldContact> = new Map()
        let feedState: FeedState = 'OFFLINE'
        let feedSource = 'NONE'

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

        const fixesNow = (): AirFix[] => {
          const sim = ctx.clock.now()
          const live = Math.abs(sim - Date.now()) < 20_000
          if (!live) return atTime(sim)
          const now = Date.now()
          return [...held.values()].map((row) => deadReckonFix(row.fix, row.updatedAt, now))
        }

        const publish = () => {
          const fixes = fixesNow()
          const unit = ctx.settings.get().speedUnit
          ctx.publish(LAYER, fixes.map((fix) => toContact(fix, unit)))
          const state = fixes.length ? feedState : 'OFFLINE'
          ctx.status?.(LAYER, feedStatusLine(fixes.length, state, feedSource))
          ctx.log(LAYER, state === 'OFFLINE' && fixes.length === 0 ? 'AIR FEED OFFLINE' : '')
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
          for (const row of held.values()) {
            const fix = row.fix
            if (budget <= 0) break
            if (fix.typeCode || airMeta.has(fix.icao) || looked.has(fix.icao)) continue
            budget -= 1
            void enrich(fix.icao)
          }
        }

        const tick = async () => {
          if (!on || ctx.signal.aborted) return
          const view = ctx.globe.getView()
          const now = Date.now()
          let incoming: AirFix[] = []
          try {
            const regional = await loadRegional(ctx, view.lat, view.lon, view.rangeKm)
            incoming = regional.fixes
            feedSource = regional.source
            feedState = regional.state
          } catch (err) {
            const kind = feedFailure(err)
            feedState = kind === 'rate' ? 'RATE-LIMITED' : 'OFFLINE'
          }
          if (incoming.length < 15 && (sourceBackoff.get('OPENSKY') ?? 0) <= now) {
            try {
              const parsed = parseOpenSky(await getJson(openSkyBox(view.lat, view.lon, view.rangeKm), ctx.settings, ctx.signal))
              if (parsed.length) {
                incoming = capAir(collectFixes([incoming, parsed]), 8000)
                if (feedSource === 'NONE') feedSource = 'OPENSKY'
                feedState = feedState === 'RATE-LIMITED' ? 'RATE-LIMITED' : 'OK'
              }
            } catch (err) {
              const kind = feedFailure(err)
              sourceBackoff.set('OPENSKY', now + backoffMs(kind))
              if (!incoming.length) feedState = kind === 'rate' ? 'RATE-LIMITED' : 'OFFLINE'
            }
          }
          if (incoming.length) remember(incoming, now)
          held = mergeHeld(held, incoming.length ? incoming : null, now, STALE_MS)
          if (held.size > 8000) {
            const capped = new Map<string, HeldContact>()
            for (const row of capAir([...held.values()].map((item) => item.fix), 8000)) {
              const prev = held.get(row.icao)
              if (prev) capped.set(row.icao, prev)
            }
            held = capped
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
              window.clearInterval(drift)
              ctx.publish(LAYER, [])
              ctx.status?.(LAYER, feedStatusLine(0, 'OFFLINE', 'NONE'))
              return
            }
            void tick()
            timer = window.setInterval(() => void tick(), 25000)
            drift = window.setInterval(() => { if (on) publish() }, 2000)
          },
          dispose() {
            on = false
            window.clearInterval(timer)
            window.clearInterval(drift)
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
