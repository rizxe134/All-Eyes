export interface StormFix {
  id: string
  name: string
  classification: string
  intensity: string
  lat: number
  lon: number
  movement: string
}

function num(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(n) ? n : null
}

export function parseStorms(payload: unknown): StormFix[] {
  if (!payload || typeof payload !== 'object') return []
  const rows = (payload as { activeStorms?: unknown }).activeStorms
  if (!Array.isArray(rows)) return []
  const out: StormFix[] = []
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    const storm = row as Record<string, unknown>
    const lat = num(storm.latitudeNumeric)
    const lon = num(storm.longitudeNumeric)
    if (lat == null || lon == null) continue
    out.push({
      id: String(storm.id ?? `${lat},${lon}`),
      name: String(storm.name ?? 'STORM'),
      classification: String(storm.classification ?? ''),
      intensity: String(storm.intensity ?? ''),
      lat,
      lon,
      movement: `${storm.movementDir ?? '--'}° ${storm.movementSpeed ?? '--'}KT`,
    })
  }
  return out
}
