import { ageLabel, formatCard, withSpeed } from '../../core/cards'
import type { AllEyesPlugin, CardField, Contact, SpeedUnit } from '../../core/types'
import { getJson } from '../../net/http'
import { pitchDeg } from '../../core/models'
import { routeAhead } from './detail'
import { mergeAirMeta, parseAdsbDb, parseAdsbRoute, parseSpotters, readAirCache, writeAirCache, type AirMeta } from './lookup'
import {
  FEED_SOURCES,
  RENDER_SOFT_CAP,
  backoffMs,
  centerFailed,
  dueTiles,
  feedFailure,
  feedStatusLine,
  inView,
  mergeFixes,
  openSkyBox,
  pointUrl,
  sourceState,
  trimFarthest,
  type CoverageTile,
  type FeedSource,
  type SourceReport,
  type TileStamp,
} from './feed'
import { displayAirAltKm, parseAdsb, parseOpenSky, type AirFix } from './parse'
import { STALE_MS, deadReckonFix, mergeHeld, type HeldContact } from './retain'
import './sprites'
import { classifyAir } from './types'

const LAYER = 'aircraft'
const GND = 'airground'
let airOn = false
let gndOn = false
let republish = () => {}
let armPoll = () => {}
let disarmPoll = () => {}

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
    brightness: fix.onGround ? 0.7 : 0.55 + Math.min(0.4, fix.altM / 12000),
    shape: fix.onGround ? 'air-gnd' : glyph.sprite,
    scale: fix.onGround ? 0.8 : 1,
    callsign: fix.callsign,
    card,
    speedKt: fix.speedKt,
  }
}

