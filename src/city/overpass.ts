/** Overpass query text and parsers. Roads, rails, extruded footprints, and a few POIs. */

import { cityBand } from './mercator'

export interface LatLon {
  lat: number
  lon: number
}

export interface CityRoad {
  id: string
  cls: string
  points: LatLon[]
}

export interface CityBuilding {
  id: string
  heightM: number
  points: LatLon[]
}

export interface CityPoi {
  id: string
  name: string
  kind: string
  lat: number
  lon: number
}

export interface CityVectors {
  roads: CityRoad[]
  rails: CityRoad[]
  buildings: CityBuilding[]
  pois: CityPoi[]
}

function bbox(lat: number, lon: number, halfKm: number): string {
  const dLat = halfKm / 111
  const dLon = dLat / Math.max(0.2, Math.cos((lat * Math.PI) / 180))
  const south = Math.max(-85, lat - dLat)
  const north = Math.min(85, lat + dLat)
  const west = lon - dLon
  const east = lon + dLon
  return `${south.toFixed(5)},${west.toFixed(5)},${north.toFixed(5)},${east.toFixed(5)}`
}

/** Null above city scale. Buildings only once the view is inside a few kilometres. */
export function cityQuery(lat: number, lon: number, rangeKm: number): string | null {
  const band = cityBand(rangeKm)
  if (band === 'world') return null
  const roadKm = band === 'street' ? 0.85 : band === 'city' ? 2.1 : 4.8
  const box = bbox(lat, lon, roadKm)
  const roads = `way["highway"~"^(motorway|motorway_link|trunk|primary|secondary|tertiary|residential|unclassified)$"](${box});`
  const rails = `way["railway"~"^(rail|light_rail|subway|tram)$"](${box});`
  let buildings = ''
  let pois = ''
  if (band === 'city' || band === 'street') {
    const built = bbox(lat, lon, band === 'street' ? 0.5 : 1.05)
    buildings = `way["building"](${built});`
    const places = bbox(lat, lon, band === 'street' ? 1.4 : 3.2)
    pois = `node["amenity"~"^(hospital|university|bus_station|ferry_terminal)$"](${places});node["railway"="station"](${places});node["aeroway"="aerodrome"](${places});node["tourism"~"^(attraction|museum)$"](${places});`
  } else {
    const places = bbox(lat, lon, 8)
    pois = `node["aeroway"="aerodrome"](${places});node["railway"="station"](${places});`
  }
  return `[out:json][timeout:18];(${roads}${rails}${buildings}${pois});out geom;`
}

export function buildingHeightM(tags: Record<string, string> | undefined): number {
  if (!tags) return 9
  const raw = tags.height || tags['building:height'] || ''
  const meters = Number(String(raw).replace(/m$/i, '').trim())
  if (Number.isFinite(meters) && meters > 0) return Math.min(420, Math.max(3, meters))
  const levels = Number(tags['building:levels'])
  if (Number.isFinite(levels) && levels > 0) return Math.min(420, Math.max(3, levels * 3.2))
  return 9
}

function asTags(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (raw == null) continue
    out[key] = String(raw)
  }
  return out
}

function ringOf(el: { geometry?: { lat?: number; lon?: number }[] }): LatLon[] {
  const pts: LatLon[] = []
  for (const node of el.geometry ?? []) {
    const lat = Number(node.lat)
    const lon = Number(node.lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
    const prev = pts[pts.length - 1]
    if (prev && Math.abs(prev.lat - lat) < 1e-7 && Math.abs(prev.lon - lon) < 1e-7) continue
    pts.push({ lat, lon })
  }
  if (pts.length > 48) {
    const step = Math.ceil(pts.length / 48)
    const slim = pts.filter((_, index) => index % step === 0)
    const last = pts[pts.length - 1]
    if (slim[slim.length - 1] !== last) slim.push(last)
    return slim
  }
  return pts
}

export function parseOverpass(payload: unknown): CityVectors {
  const empty: CityVectors = { roads: [], rails: [], buildings: [], pois: [] }
  if (!payload || typeof payload !== 'object') return empty
  const elements = (payload as { elements?: unknown }).elements
  if (!Array.isArray(elements)) return empty
  for (const raw of elements) {
    if (!raw || typeof raw !== 'object') continue
    const el = raw as {
      type?: string
      id?: number
      lat?: number
      lon?: number
      tags?: unknown
      geometry?: { lat?: number; lon?: number }[]
    }
    const tags = asTags(el.tags)
    const id = String(el.id ?? '')
    if (!id) continue
    if (el.type === 'way' && tags.highway) {
      const points = ringOf(el)
      if (points.length >= 2 && empty.roads.length < 220) empty.roads.push({ id: `road:${id}`, cls: tags.highway, points })
      continue
    }
    if (el.type === 'way' && tags.railway) {
      const points = ringOf(el)
      if (points.length >= 2 && empty.rails.length < 80) empty.rails.push({ id: `rail:${id}`, cls: tags.railway, points })
      continue
    }
    if (el.type === 'way' && tags.building) {
      const points = ringOf(el)
      if (points.length >= 3 && empty.buildings.length < 220) {
        empty.buildings.push({ id: `bldg:${id}`, heightM: buildingHeightM(tags), points })
      }
      continue
    }
    if (el.type === 'node') {
      const lat = Number(el.lat)
      const lon = Number(el.lon)
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
      const kind = tags.aeroway || tags.railway || tags.amenity || tags.tourism || 'place'
      const name = tags.name || tags.ref || kind.toUpperCase()
      if (empty.pois.length < 40) empty.pois.push({ id: `poi:${id}`, name, kind, lat, lon })
    }
  }
  return empty
}
