/** Web Mercator tile math. y grows south, matching OSM, CARTO, and Esri XYZ. */

import { clamp } from '../core/geo'

const MAX_LAT = 85.05112878

export interface TileId {
  z: number
  x: number
  y: number
}

export interface TileBounds {
  west: number
  south: number
  east: number
  north: number
}

export function lonToTileX(lon: number, z: number): number {
  return ((lon + 180) / 360) * 2 ** z
}

export function latToTileY(lat: number, z: number): number {
  const clamped = clamp(lat, -MAX_LAT, MAX_LAT)
  const s = Math.sin((clamped * Math.PI) / 180)
  const merc = 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)
  return merc * 2 ** z
}

export function tileXToLon(x: number, z: number): number {
  return (x / 2 ** z) * 360 - 180
}

export function tileYToLat(y: number, z: number): number {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** z
  return (Math.atan(Math.sinh(n)) * 180) / Math.PI
}

export function tileBounds(z: number, x: number, y: number): TileBounds {
  return {
    west: tileXToLon(x, z),
    east: tileXToLon(x + 1, z),
    north: tileYToLat(y, z),
    south: tileYToLat(y + 1, z),
  }
}

/** Zoom whose ground resolution is near one screen pixel across the view. */
export function zoomForRange(rangeKm: number, lat: number): number {
  const spanKm = Math.max(0.04, rangeKm) * 2 * Math.tan((19 * Math.PI) / 180)
  const mPerPx = (spanKm * 1000) / 700
  const cos = Math.max(0.15, Math.cos((clamp(lat, -75, 75) * Math.PI) / 180))
  const z = Math.log2((156543.03392 * cos) / Math.max(0.04, mPerPx))
  return clamp(Math.round(z), 3, 18)
}

export type CityBand = 'world' | 'region' | 'city' | 'street'

export function cityBand(rangeKm: number): CityBand {
  if (rangeKm > 55) return 'world'
  if (rangeKm > 14) return 'region'
  if (rangeKm > 2.2) return 'city'
  return 'street'
}

interface TileWindow {
  x0: number
  x1: number
  y0: number
  y1: number
}

function tileWindow(lat: number, lon: number, rangeKm: number, z: number): TileWindow {
  const halfKm = Math.max(0.05, rangeKm) * Math.tan((19 * Math.PI) / 180) * 1.35
  const dLat = halfKm / 111
  const dLon = dLat / Math.max(0.2, Math.cos((lat * Math.PI) / 180))
  const n = 2 ** z
  // x is left unclamped so a view on the antimeridian can include both x=0 and x=n-1.
  const x0 = Math.floor(lonToTileX(lon - dLon, z))
  const x1 = Math.floor(lonToTileX(lon + dLon, z))
  let y0 = Math.floor(latToTileY(lat + dLat, z))
  let y1 = Math.floor(latToTileY(lat - dLat, z))
  y0 = Math.max(0, y0)
  y1 = Math.min(n - 1, y1)
  return { x0, x1, y0, y1 }
}

export function wrapTileX(x: number, z: number): number {
  const n = 2 ** z
  return ((x % n) + n) % n
}

/** How many tiles the footprint would be. Does not allocate them. */
export function tileFootprintCount(lat: number, lon: number, rangeKm: number, z: number): number {
  const box = tileWindow(lat, lon, rangeKm, z)
  return (box.x1 - box.x0 + 1) * (box.y1 - box.y0 + 1)
}

function tilesInWindow(z: number, box: TileWindow): TileId[] {
  const out: TileId[] = []
  for (let x = box.x0; x <= box.x1; x++) {
    const wx = wrapTileX(x, z)
    for (let y = box.y0; y <= box.y1; y++) {
      if (out.some((tile) => tile.x === wx && tile.y === y)) continue
      out.push({ z, x: wx, y })
    }
  }
  return out
}

/** A few tiles around the camera. Never walks the whole footprint. */
function centerTiles(lat: number, lon: number, z: number, maxTiles: number): TileId[] {
  const n = 2 ** z
  const cx = wrapTileX(Math.floor(lonToTileX(lon, z)), z)
  const cy = Math.min(n - 1, Math.max(0, Math.floor(latToTileY(lat, z))))
  const side = Math.max(1, Math.ceil(Math.sqrt(maxTiles)))
  const out: TileId[] = []
  for (let dy = -side; dy <= side; dy++) {
    for (let dx = -side; dx <= side; dx++) {
      const x = wrapTileX(cx + dx, z)
      const y = Math.min(n - 1, Math.max(0, cy + dy))
      if (out.some((tile) => tile.x === x && tile.y === y)) continue
      out.push({ z, x, y })
      if (out.length >= maxTiles) return out
    }
  }
  return out
}

/**
 * Tiles covering the view, at most `maxTiles`.
 * If the ideal zoom would need more, zoom steps OUT (coarser tiles).
 * v2.0.0 stepped IN, which quadrupled the list each level and built
 * hundreds of millions of tile records on the way from orbit to a city.
 */
export function tilesForView(lat: number, lon: number, rangeKm: number, maxTiles = 12): TileId[] {
  if (rangeKm > 1600 || maxTiles < 1) return []
  let z = zoomForRange(rangeKm, lat)
  while (z > 3 && tileFootprintCount(lat, lon, rangeKm, z) > maxTiles) z -= 1
  const count = tileFootprintCount(lat, lon, rangeKm, z)
  if (count > maxTiles || count > 64) return centerTiles(lat, lon, z, maxTiles)
  return tilesInWindow(z, tileWindow(lat, lon, rangeKm, z))
}

/**
 * One mesh vertex of a Web Mercator tile.
 * `t` (row / rows) is 0 at the north edge and 1 at the south edge.
 * Latitude follows the mercator Y of that fraction, not a straight blend of the
 * corner latitudes. Longitude is linear in tile X. `v` is 1 at the north edge
 * so it matches a north-up bitmap whose top row is texture v=1.
 */
export function drapeVertex(z: number, x: number, y: number, row: number, col: number, rows: number): { lat: number; lon: number; u: number; v: number } {
  const t = row / rows
  const u = col / rows
  return {
    lat: tileYToLat(y + t, z),
    lon: tileXToLon(x + u, z),
    u,
    v: 1 - t,
  }
}

/** Geographic point under a tile UV. v=1 is north, the same convention as `drapeVertex`. */
export function imageryPoint(z: number, x: number, y: number, u: number, v: number): { lat: number; lon: number } {
  const t = 1 - v
  return { lat: tileYToLat(y + t, z), lon: tileXToLon(x + u, z) }
}

/** Coarse tiles bend more, so they get more rows. Street tiles stay small. */
export function tileGridRows(z: number): number {
  if (z <= 8) return 16
  if (z <= 12) return 8
  return 4
}
