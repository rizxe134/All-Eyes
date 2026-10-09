export interface QuakeFix {
  id: string
  mag: number
  place: string
  time: number
  lat: number
  lon: number
  depthKm: number
}

function num(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(n) ? n : null
}

export function parseQuakes(payload: unknown): QuakeFix[] {
  if (!payload || typeof payload !== 'object') return []
  const features = (payload as { features?: unknown }).features
  if (!Array.isArray(features)) return []
  const out: QuakeFix[] = []
  for (const feature of features) {
    if (!feature || typeof feature !== 'object') continue
    const row = feature as {
      id?: unknown
      properties?: { mag?: unknown; place?: unknown; time?: unknown }
      geometry?: { coordinates?: unknown }
    }
    const coords = row.geometry?.coordinates
    if (!Array.isArray(coords)) continue
    const lon = num(coords[0])
    const lat = num(coords[1])
    const depth = num(coords[2]) ?? 0
    const mag = num(row.properties?.mag)
    if (lat == null || lon == null || mag == null) continue
    out.push({
      id: String(row.id ?? `${lat},${lon},${row.properties?.time ?? ''}`),
      mag,
      place: String(row.properties?.place ?? 'UNKNOWN'),
      time: num(row.properties?.time) ?? 0,
      lat,
      lon,
      depthKm: depth,
    })
  }
  return out
}
