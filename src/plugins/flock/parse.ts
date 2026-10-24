/** ALPR camera locations from OpenStreetMap / DeFlock. Location only: these cameras have no public feed. */
import { distanceKm } from '../../core/geo'

export const FLOCK_WIKIDATA = 'Q108485435'
export const FLOCK_SOURCE = 'OpenStreetMap / DeFlock (crowdsourced)'
export const FLOCK_FEED = 'NOT AVAILABLE — private ALPR camera, no public feed'

export interface Alpr {
  id: string
  lat: number
  lon: number
  manufacturer: string
  isFlock: boolean
  direction: string
  operator: string
  osmUrl: string
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : ''
}

function validPoint(lat: number, lon: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false
  if (Math.abs(lat) < 1e-6 && Math.abs(lon) < 1e-6) return false
  return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180
}

export function manufacturerOf(tags: Record<string, unknown>): { name: string; isFlock: boolean } {
  const wd = str(tags['manufacturer:wikidata']) || str(tags['brand:wikidata'])
  const name = str(tags.manufacturer) || str(tags.brand)
  const isFlock = wd === FLOCK_WIKIDATA || /flock/i.test(name)
  if (isFlock) return { name: 'Flock Safety', isFlock: true }
  return { name: name || 'Unknown ALPR', isFlock: false }
}

export function osmUrl(type: string, id: number | string): string {
  const kind = type === 'way' || type === 'w' ? 'way' : 'node'
  return `https://www.openstreetmap.org/${kind}/${id}`
}

export function parseOverpassAlpr(body: unknown): Alpr[] {
  const els = body && typeof body === 'object' && Array.isArray((body as { elements?: unknown }).elements) ? (body as { elements: unknown[] }).elements : []
  const out: Alpr[] = []
  for (const raw of els) {
    if (!raw || typeof raw !== 'object') continue
    const el = raw as { type?: string; id?: number; lat?: number; lon?: number; center?: { lat?: number; lon?: number }; tags?: Record<string, unknown> }
    const tags = el.tags ?? {}
    if (str(tags['surveillance:type']).toUpperCase() !== 'ALPR') continue
    const lat = Number(el.lat ?? el.center?.lat)
    const lon = Number(el.lon ?? el.center?.lon)
    if (!validPoint(lat, lon) || el.id == null) continue
    const type = el.type === 'way' ? 'way' : 'node'
    const m = manufacturerOf(tags)
    out.push({
      id: `alpr:${type[0]}${el.id}`,
      lat,
      lon,
      manufacturer: m.name,
      isFlock: m.isFlock,
      direction: str(tags['camera:direction']) || str(tags.direction),
      operator: str(tags.operator),
      osmUrl: osmUrl(type, el.id),
    })
  }
  return out
}

export interface CompactAll {
  brands: string[]
  points: [number, number, number, number, string][]
}

export function fromCompact(body: unknown): Alpr[] {
  const root = (body ?? {}) as Partial<CompactAll>
  const brands = Array.isArray(root.brands) ? root.brands : []
  const pts = Array.isArray(root.points) ? root.points : []
  const out: Alpr[] = []
  for (const p of pts) {
    if (!Array.isArray(p)) continue
    const [lat, lon, b, id, t] = p
    if (!validPoint(lat, lon)) continue
    const m = manufacturerOf({ manufacturer: brands[b] ?? '' })
    out.push({
      id: `alpr:${t === 'w' ? 'w' : 'n'}${id}`,
      lat,
      lon,
      manufacturer: m.name,
      isFlock: m.isFlock,
      direction: '',
      operator: '',
      osmUrl: id ? osmUrl(t, id) : '',
    })
  }
  return out
}

/** Overpass rows carry more tags, so they replace the national rows with the same id. */
export function mergeAlpr(base: ReadonlyMap<string, Alpr>, rows: readonly Alpr[]): Map<string, Alpr> {
  const next = new Map(base)
  for (const row of rows) next.set(row.id, row)
  return next
}

