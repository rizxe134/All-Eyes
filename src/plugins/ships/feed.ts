import { inView } from '../aircraft/feed'

export interface ShipBox {
  south: number
  west: number
  north: number
  east: number
  key: string
}

function wrapLon(lon: number): number {
  let x = lon
  while (x > 180) x -= 360
  while (x < -180) x += 360
  return x
}

/** One Open Waters box stays under the anonymous 100 square-degree cap. */
export function shipTiles(lat: number, lon: number, rangeKm: number): ShipBox[] {
  const span = Math.min(8, Math.max(0.35, rangeKm / 111))
  const viewSpan = Math.min(36, Math.max(span, rangeKm / 80))
  const step = span * 0.85
  const rows = Math.min(3, Math.max(1, Math.round(viewSpan / step)))
  const half = (rows - 1) / 2
  const out: ShipBox[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < rows; c++) {
      const clat = Math.min(80, Math.max(-80, lat + (r - half) * step))
      const clon = wrapLon(lon + (c - half) * step)
      const south = Math.max(-80, clat - span / 2)
      const north = Math.min(80, clat + span / 2)
      const west = wrapLon(clon - span / 2)
      const east = wrapLon(clon + span / 2)
      out.push({
        south,
        west,
        north,
        east,
        key: `${south.toFixed(1)}:${west.toFixed(1)}:${north.toFixed(1)}:${east.toFixed(1)}`,
      })
    }
  }
  const center = out.find((box) => Math.abs(box.south + box.north - 2 * lat) < span && Math.abs(wrapLon(box.west + (span / 2) - lon)) < span)
  if (!center) return out
  return [center, ...out.filter((box) => box !== center)]
}

export function boxArea(box: ShipBox): number {
  let width = box.east - box.west
  if (width < 0) width += 360
  return Math.abs(box.north - box.south) * width
}

export interface ShipStamp {
  at: number
  ok: boolean
  count: number
}

export function dueShipTiles(
  now: number,
  lat: number,
  lon: number,
  rangeKm: number,
  stamps: ReadonlyMap<string, ShipStamp>,
  limit: number,
): ShipBox[] {
  const tiles = shipTiles(lat, lon, rangeKm).filter((box) => boxArea(box) <= 96)
  const fresh = (box: ShipBox, maxAge: number) => {
    const stamp = stamps.get(box.key)
    return !!stamp && now - stamp.at < maxAge
  }
  const due = tiles.filter((box, index) => !fresh(box, index === 0 ? 18_000 : 40_000))
  return due.slice(0, Math.max(0, limit))
}

export function shipsInView(rows: readonly { lat: number; lon: number }[], lat: number, lon: number, rangeKm: number): number {
  let n = 0
  for (const row of rows) {
    if (inView(row.lat, row.lon, lat, lon, rangeKm)) n += 1
  }
  return n
}

export type ShipSourceState = 'OK' | 'PARTIAL' | 'OFFLINE' | 'RATE-LIMITED'

export function shipSourceState(ok: number, fail: number, truncated: boolean): ShipSourceState {
  if (ok > 0 && (fail > 0 || truncated)) return 'PARTIAL'
  if (ok > 0) return 'OK'
  if (fail > 0) return 'OFFLINE'
  return 'OFFLINE'
}

export function shipStatusLine(
  loaded: number,
  visible: number,
  sources: readonly { id: string; state: ShipSourceState }[],
  coverageLimit: boolean,
): string {
  const parts = sources.map((source) => `${source.id} ${source.state}`)
  const gap = coverageLimit ? ' · FEED COVERAGE LIMIT' : ''
  return `SHIPS ${loaded} LOADED · ${visible} VIEW · ${parts.join(' · ')}${gap}`
}

export function shipCoverageLimit(visible: number, centerTried: boolean, centerOk: boolean, centerCount: number, streamLive: boolean): boolean {
  if (visible > 0 || streamLive || !centerTried) return false
  return !centerOk || centerCount === 0
}
