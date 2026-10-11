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

function tilesCovering(lat: number, lon: number, rangeKm: number, z: number): TileId[] {
  const halfKm = Math.max(0.05, rangeKm) * Math.tan((19 * Math.PI) / 180) * 1.35
  const dLat = halfKm / 111
  const dLon = dLat / Math.max(0.2, Math.cos((lat * Math.PI) / 180))
  const n = 2 ** z
  let x0 = Math.floor(lonToTileX(lon - dLon, z))
  let x1 = Math.floor(lonToTileX(lon + dLon, z))
  let y0 = Math.floor(latToTileY(lat + dLat, z))
  let y1 = Math.floor(latToTileY(lat - dLat, z))
  x0 = Math.max(0, x0)
  x1 = Math.min(n - 1, x1)
  y0 = Math.max(0, y0)
  y1 = Math.min(n - 1, y1)
  const out: TileId[] = []
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) out.push({ z, x, y })
  }
  return out
}

/** Center-covering tiles. Zoom steps in if the footprint would request too many. */
export function tilesForView(lat: number, lon: number, rangeKm: number, maxTiles = 12): TileId[] {
  if (rangeKm > 1600) return []
  let z = zoomForRange(rangeKm, lat)
  let tiles = tilesCovering(lat, lon, rangeKm, z)
  while (tiles.length > maxTiles && z < 18) {
    z += 1
    tiles = tilesCovering(lat, lon, rangeKm, z)
  }
  if (tiles.length <= maxTiles) return tiles
  const cx = lonToTileX(lon, z)
  const cy = latToTileY(lat, z)
  return tiles
    .sort((a, b) => (a.x - cx) ** 2 + (a.y - cy) ** 2 - ((b.x - cx) ** 2 + (b.y - cy) ** 2))
    .slice(0, maxTiles)
}
