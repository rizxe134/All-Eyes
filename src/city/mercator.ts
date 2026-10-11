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
  let x0 = Math.floor(lonToTileX(lon - dLon, z))
  let x1 = Math.floor(lonToTileX(lon + dLon, z))
  let y0 = Math.floor(latToTileY(lat + dLat, z))
  let y1 = Math.floor(latToTileY(lat - dLat, z))
  x0 = Math.max(0, x0)
  x1 = Math.min(n - 1, x1)
  y0 = Math.max(0, y0)
  y1 = Math.min(n - 1, y1)
  return { x0, x1, y0, y1 }
}

/** How many tiles the footprint would be. Does not allocate them. */
export function tileFootprintCount(lat: number, lon: number, rangeKm: number, z: number): number {
  const box = tileWindow(lat, lon, rangeKm, z)
  return (box.x1 - box.x0 + 1) * (box.y1 - box.y0 + 1)
}

function tilesInWindow(z: number, box: TileWindow): TileId[] {
  const out: TileId[] = []
  for (let x = box.x0; x <= box.x1; x++) {
    for (let y = box.y0; y <= box.y1; y++) out.push({ z, x, y })
  }
  return out
}

/** A few tiles around the camera. Never walks the whole footprint. */
function centerTiles(lat: number, lon: number, z: number, maxTiles: number): TileId[] {
  const n = 2 ** z
  const cx = Math.min(n - 1, Math.max(0, Math.floor(lonToTileX(lon, z))))
  const cy = Math.min(n - 1, Math.max(0, Math.floor(latToTileY(lat, z))))
  const side = Math.max(1, Math.ceil(Math.sqrt(maxTiles)))
  const out: TileId[] = []
  for (let dy = -side; dy <= side; dy++) {
    for (let dx = -side; dx <= side; dx++) {
      const x = Math.min(n - 1, Math.max(0, cx + dx))
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
