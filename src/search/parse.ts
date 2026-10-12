/** Turn keyless geocoder bodies into places. No network. */

import { parseNominatimAll } from '../city/feeds'
import { rangeForScale, scaleFromTags, type PlaceScale } from './zoom'

export interface GeoHit {
  lat: number
  lon: number
  label: string
  scale: PlaceScale
  rangeKm: number
  source: string
}

function hit(lat: number, lon: number, label: string, scale: PlaceScale, source: string): GeoHit | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null
  const text = label.trim()
  if (!text) return null
  return { lat, lon, label: text, scale, rangeKm: rangeForScale(scale), source }
}

export function nominatimHits(payload: unknown): GeoHit[] {
  return parseNominatimAll(payload).map((row) => {
    const scale = scaleFromTags({ kind: row.kind, klass: row.klass })
    return hit(row.lat, row.lon, row.label, scale, 'nominatim')
  }).filter((row): row is GeoHit => row != null)
}

/** Photon (komoot) GeoJSON. */
export function parsePhoton(payload: unknown): GeoHit[] {
  if (!payload || typeof payload !== 'object') return []
  const features = (payload as { features?: unknown }).features
  if (!Array.isArray(features)) return []
  const out: GeoHit[] = []
  for (const raw of features) {
    if (!raw || typeof raw !== 'object') continue
    const feature = raw as {
      geometry?: { coordinates?: unknown[] }
      properties?: Record<string, unknown>
    }
    const coords = feature.geometry?.coordinates
    if (!Array.isArray(coords)) continue
    const lon = Number(coords[0])
    const lat = Number(coords[1])
    const props = feature.properties ?? {}
    const osmKey = String(props.osm_key ?? '')
    const osmValue = String(props.osm_value ?? '')
    const typed = String(props.type ?? '')
    let scale = scaleFromTags({ kind: typed || osmValue, osmKey, osmValue, klass: osmKey })
    if (props.housenumber) scale = 'street'
    const parts = [props.housenumber, props.street, props.name, props.city || props.locality, props.state, props.country]
      .map((part) => (part == null ? '' : String(part).trim()))
      .filter(Boolean)
    const row = hit(lat, lon, parts.join(', '), scale, 'photon')
    if (row) out.push(row)
  }
  return out
}

/** Open-Meteo geocoding. Cities and countries, not street addresses. */
export function parseMeteoGeo(payload: unknown): GeoHit[] {
  if (!payload || typeof payload !== 'object') return []
  const results = (payload as { results?: unknown }).results
  if (!Array.isArray(results)) return []
  const out: GeoHit[] = []
  for (const raw of results) {
    if (!raw || typeof raw !== 'object') continue
    const row = raw as { name?: unknown; latitude?: unknown; longitude?: unknown; country?: unknown; admin1?: unknown; feature_code?: unknown }
    const code = String(row.feature_code ?? '').toLowerCase()
    const scale = scaleFromTags({ kind: code })
    const label = [row.name, row.admin1, row.country].map((part) => (part == null ? '' : String(part).trim())).filter(Boolean).join(', ')
    const next = hit(Number(row.latitude), Number(row.longitude), label, scale, 'meteo')
    if (next) out.push(next)
  }
  return out
}

/** MapTiler and Mapbox geocoding GeoJSON. Used only when a key is set. */
export function parseKeyedGeo(payload: unknown, source: string): GeoHit[] {
  if (!payload || typeof payload !== 'object') return []
  const features = (payload as { features?: unknown }).features
  if (!Array.isArray(features)) return []
  const out: GeoHit[] = []
  for (const raw of features) {
    if (!raw || typeof raw !== 'object') continue
    const feature = raw as {
      place_name?: unknown
      text?: unknown
      place_type?: unknown
      center?: unknown[]
      geometry?: { coordinates?: unknown[] }
      properties?: { place_type?: unknown; kind?: unknown }
    }
    const coords = Array.isArray(feature.center) ? feature.center : feature.geometry?.coordinates
    if (!Array.isArray(coords)) continue
    const lon = Number(coords[0])
    const lat = Number(coords[1])
    const types = Array.isArray(feature.place_type) ? feature.place_type : [feature.properties?.place_type ?? feature.properties?.kind]
    const kind = String(types[0] ?? '')
    const scale = scaleFromTags({ kind })
    const label = String(feature.place_name || feature.text || '')
    const next = hit(lat, lon, label, scale, source)
    if (next) out.push(next)
  }
  return out
}

/** A typed house number should lead the list when any result contains it. */
export function preferQuery(query: string, rows: GeoHit[]): GeoHit[] {
  const house = query.match(/\b(\d{1,6}[a-z]?)\b/i)?.[1]?.toLowerCase()
  if (!house) return rows
  return [...rows].sort((a, b) => {
    const as = a.label.toLowerCase().includes(house) ? 1 : 0
    const bs = b.label.toLowerCase().includes(house) ? 1 : 0
    return bs - as
  })
}

export function dedupeHits(rows: GeoHit[]): GeoHit[] {
  const seen = new Set<string>()
  const out: GeoHit[] = []
  for (const row of rows) {
    const key = `${row.lat.toFixed(3)},${row.lon.toFixed(3)}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(row)
  }
  return out.slice(0, 6)
}
