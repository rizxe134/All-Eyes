export interface EventFix {
  id: string
  title: string
  category: string
  lat: number
  lon: number
  time: number
}

export interface FireFix {
  lat: number
  lon: number
  frp: number
  when: string
}

function num(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(n) ? n : null
}

export function parseEonet(payload: unknown): EventFix[] {
  if (!payload || typeof payload !== 'object') return []
  const events = (payload as { events?: unknown }).events
  if (!Array.isArray(events)) return []
  const out: EventFix[] = []
  for (const event of events) {
    if (!event || typeof event !== 'object') continue
    const row = event as {
      id?: unknown
      title?: unknown
      categories?: { id?: string; title?: string }[]
      geometry?: { date?: string; type?: string; coordinates?: unknown }[]
    }
    const geometry = Array.isArray(row.geometry) ? row.geometry : []
    const last = [...geometry].reverse().find((item) => item?.type === 'Point' && Array.isArray(item.coordinates))
    if (!last || !Array.isArray(last.coordinates)) continue
    const lon = num(last.coordinates[0])
    const lat = num(last.coordinates[1])
    if (lat == null || lon == null) continue
    const category = row.categories?.[0]?.title || row.categories?.[0]?.id || 'EVENT'
    out.push({
      id: String(row.id ?? `${lat},${lon}`),
      title: String(row.title ?? category),
      category,
      lat,
      lon,
      time: Date.parse(last.date ?? '') || 0,
    })
  }
  return out
}

export function parseFirms(csv: string): FireFix[] {
  const lines = csv.split(/\r?\n/).filter((line) => line.trim() && !line.startsWith('latitude'))
  const out: FireFix[] = []
  for (const line of lines) {
    const cells = line.split(',')
    const lat = num(cells[0])
    const lon = num(cells[1])
    if (lat == null || lon == null) continue
    const frp = num(cells[12]) ?? num(cells[2]) ?? 0
    out.push({
      lat,
      lon,
      frp,
      when: `${cells[5] ?? ''} ${cells[6] ?? ''}`.trim(),
    })
  }
  out.sort((a, b) => b.frp - a.frp)
  return out.slice(0, 1500)
}
