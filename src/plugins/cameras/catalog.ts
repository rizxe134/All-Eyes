import { distanceKm } from '../../core/geo'
import { dedupeCams } from './feed'
import type { TrafficCam } from './parse'

const bySource = new Map<string, TrafficCam[]>()
let merged: TrafficCam[] = []
let byId = new Map<string, TrafficCam>()

function rebuild() {
  const flat: TrafficCam[] = []
  for (const list of bySource.values()) flat.push(...list)
  merged = dedupeCams(flat)
  byId = new Map(merged.map((cam) => [cam.id, cam]))
}

export function resetCatalog(): void {
  bySource.clear()
  rebuild()
}

export function setSourceCams(source: string, cams: readonly TrafficCam[]): void {
  bySource.set(source, [...cams])
  rebuild()
}

export function allCams(): readonly TrafficCam[] {
  return merged
}

export function camById(id: string): TrafficCam | null {
  return byId.get(id) ?? null
}

export function searchCams(query: string, limit = 8): TrafficCam[] {
  const text = query.trim().toUpperCase()
  if (text.length < 2) return []
  const hits: TrafficCam[] = []
  for (const cam of merged) {
    if (!cam.online) continue
    if (cam.name.toUpperCase().includes(text) || cam.road.toUpperCase().includes(text)) hits.push(cam)
    if (hits.length >= limit) break
  }
  return hits
}

export function camsNear(lat: number, lon: number, radiusKm: number, limit = 8): TrafficCam[] {
  const scored: { cam: TrafficCam; distance: number }[] = []
  for (const cam of merged) {
    if (!cam.online) continue
    const distance = distanceKm(lat, lon, cam.lat, cam.lon)
    if (distance <= radiusKm) scored.push({ cam, distance })
  }
  scored.sort((a, b) => a.distance - b.distance)
  return scored.slice(0, limit).map((row) => row.cam)
}

export interface SourceCount {
  total: number
  hls: number
  mp4: number
  mjpeg: number
  snapshot: number
  offline: number
  disabled: number
}

function emptyCount(): SourceCount {
  return { total: 0, hls: 0, mp4: 0, mjpeg: 0, snapshot: 0, offline: 0, disabled: 0 }
}

export function sourceCounts(): Record<string, SourceCount> {
  const out: Record<string, SourceCount> = {}
  for (const [source, list] of bySource) {
    const count = emptyCount()
    for (const cam of list) {
      count.total += 1
      count[cam.mode] += 1
      if (!cam.online) count.disabled += 1
    }
    out[source] = count
  }
  return out
}

export function installCamDebug(): void {
  if (!import.meta.env.DEV) return
  const host = globalThis as typeof globalThis & {
    __alleyesCams?: () => { counts: Record<string, SourceCount>; merged: number }
  }
  host.__alleyesCams = () => ({ counts: sourceCounts(), merged: merged.length })
}
