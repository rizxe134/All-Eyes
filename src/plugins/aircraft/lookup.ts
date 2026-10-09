export interface AirMeta {
  type: string
  typeName: string
  registration: string
  operator: string
  origin: string
  destination: string
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
  if (!type && !typeName && !registration && !operator) return null
  return { type, typeName, registration, operator, origin, destination }
}
