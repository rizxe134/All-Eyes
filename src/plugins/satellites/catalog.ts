import type { SettingsStore } from '../../core/types'
import { getText } from '../../net/http'
import { classifySat, designator, type SatGroup } from './elements'
import { parseTle, type SatFix } from './parse'
import { buildSatrec, propagateGeodetic, speedKmS } from './propagate'
import type { SatRec } from 'satellite.js'

export interface CatalogSat {
  name: string
  norad: number
  line1: string
  line2: string
  group: SatGroup
  designator: string
  satrec: SatRec
}

export interface SatPlace {
  lat: number
  lon: number
  altKm: number
  speed: number
}

const TLE_KEY = 'alleyes.tle.active.v1'
const FRESH_MS = 6 * 60 * 60 * 1000
const KEEP_MS = 18 * 60 * 60 * 1000

const byNorad = new Map<number, CatalogSat>()
const places = new Map<number, SatPlace>()
let loading: Promise<void> | null = null
let loadedAt = 0
let cursor = 0
let order: CatalogSat[] = []
let fault = ''

export function catalogFault(): string {
  return fault
}

export function catalogCount(): number {
  return byNorad.size
}

export function catalogReady(): boolean {
  return byNorad.size > 0
}

export function satsIn(group: SatGroup): CatalogSat[] {
  const out: CatalogSat[] = []
  for (const sat of byNorad.values()) {
    if (sat.group === group) out.push(sat)
  }
  return out
}

export function placeOf(norad: number): SatPlace | undefined {
  return places.get(norad)
}

/** Propagate one satellite immediately so a search can lock it before its slice comes around. */
export function ensurePlace(norad: number, when = new Date()): SatPlace | undefined {
  const existing = places.get(norad)
  if (existing) return existing
  const sat = byNorad.get(norad)
  if (!sat) return undefined
  const point = propagateGeodetic(sat.satrec, when)
  if (!point) return undefined
  const place: SatPlace = {
    lat: point.lat,
    lon: point.lon,
    altKm: point.altKm,
    speed: speedKmS(sat.satrec, when) ?? 0,
  }
  places.set(norad, place)
  return place
}

export function catalogSat(norad: number): CatalogSat | undefined {
  return byNorad.get(norad)
}

export function findCatalog(query: string): CatalogSat | null {
  const q = query.trim().toLowerCase()
  if (!q) return null
  const alias: Record<string, RegExp> = {
    iss: /ISS \(ZARYA\)/i,
    tiangong: /TIANHE|TIANGONG/i,
    css: /TIANHE/i,
    hubble: /HST|HUBBLE/i,
  }
  const named = alias[q]
  if (named) {
    for (const sat of byNorad.values()) {
      if (named.test(sat.name)) return sat
    }
  }
  const norad = Number(q)
  if (Number.isFinite(norad) && byNorad.has(norad)) return byNorad.get(norad) ?? null
  let partial: CatalogSat | null = null
  for (const sat of byNorad.values()) {
    const name = sat.name.toLowerCase()
    if (name === q) return sat
    if (!partial && name.includes(q)) partial = sat
  }
  return partial
}

function remember(text: string): void {
  try {
    localStorage.setItem(TLE_KEY, JSON.stringify({ at: Date.now(), text }))
  } catch {
    /* quota: the in-memory catalog still works for this session */
  }
}

function cachedText(): { at: number; text: string } | null {
  try {
    const raw = localStorage.getItem(TLE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { at?: unknown; text?: unknown }
    if (typeof parsed.text !== 'string' || parsed.text.length < 100) return null
    const at = Number(parsed.at) || 0
    if (Date.now() - at > KEEP_MS) return null
    return { at, text: parsed.text }
  } catch {
    return null
  }
}

function ingest(text: string): Promise<void> {
  const fixes = parseTle(text, 'active')
  return new Promise((resolve) => {
    let index = 0
    const step = () => {
      const end = Math.min(fixes.length, index + 700)
      for (; index < end; index++) {
        const fix: SatFix | undefined = fixes[index]
        if (!fix) continue
        const satrec = buildSatrec(fix)
        if (!satrec) continue
        byNorad.set(fix.norad, {
          name: fix.name,
          norad: fix.norad,
          line1: fix.line1,
          line2: fix.line2,
          group: classifySat(fix.name, fix.line2),
          designator: designator(fix.line1),
          satrec,
        })
      }
      if (index < fixes.length) setTimeout(step, 0)
      else {
        order = [...byNorad.values()]
        cursor = 0
        loadedAt = Date.now()
        resolve()
      }
    }
    step()
  })
}

export function ensureCatalog(settings: SettingsStore, signal?: AbortSignal): Promise<void> {
  if (byNorad.size > 0 && Date.now() - loadedAt < FRESH_MS) return Promise.resolve()
  if (loading) return loading
  loading = (async () => {
    const cached = byNorad.size === 0 ? cachedText() : null
    if (cached) await ingest(cached.text)
    if (byNorad.size > 0 && Date.now() - (cached?.at ?? 0) < FRESH_MS) return
    try {
      const text = await getText('/api/celestrak?group=active', settings, signal, 60_000)
      if (!text.includes('1 ') || !text.includes('2 ')) throw new Error('EMPTY TLE')
      byNorad.clear()
      places.clear()
      await ingest(text)
      remember(text)
      fault = ''
    } catch (err) {
      fault = err instanceof Error ? err.message : 'TLE FAULT'
      if (byNorad.size === 0) throw err
    }
  })().finally(() => {
    loading = null
  })
  return loading
}

/** Advance SGP4 for a slice of enabled groups, always including the selected satellite. */
export function stepPropagation(when: Date, focus: number | null, batch = 350, allow?: (group: SatGroup) => boolean): void {
  if (order.length === 0) return
  let stepped = 0
  let scanned = 0
  while (stepped < batch && scanned < order.length) {
    const sat = order[cursor]
    cursor = (cursor + 1) % order.length
    scanned += 1
    if (!sat || (allow && !allow(sat.group))) continue
    const point = propagateGeodetic(sat.satrec, when)
    if (!point) continue
    places.set(sat.norad, {
      lat: point.lat,
      lon: point.lon,
      altKm: point.altKm,
      speed: speedKmS(sat.satrec, when) ?? 0,
    })
    stepped += 1
  }
  if (focus != null) {
    const sat = byNorad.get(focus)
    if (!sat) return
    const point = propagateGeodetic(sat.satrec, when)
    if (!point) return
    places.set(sat.norad, {
      lat: point.lat,
      lon: point.lon,
      altKm: point.altKm,
      speed: speedKmS(sat.satrec, when) ?? 0,
    })
  }
}
