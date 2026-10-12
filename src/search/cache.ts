/** Short memory of geocodes and the last searches. Nominatim stays at 1 request per second in the proxy. */

import type { GeoHit } from './parse'

const GEO_KEY = 'alleyes.geocode.v1'
const RECENT_KEY = 'alleyes.find.v1'
const TTL = 12 * 60 * 60 * 1000
const memory = new Map<string, { at: number; hits: GeoHit[] }>()

function keyOf(query: string): string {
  return query.trim().toLowerCase()
}

export function geoCacheGet(query: string, now = Date.now()): GeoHit[] | null {
  const key = keyOf(query)
  if (!key) return null
  const mem = memory.get(key)
  if (mem && now - mem.at < TTL) return mem.hits
  try {
    if (typeof localStorage === 'undefined') return null
    const raw = localStorage.getItem(GEO_KEY)
    if (!raw) return null
    const bag = JSON.parse(raw) as Record<string, { at: number; hits: GeoHit[] }>
    const row = bag[key]
    if (!row || now - row.at >= TTL || !Array.isArray(row.hits)) return null
    memory.set(key, row)
    return row.hits
  } catch {
    return null
  }
}

export function geoCachePut(query: string, hits: GeoHit[], now = Date.now()): void {
  const key = keyOf(query)
  if (!key || !hits.length) return
  memory.set(key, { at: now, hits })
  try {
    if (typeof localStorage === 'undefined') return
    const raw = localStorage.getItem(GEO_KEY)
    const bag = raw ? JSON.parse(raw) as Record<string, { at: number; hits: GeoHit[] }> : {}
    bag[key] = { at: now, hits }
    const entries = Object.entries(bag).sort((a, b) => b[1].at - a[1].at).slice(0, 80)
    localStorage.setItem(GEO_KEY, JSON.stringify(Object.fromEntries(entries)))
  } catch {
    /* quota */
  }
}

export function readRecent(): string[] {
  try {
    if (typeof localStorage === 'undefined') return []
    const raw = localStorage.getItem(RECENT_KEY)
    if (!raw) return []
    const rows = JSON.parse(raw) as unknown
    if (!Array.isArray(rows)) return []
    return rows.filter((row) => typeof row === 'string' && row.trim()).slice(0, 8)
  } catch {
    return []
  }
}

export function pushRecent(query: string): string[] {
  const text = query.trim()
  if (!text) return readRecent()
  const next = [text, ...readRecent().filter((row) => row.toLowerCase() !== text.toLowerCase())].slice(0, 8)
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch {
    /* quota */
  }
  return next
}
