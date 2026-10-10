import type { AirFix } from './parse'

export type FeedState = 'OK' | 'RATE-LIMITED' | 'PARTIAL' | 'OFFLINE'

export interface FeedSource {
  id: string
  path: string
}

/** Keyless ADS-B readers. OpenSky is queried separately with a bounding box. */
export const FEED_SOURCES: FeedSource[] = [
  { id: 'ADSB.LOL', path: '/api/adsb/point' },
  { id: 'ADSB.FI', path: '/api/adsbfi/point' },
  { id: 'AIRPLANES.LIVE', path: '/api/airplanes/point' },
]

export interface CoverageTile {
  lat: number
  lon: number
  dist: number
  key: string
}

export interface TileStamp {
  at: number
  ok: boolean
  count: number
}

/** Safety valve only. The live set is not stride-sampled, and the view is never the part that is dropped. */
export const RENDER_SOFT_CAP = 20_000

const NM_KM = 1.852

function normLon(lon: number): number {
  let x = lon
  while (x > 180) x -= 360
  while (x < -180) x += 360
  return x
}

export function makeTile(lat: number, lon: number, dist: number): CoverageTile {
  const latC = Math.max(-80, Math.min(80, lat))
  const lonC = normLon(lon)
  const radius = Math.max(10, Math.min(250, Math.round(dist)))
  return {
    lat: latC,
    lon: lonC,
    dist: radius,
    key: `${latC.toFixed(1)}:${lonC.toFixed(1)}:${radius}`,
  }
}

/** Radius in nautical miles. Tight when zoomed in so an airport is not one truncated circle. */
export function viewRadiusNm(rangeKm: number): number {
  if (rangeKm <= 180) return 25
  if (rangeKm <= 500) return 50
  if (rangeKm <= 1400) return 100
  return 250
}

/**
 * Overlapping circles that cover the camera view.
 * The first tile is the view center. A close view also asks for a tight field circle so parked aircraft are included.
 */
export function viewTiles(lat: number, lon: number, rangeKm: number): CoverageTile[] {
  const radius = viewRadiusNm(rangeKm)
  const spanKm = Math.min(12000, Math.max(36, rangeKm * 0.85))
  const stepKm = radius * 1.4 * NM_KM
  const rows = Math.min(5, Math.max(1, Math.round(spanKm / stepKm)))
  const latStep = stepKm / 111
  const i0 = -Math.floor((rows - 1) / 2)
  const out: CoverageTile[] = []
  if (rangeKm <= 500) out.push(makeTile(lat, lon, Math.min(25, radius)))
  for (let iy = 0; iy < rows; iy++) {
    const la = lat + (i0 + iy) * latStep
    const cos = Math.max(0.3, Math.cos((la * Math.PI) / 180))
    const lonStep = latStep / cos
    const j0 = -Math.floor((rows - 1) / 2)
    for (let ix = 0; ix < rows; ix++) {
      out.push(makeTile(la, lon + (j0 + ix) * lonStep, radius))
    }
  }
  return dedupeTiles(out)
}

/** Busy fields. Each one is its own 250 nm circle so a zoomed-out globe still has Atlanta, Chicago, London, and the rest. */
export const HUBS: ReadonlyArray<readonly [number, number]> = [
  [33.64, -84.43],
  [41.98, -87.9],
  [32.9, -97.04],
  [29.98, -95.34],
  [33.94, -118.41],
  [37.62, -122.38],
  [47.45, -122.31],
  [40.64, -73.78],
  [42.36, -71.01],
  [25.8, -80.29],
  [28.43, -81.31],
  [35.21, -80.94],
  [38.85, -77.04],
  [39.86, -104.67],
  [36.08, -115.15],
  [33.43, -112.01],
  [44.88, -93.22],
  [43.68, -79.63],
  [51.47, -0.46],
  [50.04, 8.56],
  [49.01, 2.55],
  [52.31, 4.76],
  [40.47, -3.56],
  [41.28, 2.07],
  [41.26, 28.74],
  [55.97, 37.41],
  [25.25, 55.36],
  [1.36, 103.99],
  [35.55, 139.78],
  [22.31, 113.91],
  [28.56, 77.1],
  [19.44, -99.07],
  [-33.95, 151.18],
  [-23.43, -46.47],
  [-26.13, 28.24],
  [30.12, 31.41],
]

