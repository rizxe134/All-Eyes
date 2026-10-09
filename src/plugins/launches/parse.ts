export interface LaunchFix {
  id: string
  name: string
  net: number
  lat: number
  lon: number
  pad: string
  status: string
}

function num(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(n) ? n : null
}

export function parseLaunches(payload: unknown): LaunchFix[] {
  if (!payload || typeof payload !== 'object') return []
  const results = (payload as { results?: unknown }).results
  if (!Array.isArray(results)) return []
  const out: LaunchFix[] = []
  for (const row of results) {
    if (!row || typeof row !== 'object') continue
    const launch = row as {
      id?: unknown
      name?: unknown
      net?: unknown
      status?: { abbrev?: string }
      pad?: { name?: string; latitude?: unknown; longitude?: unknown; location?: { name?: string } }
    }
    const lat = num(launch.pad?.latitude)
    const lon = num(launch.pad?.longitude)
    if (lat == null || lon == null) continue
    out.push({
      id: String(launch.id ?? launch.name ?? `${lat},${lon}`),
      name: String(launch.name ?? 'LAUNCH'),
      net: Date.parse(String(launch.net ?? '')) || 0,
      lat,
      lon,
      pad: launch.pad?.location?.name || launch.pad?.name || 'PAD',
      status: launch.status?.abbrev || '',
    })
  }
  return out
}