export const aircraftPlugin: AllEyesPlugin = {
  id: 'aircraft',
  name: 'Aircraft',
  version: '1.0.0',
  layers: [
    {
      id: LAYER,
      label: 'AIR',
      description: 'Airborne flights. The view is tiled from the free feeds, and the last good positions stay up for 90 seconds.',
      defaultOn: true,
      create(ctx) {
        let timer = 0
        let drift = 0
        let held: Map<string, HeldContact> = new Map()
        let pumping = false
        let sweepCursor = 0
        let rotate = 0
        let openskyAt = 0
        let milAt = 0
        let statsAt = Date.now()
        const stamps = new Map<string, TileStamp>()
        const stats = new Map<string, { ok: number; rate: number; fail: number }>()

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

        const rollStats = (now: number) => {
          if (now - statsAt < 60_000) return
          statsAt = now
          stats.clear()
        }

        const bump = (id: string, kind: 'ok' | 'rate' | 'fail') => {
          const row = stats.get(id) ?? { ok: 0, rate: 0, fail: 0 }
          row[kind] += 1
          stats.set(id, row)
        }

        const publish = () => {
          const fixes = fixesNow()
          const unit = ctx.settings.get().speedUnit
          const view = ctx.globe.getView()
          const airborne = fixes.filter((fix) => !fix.onGround)
          const grounded = fixes.filter((fix) => fix.onGround)
          ctx.publish(LAYER, airOn ? airborne.map((fix) => toContact(fix, unit)) : [])
          ctx.publish(GND, gndOn ? grounded.map((fix) => toContact(fix, unit)) : [])
          const shown = [...(airOn ? airborne : []), ...(gndOn ? grounded : [])]
          const visible = shown.filter((fix) => inView(fix.lat, fix.lon, view.lat, view.lon, view.rangeKm)).length
          const now = Date.now()
          const sources: SourceReport[] = [...FEED_SOURCES.map((source) => source.id), 'OPENSKY'].map((id) => {
            const row = stats.get(id) ?? { ok: 0, rate: 0, fail: 0 }
            const backed = (sourceBackoff.get(id) ?? 0) > now
            return { id, state: sourceState(row.ok, row.rate, row.fail, backed) }
          })
          const gap = centerFailed(stamps, view.lat, view.lon, view.rangeKm) && visible === 0
          ctx.status?.(LAYER, feedStatusLine(fixes.length, visible, sources, gap))
          const quiet = fixes.length === 0 && sources.every((row) => row.state === 'OFFLINE' || row.state === 'RATE-LIMITED')
          ctx.log(LAYER, quiet ? 'AIR FEED OFFLINE' : '')
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
          if (airOn || gndOn) publish()
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

        const orderedSources = (): FeedSource[] => {
          const now = Date.now()
          const ready = FEED_SOURCES.filter((source) => (sourceBackoff.get(source.id) ?? 0) <= now)
          if (!ready.length) return []
          const start = rotate % ready.length
          rotate = (rotate + 1) % FEED_SOURCES.length
          return [...ready.slice(start), ...ready.slice(0, start)]
        }

        const fetchTile = async (tile: CoverageTile): Promise<AirFix[]> => {
          const order = orderedSources()
          if (!order.length) {
            stamps.set(tile.key, { at: Date.now(), ok: false, count: 0 })
            return []
          }
          for (const source of order) {
            try {
              const parsed = parseAdsb(await getJson(pointUrl(source, tile), ctx.settings, ctx.signal))
              bump(source.id, 'ok')
              stamps.set(tile.key, { at: Date.now(), ok: true, count: parsed.length })
              return parsed
            } catch (err) {
              const kind = feedFailure(err)
              sourceBackoff.set(source.id, Date.now() + backoffMs(kind))
              bump(source.id, kind === 'rate' ? 'rate' : 'fail')
            }
          }
          stamps.set(tile.key, { at: Date.now(), ok: false, count: 0 })
          return []
        }

        const fetchMil = async (): Promise<AirFix[]> => {
          if (Date.now() - milAt < 40_000) return []
          if ((sourceBackoff.get('ADSB.LOL') ?? 0) > Date.now()) return []
          milAt = Date.now()
          try {
            return parseAdsb(await getJson('/api/adsb/mil', ctx.settings, ctx.signal))
          } catch {
            return []
          }
        }

        const fetchOpenSky = async (lat: number, lon: number, rangeKm: number): Promise<AirFix[]> => {
          const now = Date.now()
          if (now - openskyAt < 22_000) return []
          if ((sourceBackoff.get('OPENSKY') ?? 0) > now) return []
          openskyAt = now
          try {
            const parsed = parseOpenSky(await getJson(openSkyBox(lat, lon, rangeKm), ctx.settings, ctx.signal))
            if (parsed.length) bump('OPENSKY', 'ok')
            return parsed
          } catch (err) {
            const kind = feedFailure(err)
            sourceBackoff.set('OPENSKY', Date.now() + backoffMs(kind))
            bump('OPENSKY', kind === 'rate' ? 'rate' : 'fail')
            return []
          }
        }

        const pump = async () => {
          if (pumping || (!airOn && !gndOn) || ctx.signal.aborted) return
          pumping = true
          try {
            const view = ctx.globe.getView()
            const now = Date.now()
            rollStats(now)
            const batch = dueTiles(now, view.lat, view.lon, view.rangeKm, stamps, 2, sweepCursor)
            sweepCursor = batch.nextCursor
            const [groups, sky, mil] = await Promise.all([
              Promise.all(batch.tiles.map((tile) => fetchTile(tile))),
              fetchOpenSky(view.lat, view.lon, view.rangeKm),
              fetchMil(),
            ])
            const incoming = mergeFixes([...groups, sky, mil])
            const stamped = Date.now()
            if (incoming.length) remember(incoming, stamped)
            held = mergeHeld(held, incoming.length ? incoming : null, stamped, STALE_MS)
            if (held.size > RENDER_SOFT_CAP) {
              const kept = new Map<string, HeldContact>()
              for (const fix of trimFarthest([...held.values()].map((row) => row.fix), RENDER_SOFT_CAP, view.lat, view.lon)) {
                const prev = held.get(fix.icao)
                if (prev) kept.set(fix.icao, prev)
              }
              held = kept
            }
            if (trails.size > held.size + 800) {
              for (const key of trails.keys()) if (!held.has(key)) trails.delete(key)
            }
            publish()
            queueMissing()
          } finally {
            pumping = false
          }
        }

        const arm = () => {
          if (timer) return
          void pump()
          timer = window.setInterval(() => void pump(), 900)
          drift = window.setInterval(() => { if (airOn || gndOn) publish() }, 2000)
        }
        const disarm = () => {
          if (airOn || gndOn) return
          window.clearInterval(timer)
          window.clearInterval(drift)
          timer = 0
          drift = 0
        }
        republish = publish
        armPoll = arm
        disarmPoll = disarm

        const offClock = ctx.clock.subscribe(() => { if (airOn || gndOn) publish() })
        const offTrack = ctx.onTrack((id) => {
          if (id?.startsWith('air:')) {
            const hex = id.slice(4)
            const fix = trails.get(hex)?.at(-1)
            void enrich(hex)
            void enrichRoute(hex, fix?.callsign ?? '')
            void enrichPhoto(hex)
          }
          if (airOn || gndOn) paintTrail()
        })
        const offHover = ctx.globe.onHover((hit) => {
          const id = hit?.marker.id
          if (id?.startsWith('air:')) void enrich(id.slice(4))
        })
        return {
          setEnabled(next) {
            if (next === airOn) return
            airOn = next
            if (!next) ctx.publish(LAYER, [])
            if (next) arm()
            else disarm()
            if (airOn || gndOn) publish()
          },
          dispose() {
            airOn = false
            window.clearInterval(timer)
            window.clearInterval(drift)
            timer = 0
            drift = 0
            republish = () => {}
            armPoll = () => {}
            disarmPoll = () => {}
            offClock()
            offTrack()
            offHover()
            ctx.publish(LAYER, [])
          },
        }
      },
    },
    {
      id: GND,
      label: 'GND',
      description: 'Aircraft on the ground, drawn in amber. Turn this off to hide parked and taxiing traffic.',
      defaultOn: true,
      create(ctx) {
        return {
          setEnabled(next) {
            if (next === gndOn) return
            gndOn = next
            if (!next) ctx.publish(GND, [])
            if (next) armPoll()
            else disarmPoll()
            republish()
          },
          dispose() {
            gndOn = false
            ctx.publish(GND, [])
          },
        }
      },
    },
  ],
}
