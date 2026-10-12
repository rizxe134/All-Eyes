/** Parsers for keyless city feeds and the optional TomTom / HERE flow point. */

export interface PlaceHit {
  lat: number
  lon: number
  label: string
  population: string | null
  /** Nominatim addresstype or type, when the feed sent one. */
  kind: string | null
  /** Nominatim class, when the feed sent one. */
  klass: string | null
}

export interface MeteoNow {
  tempC: number | null
  code: number | null
  windKmh: number | null
  timezone: string
  offsetSec: number
  daily: { date: string; code: number | null; maxC: number | null; minC: number | null }[]
}

export interface AirNow {
  aqi: number | null
  pm25: number | null
}

function num(value: unknown): number | null {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

export function parseNominatim(payload: unknown): PlaceHit | null {
  const all = parseNominatimAll(payload)
  return all[0] ?? null
}

export function parseNominatimAll(payload: unknown): PlaceHit[] {
  const rows = Array.isArray(payload) ? payload : payload && typeof payload === 'object' ? [payload] : []
  const out: PlaceHit[] = []
  for (const raw of rows) {
    if (!raw || typeof raw !== 'object') continue
    const row = raw as {
      lat?: unknown
      lon?: unknown
      display_name?: unknown
      name?: unknown
      addresstype?: unknown
      class?: unknown
      type?: unknown
      address?: { city?: string; town?: string; village?: string; state?: string }
      extratags?: { population?: unknown }
    }
    const lat = num(row.lat)
    const lon = num(row.lon)
    if (lat == null || lon == null) continue
    const place = row.address?.city || row.address?.town || row.address?.village
    const label = String(row.display_name || row.name || place || `${lat.toFixed(2)}, ${lon.toFixed(2)}`)
    const population = row.extratags?.population != null ? String(row.extratags.population) : null
    const kind = String(row.addresstype || row.type || '').trim().toLowerCase() || null
    const klass = String(row.class || '').trim().toLowerCase() || null
    out.push({ lat, lon, label, population, kind, klass })
  }
  return out
}

const WX: Record<number, string> = {
  0: 'CLEAR',
  1: 'MAINLY CLEAR',
  2: 'PARTLY CLOUDY',
  3: 'OVERCAST',
  45: 'FOG',
  48: 'FOG',
  51: 'DRIZZLE',
  53: 'DRIZZLE',
  55: 'DRIZZLE',
  61: 'RAIN',
  63: 'RAIN',
  65: 'RAIN',
  71: 'SNOW',
  73: 'SNOW',
  75: 'SNOW',
  80: 'SHOWERS',
  81: 'SHOWERS',
  82: 'SHOWERS',
  95: 'THUNDER',
  96: 'THUNDER',
  99: 'THUNDER',
}

export function weatherWord(code: number | null): string {
  if (code == null) return 'NOT AVAILABLE'
  return WX[code] ?? `CODE ${code}`
}

export function parseMeteo(payload: unknown): MeteoNow | null {
  if (!payload || typeof payload !== 'object') return null
  const row = payload as {
    timezone?: unknown
    utc_offset_seconds?: unknown
    current?: { temperature_2m?: unknown; weather_code?: unknown; wind_speed_10m?: unknown }
    daily?: {
      time?: unknown[]
      weather_code?: unknown[]
      temperature_2m_max?: unknown[]
      temperature_2m_min?: unknown[]
    }
  }
  if (!row.current && !row.daily) return null
  const daily = []
  const times = Array.isArray(row.daily?.time) ? row.daily.time : []
  for (let i = 0; i < times.length && i < 4; i++) {
    daily.push({
      date: String(times[i] ?? ''),
      code: num(row.daily?.weather_code?.[i]),
      maxC: num(row.daily?.temperature_2m_max?.[i]),
      minC: num(row.daily?.temperature_2m_min?.[i]),
    })
  }
  return {
    tempC: num(row.current?.temperature_2m),
    code: num(row.current?.weather_code),
    windKmh: num(row.current?.wind_speed_10m),
    timezone: String(row.timezone || 'UTC'),
    offsetSec: num(row.utc_offset_seconds) ?? 0,
    daily,
  }
}

export function localClock(unixMs: number, offsetSec: number): string {
  const shifted = new Date(unixMs + offsetSec * 1000)
  const hh = String(shifted.getUTCHours()).padStart(2, '0')
  const mm = String(shifted.getUTCMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

export function parseAir(payload: unknown): AirNow | null {
  if (!payload || typeof payload !== 'object') return null
  const current = (payload as { current?: { us_aqi?: unknown; pm2_5?: unknown } }).current
  if (!current) return null
  return { aqi: num(current.us_aqi), pm25: num(current.pm2_5) }
}

/** currentSpeed / freeFlowSpeed, 0..1. Null when the body is not a flow segment. */
export function parseTomTomFlow(payload: unknown): number | null {
  if (!payload || typeof payload !== 'object') return null
  const row = (payload as { flowSegmentData?: { currentSpeed?: unknown; freeFlowSpeed?: unknown } }).flowSegmentData
  if (!row) return null
  const current = num(row.currentSpeed)
  const free = num(row.freeFlowSpeed)
  if (current == null || free == null || free <= 0) return null
  return Math.max(0, Math.min(1, current / free))
}

/** HERE flow: jamFactor 0..10, or a nested speed / freeFlow pair. */
export function parseHereFlow(payload: unknown): number | null {
  const seen = new Set<unknown>()
  const walk = (value: unknown): number | null => {
    if (!value || typeof value !== 'object' || seen.has(value)) return null
    seen.add(value)
    const row = value as Record<string, unknown>
    if (typeof row.jamFactor === 'number' && Number.isFinite(row.jamFactor)) {
      return Math.max(0, Math.min(1, 1 - row.jamFactor / 10))
    }
    const speed = num(row.speed ?? row.speedUncapped)
    const free = num(row.freeFlow ?? row.freeFlowSpeed)
    if (speed != null && free != null && free > 0) return Math.max(0, Math.min(1, speed / free))
    for (const child of Object.values(row)) {
      const hit = walk(child)
      if (hit != null) return hit
    }
    return null
  }
  return walk(payload)
}

export interface TransitFix {
  id: string
  label: string
  lat: number
  lon: number
  heading: number
  detail: string
  agency: string
}

export function parseFiTrains(payload: unknown): TransitFix[] {
  if (!Array.isArray(payload)) return []
  const out: TransitFix[] = []
  for (const raw of payload) {
    if (!raw || typeof raw !== 'object') continue
    const row = raw as {
      trainNumber?: unknown
      speed?: unknown
      timestamp?: unknown
      location?: { coordinates?: unknown[] }
    }
    const coords = row.location?.coordinates
    if (!Array.isArray(coords)) continue
    const lon = num(coords[0])
    const lat = num(coords[1])
    if (lat == null || lon == null) continue
    const number = String(row.trainNumber ?? '')
    if (!number) continue
    const speed = num(row.speed)
    out.push({
      id: `transit:fi:${number}`,
      label: `FI ${number}`,
      lat,
      lon,
      heading: 0,
      agency: 'DIGITRAFFIC',
      detail: `TRAIN ${number}\nDIGITRAFFIC LIVE\nSPD ${speed == null ? 'NOT AVAILABLE' : `${Math.round(speed)} KM/H`}\n${String(row.timestamp ?? '')}`,
    })
  }
  return out
}

export function parseMbta(payload: unknown): TransitFix[] {
  if (!payload || typeof payload !== 'object') return []
  const data = (payload as { data?: unknown }).data
  if (!Array.isArray(data)) return []
  const out: TransitFix[] = []
  for (const raw of data) {
    if (!raw || typeof raw !== 'object') continue
    const row = raw as {
      id?: unknown
      attributes?: {
        latitude?: unknown
        longitude?: unknown
        bearing?: unknown
        label?: unknown
        current_status?: unknown
        updated_at?: unknown
        speed?: unknown
      }
    }
    const lat = num(row.attributes?.latitude)
    const lon = num(row.attributes?.longitude)
    if (lat == null || lon == null) continue
    const id = String(row.id ?? '')
    if (!id) continue
    const label = String(row.attributes?.label || id)
    out.push({
      id: `transit:mbta:${id}`,
      label: `MBTA ${label}`,
      lat,
      lon,
      heading: num(row.attributes?.bearing) ?? 0,
      agency: 'MBTA',
      detail: `MBTA ${label}\nLIVE\n${String(row.attributes?.current_status || 'EN ROUTE')}\n${String(row.attributes?.updated_at || '')}`,
    })
  }
  return out
}