export function hubTiles(): CoverageTile[] {
  return dedupeTiles(HUBS.map(([lat, lon]) => makeTile(lat, lon, 250)))
}

let sweepCache: CoverageTile[] | null = null

/** Coarse world grid. Free feeds cap a circle at 250 nm, so this cannot be gapless. The camera tiles fill whatever you are looking at. */
export function worldSweepTiles(): CoverageTile[] {
  if (sweepCache) return sweepCache
  const out: CoverageTile[] = []
  for (let lat = -54; lat <= 72; lat += 12) {
    const cos = Math.max(0.45, Math.abs(Math.cos((lat * Math.PI) / 180)))
    const step = 12 / cos
    for (let lon = -180; lon < 180; lon += step) out.push(makeTile(lat, normLon(lon), 250))
  }
  sweepCache = dedupeTiles(out)
  return sweepCache
}

export function dedupeTiles(tiles: readonly CoverageTile[]): CoverageTile[] {
  const seen = new Set<string>()
  const out: CoverageTile[] = []
  for (const tile of tiles) {
    if (seen.has(tile.key)) continue
    seen.add(tile.key)
    out.push(tile)
  }
  return out
}

export function dueTiles(
  now: number,
  lat: number,
  lon: number,
  rangeKm: number,
  stamps: ReadonlyMap<string, TileStamp>,
  limit: number,
  sweepCursor: number,
): { tiles: CoverageTile[]; nextCursor: number } {
  const fresh = (key: string, maxAge: number) => {
    const stamp = stamps.get(key)
    return !!stamp && now - stamp.at < maxAge
  }
  const due: CoverageTile[] = []
  for (const tile of viewTiles(lat, lon, rangeKm)) {
    if (!fresh(tile.key, 18_000)) due.push(tile)
  }
  for (const tile of hubTiles()) {
    if (due.length >= limit) break
    if (!fresh(tile.key, 45_000)) due.push(tile)
  }
  const sweep = worldSweepTiles()
  let cursor = sweep.length ? sweepCursor % sweep.length : 0
  let scanned = 0
  while (due.length < limit && sweep.length && scanned < sweep.length) {
    const tile = sweep[cursor]!
    cursor = (cursor + 1) % sweep.length
    scanned += 1
    if (!fresh(tile.key, 70_000)) due.push(tile)
  }
  return { tiles: dedupeTiles(due).slice(0, Math.max(0, limit)), nextCursor: cursor }
}

export function pointUrl(source: FeedSource, sample: CoverageTile): string {
  return `${source.path}?lat=${sample.lat.toFixed(2)}&lon=${sample.lon.toFixed(2)}&dist=${sample.dist}`
}

/** One record per ICAO. Later copies win, so a fresher tile replaces a stale one. There is no geographic subsample. */
export function mergeFixes(groups: readonly (readonly AirFix[])[]): AirFix[] {
  const map = new Map<string, AirFix>()
  for (const group of groups) {
    for (const fix of group) {
      const icao = fix.icao?.trim().toLowerCase()
      if (!icao) continue
      map.set(icao, { ...fix, icao })
    }
  }
  return [...map.values()]
}

export function distanceKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const earth = 6371
  const dLat = ((bLat - aLat) * Math.PI) / 180
  const dLon = ((bLon - aLon) * Math.PI) / 180
  const la1 = (aLat * Math.PI) / 180
  const la2 = (bLat * Math.PI) / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2
  return 2 * earth * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Ground distance from the camera center to the edge of what the window is showing. */
