/** Turn keyless geocoder bodies into places. No network. */

import { parseNominatimAll } from '../city/feeds'
import { rangeForScale, scaleFromTags, type PlaceScale } from './zoom'

/** How close the point is to the typed house. Census ranges are interpolated, never rooftops. */
export type MatchQuality = 'EXACT' | 'INTERPOLATED' | 'STREET ONLY' | 'CITY ONLY'

export interface AddressParts {
  house: string
  street: string
  city: string
  state: string
  country: string
}

export interface GeoHit {
  lat: number
  lon: number
  label: string
  scale: PlaceScale
  rangeKm: number
  source: string
  quality?: MatchQuality
  parts?: AddressParts
}

function textOf(value: unknown): string {
  return value == null ? '' : String(value).trim()
}

export function formatParts(parts: AddressParts, name = ''): string {
  const streetLine = [parts.house, parts.street].filter(Boolean).join(' ')
  const extra = name && name.toLowerCase() !== streetLine.toLowerCase() && name.toLowerCase() !== `${parts.house} ${parts.street}`.trim().toLowerCase() ? name : ''
  const items = [streetLine, extra, parts.city, parts.state, parts.country]
  const out: string[] = []
  for (const item of items) {
    const clean = item.trim()
    if (!clean) continue
    if (out.some((prev) => prev.toLowerCase() === clean.toLowerCase())) continue
    out.push(clean)
  }
  return out.join(', ')
}

function hit(lat: number, lon: number, label: string, scale: PlaceScale, source: string, extra?: Pick<GeoHit, 'parts' | 'quality'>): GeoHit | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null
  const text = label.trim()
  if (!text) return null
  return { lat, lon, label: text, scale, rangeKm: rangeForScale(scale), source, ...extra }
}

function prettyWord(word: string): string {
  const lower = word.toLowerCase()
  if (/^(nw|ne|sw|se|n|s|e|w)$/.test(lower)) return lower.toUpperCase()
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}

function prettyPlace(value: string): string {
  return value.split(/\s+/).filter(Boolean).map(prettyWord).join(' ')
}

export function nominatimHits(payload: unknown): GeoHit[] {
  const known = parseNominatimAll(payload)
  const rows = Array.isArray(payload) ? payload : payload && typeof payload === 'object' ? [payload] : []
  let cursor = 0
  const out: GeoHit[] = []
  for (const raw of rows) {
    if (!raw || typeof raw !== 'object') continue
    const row = known[cursor]
    if (!row) break
    const lat = Number((raw as { lat?: unknown }).lat)
    const lon = Number((raw as { lon?: unknown }).lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
    cursor += 1
    const address = (raw as { address?: Record<string, unknown> }).address ?? {}
    const parts: AddressParts = {
      house: textOf(address.house_number),
      street: textOf(address.road || address.pedestrian || address.footway),
      city: textOf(address.city || address.town || address.village || address.hamlet),
      state: textOf(address.state),
      country: textOf(address.country),
    }
    const scale = parts.house ? 'street' : scaleFromTags({ kind: row.kind, klass: row.klass })
    const label = parts.house || parts.street ? formatParts(parts) : row.label
    const next = hit(row.lat, row.lon, label || row.label, scale, 'nominatim', { parts })
    if (next) out.push(next)
  }
  return out
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
    const parts: AddressParts = {
      house: textOf(props.housenumber),
      street: textOf(props.street),
      city: textOf(props.city || props.locality),
      state: textOf(props.state),
      country: textOf(props.country) || (textOf(props.countrycode).toUpperCase() === 'US' ? 'United States' : textOf(props.countrycode)),
    }
    let scale = scaleFromTags({ kind: typed || osmValue, osmKey, osmValue, klass: osmKey })
    if (parts.house) scale = 'street'
    const row = hit(lat, lon, formatParts(parts, textOf(props.name)), scale, 'photon', { parts })
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

/** Census onelineaddress. Coordinates are interpolated along the address range. */
export function parseCensus(payload: unknown): GeoHit[] {
  if (!payload || typeof payload !== 'object') return []
  const matches = (payload as { result?: { addressMatches?: unknown } }).result?.addressMatches
  if (!Array.isArray(matches)) return []
  const out: GeoHit[] = []
  for (const raw of matches) {
    if (!raw || typeof raw !== 'object') continue
    const row = raw as {
      matchedAddress?: unknown
      coordinates?: { x?: unknown; y?: unknown }
      addressComponents?: Record<string, unknown>
    }
    const comp = row.addressComponents ?? {}
    const from = textOf(comp.fromAddress)
    const to = textOf(comp.toAddress)
    const house = from || to
    const street = prettyPlace([comp.preDirection, comp.streetName, comp.suffixType, comp.suffixDirection].map(textOf).filter(Boolean).join(' '))
    const parts: AddressParts = {
      house,
      street,
      city: prettyPlace(textOf(comp.city)),
      state: textOf(comp.state).toUpperCase(),
      country: 'United States',
    }
    const label = formatParts(parts) || textOf(row.matchedAddress)
    const next = hit(Number(row.coordinates?.y), Number(row.coordinates?.x), label, 'street', 'census', { parts, quality: 'INTERPOLATED' })
    if (next && from && to) out.push(next)
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
