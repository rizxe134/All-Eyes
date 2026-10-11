/** Hard caps for the city stage. The zoom crash in 2.0.0 was an uncapped tile list, not these budgets. */

/** Keep these thresholds equal to electron/guard.mjs. The main process cannot import this file. */
export const SHED_HEAP_BYTES = 420 * 1024 * 1024
export const RELOAD_HEAP_BYTES = 900 * 1024 * 1024
const SHED_HEAP_RATIO = 0.62
const RELOAD_HEAP_RATIO = 0.82
export const SHED_RSS_KB = 1_200_000
export const RELOAD_RSS_KB = 2_000_000
const MAX_RECOVERS = 3
const RECOVER_WINDOW_MS = 120_000

/** `used` and `limit` are JS heap bytes. Missing numbers stay 'ok'. */
export function heapAction(used: number, limit: number): 'ok' | 'shed' | 'reload' {
  if (!(used > 0) || !(limit > 0)) return 'ok'
  if (used >= RELOAD_HEAP_BYTES || used / limit >= RELOAD_HEAP_RATIO) return 'reload'
  if (used >= SHED_HEAP_BYTES || used / limit >= SHED_HEAP_RATIO) return 'shed'
  return 'ok'
}

/** `workingSetKb` is Electron ProcessMetric.memory.workingSetSize. */
export function rendererAction(workingSetKb: number): 'ok' | 'shed' | 'reload' {
  if (!(workingSetKb > 0)) return 'ok'
  if (workingSetKb >= RELOAD_RSS_KB) return 'reload'
  if (workingSetKb >= SHED_RSS_KB) return 'shed'
  return 'ok'
}

/** At most three reloads inside two minutes, so a crash loop stops. */
export function allowRecover(stamps: readonly number[], now: number): { recent: number[]; ok: boolean } {
  const recent = stamps.filter((stamp) => now - stamp < RECOVER_WINDOW_MS)
  return { recent, ok: recent.length < MAX_RECOVERS }
}

export const MAX_TILES = 12
export const MAX_TILES_LOW = 6
export const MAX_TILE_FETCHES = 4
export const MAX_TILE_QUEUE = 24
export const MAX_RESIDENT_TEXTURES = 36
export const MAX_VEHICLES = 480
export const MAX_ROADS = 220
export const MAX_RAILS = 80
export const MAX_BUILDINGS = 220
export const MAX_POIS = 40
export const MAX_OVERPASS_ELEMENTS = 2500
export const OSM_DEBOUNCE_MS = 450

export interface Stamp {
  key: string
  at: number
}

/** Oldest unprotected keys, until the resident count is within `max`. */
export function keysToEvict(entries: readonly Stamp[], protect: ReadonlySet<string>, max: number): string[] {
  if (entries.length <= max) return []
  const ordered = [...entries].sort((a, b) => a.at - b.at)
  const drop: string[] = []
  let size = entries.length
  for (const entry of ordered) {
    if (size <= max) break
    if (protect.has(entry.key)) continue
    drop.push(entry.key)
    size -= 1
  }
  return drop
}

/** True when the camera moved enough to cancel an in-flight city query. */
export function viewMoved(
  prev: { lat: number; lon: number; range: number },
  next: { lat: number; lon: number; range: number },
): boolean {
  const dLat = (next.lat - prev.lat) * 111
  const dLon = (next.lon - prev.lon) * 111 * Math.max(0.2, Math.cos((next.lat * Math.PI) / 180))
  if (Math.hypot(dLat, dLon) >= 0.05) return true
  const span = Math.max(next.range, 0.2)
  return Math.abs(next.range - prev.range) / span > 0.08
}

/** One-shot listener slot. A second arm returns false and does not replace the first. */
export function createArmFlag(): { arm: () => boolean; disarm: () => void } {
  let armed = false
  return {
    arm() {
      if (armed) return false
      armed = true
      return true
    },
    disarm() {
      armed = false
    },
  }
}