export function viewDiskKm(rangeKm: number): number {
  const earth = 6371
  const height = Math.max(1, rangeKm)
  const horizon = earth * Math.acos(Math.min(1, earth / (earth + height)))
  const cone = height * Math.tan((19 * Math.PI) / 180) * 1.25
  return Math.min(horizon, Math.max(cone, 30))
}

export function inView(lat: number, lon: number, viewLat: number, viewLon: number, rangeKm: number): boolean {
  return distanceKm(viewLat, viewLon, lat, lon) <= viewDiskKm(rangeKm)
}

/**
 * If the set is past the soft cap, drop the contacts farthest from the camera.
 * Aircraft inside the viewed disk stay, including ones on the ground.
 */
export function trimFarthest(list: readonly AirFix[], max: number, lat: number, lon: number): AirFix[] {
  if (list.length <= max) return list.slice()
  const scored = list.map((fix) => ({ fix, d: distanceKm(lat, lon, fix.lat, fix.lon) }))
  scored.sort((a, b) => a.d - b.d || a.fix.icao.localeCompare(b.fix.icao))
  return scored.slice(0, max).map((row) => row.fix)
}

export function centerFailed(
  stamps: ReadonlyMap<string, TileStamp>,
  lat: number,
  lon: number,
  rangeKm: number,
): boolean {
  const center = viewTiles(lat, lon, rangeKm)[0]
  if (!center) return false
  const stamp = stamps.get(center.key)
  return !!stamp && !stamp.ok
}

export type FeedFailure = 'rate' | 'denied' | 'down'

export function feedFailure(err: unknown): FeedFailure {
  const msg = err instanceof Error ? err.message : String(err)
  if (/\b429\b/.test(msg) || /\b420\b/.test(msg)) return 'rate'
  if (/\b403\b/.test(msg)) return 'denied'
  return 'down'
}

export function backoffMs(kind: FeedFailure): number {
  if (kind === 'rate') return 40_000
  if (kind === 'denied') return 5 * 60_000
  return 20_000
}

export interface SourceReport {
  id: string
  state: FeedState
}

export function sourceState(ok: number, rate: number, fail: number, backedOff: boolean): FeedState {
  if (backedOff && rate > 0 && ok === 0) return 'RATE-LIMITED'
  if (ok > 0 && (rate > 0 || fail > 0)) return 'PARTIAL'
  if (ok > 0 && backedOff && rate > 0) return 'PARTIAL'
  if (ok > 0) return 'OK'
  if (rate > 0) return 'RATE-LIMITED'
  return 'OFFLINE'
}

export function feedStatusLine(
  loaded: number,
  inViewCount: number,
  sources: readonly SourceReport[],
  coverageLimit: boolean,
): string {
  const src = sources.length ? sources.map((row) => `${row.id} ${row.state}`).join(' · ') : 'NONE'
  const tail = coverageLimit ? ' · FEED COVERAGE LIMIT' : ''
  return `AIR ${loaded} LOADED · ${inViewCount} VIEW · ${src}${tail}`
}

/** OpenSky box around the view. A wide view asks for a large slice of the globe. */
export function openSkyBox(lat: number, lon: number, rangeKm: number): string {
  const dLat = Math.min(90, Math.max(1.2, rangeKm / 111))
  const cos = Math.max(0.25, Math.abs(Math.cos((lat * Math.PI) / 180)))
  const dLon = Math.min(180, dLat / cos)
  const lamin = Math.max(-90, lat - dLat).toFixed(2)
  const lamax = Math.min(90, lat + dLat).toFixed(2)
  const lomin = Math.max(-180, lon - dLon).toFixed(2)
  const lomax = Math.min(180, lon + dLon).toFixed(2)
  return `/api/opensky/states?lamin=${lamin}&lomin=${lomin}&lamax=${lamax}&lomax=${lomax}`
}
