export interface AirMeta {
  type: string
  typeName: string
  registration: string
  operator: string
  origin: string
  destination: string
  originCity?: string
  destCity?: string
  originLat?: number
  originLon?: number
  destLat?: number
  destLon?: number
  country?: string
  photoUrl?: string
  photoLink?: string
  photoCredit?: string
}

const KEY = 'alleyes.airmeta.v1'

export function readAirCache(): Map<string, AirMeta> {
  const map = new Map<string, AirMeta>()
  try {
    if (typeof localStorage === 'undefined') return map
    const raw = localStorage.getItem(KEY)
    if (!raw) return map
    const parsed = JSON.parse(raw) as Record<string, AirMeta>
    for (const [hex, meta] of Object.entries(parsed)) {
      if (meta && typeof meta === 'object') map.set(hex, meta)
    }
  } catch {
    /* ignore a broken cache */
  }
  return map
}

export function writeAirCache(map: Map<string, AirMeta>): void {
  const obj: Record<string, AirMeta> = {}
  let count = 0
  for (const [hex, meta] of map) {
    obj[hex] = meta
    count += 1
    if (count >= 400) break
  }
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(KEY, JSON.stringify(obj))
  } catch {
    /* quota */
  }
}

export function parseAdsbDb(payload: unknown): AirMeta | null {
  if (!payload || typeof payload !== 'object') return null
  const root = payload as {
    response?: { aircraft?: Record<string, unknown> }
    aircraft?: Record<string, unknown>
  }
  const craft = root.response?.aircraft ?? root.aircraft
  if (!craft || typeof craft !== 'object') return null
  const type = String(craft.icao_type ?? craft.type_code ?? '').trim().toUpperCase()
  const typeName = String(craft.type ?? craft.model ?? craft.aircraft_type ?? '').trim()
  const registration = String(craft.registration ?? '').trim()
  const operator = String(craft.registered_owner ?? craft.operator ?? craft.owner ?? '').trim()
  const origin = String(craft.origin ?? craft.dep ?? '').trim()
  const destination = String(craft.destination ?? craft.arr ?? '').trim()
  const country = String(craft.registered_owner_country_name ?? '').trim()
  const photoUrl = String(craft.url_photo_thumbnail ?? craft.url_photo ?? '').trim()
  const photoLink = String(craft.url_photo ?? '').trim()
  if (!type && !typeName && !registration && !operator && !country) return null
  return {
    type,
    typeName,
    registration,
    operator,
    origin,
    destination,
    country,
    photoUrl,
    photoLink,
    photoCredit: photoUrl ? 'airport-data.com' : '',
  }
}

function num(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : undefined
}

function place(value: unknown): { code: string; city: string; lat?: number; lon?: number } {
  if (!value || typeof value !== 'object') return { code: '', city: '' }
  const row = value as Record<string, unknown>
  const code = String(row.iata_code ?? row.icao_code ?? '').trim().toUpperCase()
  const city = String(row.municipality ?? row.name ?? '').trim()
  return { code, city, lat: num(row.latitude), lon: num(row.longitude) }
}

/** Route block from adsbdb's callsign endpoint. Does not invent airports. */
export function parseAdsbRoute(payload: unknown): Partial<AirMeta> | null {
  if (!payload || typeof payload !== 'object') return null
  const root = payload as { response?: { flightroute?: Record<string, unknown> } }
  const route = root.response?.flightroute
  if (!route) return null
  const origin = place(route.origin)
  const destination = place(route.destination)
  const airline = route.airline && typeof route.airline === 'object'
    ? String((route.airline as { name?: unknown }).name ?? '').trim()
    : ''
  if (!origin.code && !destination.code && !airline) return null
  return {
    type: '',
    typeName: '',
    registration: '',
    operator: airline,
    origin: origin.code,
    destination: destination.code,
    originCity: origin.city,
    destCity: destination.city,
    originLat: origin.lat,
    originLon: origin.lon,
    destLat: destination.lat,
    destLon: destination.lon,
  }
}

export function parseSpotters(payload: unknown): Pick<AirMeta, 'photoUrl' | 'photoLink' | 'photoCredit'> | null {
  if (!payload || typeof payload !== 'object') return null
  const photos = (payload as { photos?: unknown }).photos
  if (!Array.isArray(photos) || !photos[0] || typeof photos[0] !== 'object') return null
  const photo = photos[0] as {
    thumbnail_large?: { src?: string }
    thumbnail?: { src?: string }
    link?: string
    photographer?: string
  }
  const photoUrl = photo.thumbnail_large?.src || photo.thumbnail?.src || ''
  if (!photoUrl) return null
  return {
    photoUrl,
    photoLink: photo.link || photoUrl,
    photoCredit: photo.photographer ? `${photo.photographer} / PlaneSpotters.net` : 'PlaneSpotters.net',
  }
}

export function mergeAirMeta(base: AirMeta | undefined, extra: Partial<AirMeta>): AirMeta {
  const next: AirMeta = {
    type: '',
    typeName: '',
    registration: '',
    operator: '',
    origin: '',
    destination: '',
    ...base,
  }
  for (const [key, value] of Object.entries(extra) as [keyof AirMeta, AirMeta[keyof AirMeta]][]) {
    if (value == null || value === '') continue
    if (key === 'operator' && next.operator) continue
    if ((key === 'photoUrl' || key === 'photoLink' || key === 'photoCredit') && next.photoUrl && extra.photoCredit === 'airport-data.com') continue
    ;(next[key] as AirMeta[keyof AirMeta]) = value
  }
  return next
}
