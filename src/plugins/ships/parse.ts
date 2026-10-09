export interface ShipFix {
  mmsi: number
  lat: number
  lon: number
  sog: number
  cog: number
  heading: number
  navStat: number
  time: number
}

function num(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(n) ? n : null
}

const NAV: Record<number, string> = {
  0: 'UNDERWAY',
  1: 'ANCHOR',
  2: 'NOT UNDER COMMAND',
  3: 'RESTRICTED',
  4: 'CONSTRAINED',
  5: 'MOORED',
  8: 'SAILING',
  15: 'UNKNOWN',
}

export function navLabel(code: number): string {
  return NAV[code] ?? `NAV ${code}`
}

export function parseAis(payload: unknown): ShipFix[] {
  if (!payload || typeof payload !== 'object') return []
  const features = (payload as { features?: unknown }).features
  if (!Array.isArray(features)) return []
  const out: ShipFix[] = []
  for (const feature of features) {
    if (!feature || typeof feature !== 'object') continue
    const row = feature as {
      mmsi?: unknown
      geometry?: { coordinates?: unknown }
      properties?: Record<string, unknown>
    }
    const coords = row.geometry?.coordinates
    if (!Array.isArray(coords)) continue
    const lon = num(coords[0])
    const lat = num(coords[1])
    const mmsi = num(row.mmsi) ?? num(row.properties?.mmsi)
    if (lat == null || lon == null || mmsi == null) continue
    const heading = num(row.properties?.heading) ?? 511
    const cog = num(row.properties?.cog) ?? 0
    out.push({
      mmsi,
      lat,
      lon,
      sog: num(row.properties?.sog) ?? 0,
      cog,
      heading: heading > 360 ? cog : heading,
      navStat: num(row.properties?.navStat) ?? 15,
      time: num(row.properties?.timestampExternal) ?? 0,
    })
  }
  return out
}