export function cardRows(a: Alpr): { k: string; v: string }[] {
  return [
    { k: 'TYPE', v: 'ALPR (license-plate reader)' },
    { k: 'MAKER', v: a.manufacturer },
    { k: 'FACING', v: a.direction },
    { k: 'OPERATOR', v: a.operator },
    { k: 'OSM', v: a.osmUrl },
    { k: 'FEED', v: FLOCK_FEED },
    { k: 'SOURCE', v: FLOCK_SOURCE },
  ]
}

export interface AlprMark {
  id: string
  lat: number
  lon: number
  label: string
  detail: string
  scale: number
  cluster: boolean
  count: number
  alpr: Alpr | null
}

/** 1° cells (rounded outward) that cover the view, capped so one pan never fans out into many Overpass calls. */
export function tilesForView(view: { lat: number; lon: number; rangeKm: number }, size = 0.5, cap = 6): { s: number; w: number; n: number; e: number; key: string }[] {
  const padLat = Math.min(1.5, (view.rangeKm * 0.62) / 111)
  const padLon = Math.min(1.5, padLat / Math.max(0.2, Math.cos((view.lat * Math.PI) / 180)))
  const s0 = Math.floor((view.lat - padLat) / size) * size
  const w0 = Math.floor((view.lon - padLon) / size) * size
  const out: { s: number; w: number; n: number; e: number; key: string; d: number }[] = []
  for (let s = s0; s < view.lat + padLat; s += size) {
    for (let w = w0; w < view.lon + padLon; w += size) {
      const n = s + size
      const e = w + size
      if (s < -90 || n > 90) continue
      out.push({ s, w, n, e, key: `${s.toFixed(2)},${w.toFixed(2)}`, d: distanceKm(view.lat, view.lon, s + size / 2, w + size / 2) })
    }
  }
  return out.sort((a, b) => a.d - b.d).slice(0, cap).map(({ d: _d, ...t }) => t)
}

export const CLUSTER_RANGE_KM = 120

export function marksForView(list: Iterable<Alpr>, view: { lat: number; lon: number; rangeKm: number }): AlprMark[] {
  const reach = Math.max(view.rangeKm * 0.62, 20)
  const near: Alpr[] = []
  for (const a of list) if (distanceKm(view.lat, view.lon, a.lat, a.lon) <= reach) near.push(a)
  if (view.rangeKm >= CLUSTER_RANGE_KM) {
    const cell = Math.min(12, Math.max(0.05, view.rangeKm / 5000))
    const groups = new Map<string, Alpr[]>()
    for (const a of near) {
      const key = `${Math.round(a.lat / cell)}:${Math.round(a.lon / cell)}`
      const g = groups.get(key)
      if (g) g.push(a)
      else groups.set(key, [a])
    }
    const cells = [...groups.values()].map((g) => {
      const lat = g.reduce((s, a) => s + a.lat, 0) / g.length
      const lon = g.reduce((s, a) => s + a.lon, 0) / g.length
      return { g, lat, lon, d: distanceKm(view.lat, view.lon, lat, lon) }
    })
    cells.sort((a, b) => a.d - b.d)
    return cells.slice(0, 300).map(({ g, lat, lon }) => {
      if (g.length === 1) return single(g[0]!)
      const flock = g.filter((a) => a.isFlock).length
      return {
        id: `alprc:${lat.toFixed(2)}:${lon.toFixed(2)}`,
        lat,
        lon,
        label: `${g.length} ALPR`,
        detail: `CLUSTER · ${flock} FLOCK · ${g.length - flock} OTHER`,
        scale: Math.min(1.9, 1.2 + Math.log10(g.length) * 0.25),
        cluster: true,
        count: g.length,
        alpr: null,
      }
    })
  }
  return near
    .map((a) => ({ a, d: distanceKm(view.lat, view.lon, a.lat, a.lon) }))
    .sort((x, y) => x.d - y.d)
    .slice(0, 600)
    .map(({ a }) => single(a))
}

function single(a: Alpr): AlprMark {
  return {
    id: a.id,
    lat: a.lat,
    lon: a.lon,
    label: `${a.isFlock ? 'FLOCK' : a.manufacturer.toUpperCase()} ALPR`,
    detail: [a.operator, a.direction ? `facing ${a.direction}` : ''].filter(Boolean).join(' · ') || 'location only',
    scale: 1,
    cluster: false,
    count: 1,
    alpr: a,
  }
}
