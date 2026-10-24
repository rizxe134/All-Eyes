import { distanceKm } from '../../core/geo'
import type { CamMode, TrafficCam } from './parse'

const RANK: Record<CamMode, number> = {
  hls: 4,
  mp4: 3,
  mjpeg: 2,
  snapshot: 1,
  offline: 0,
}

/** Hosts the media proxy will relay. Anything else cannot play in the panel. */
export function proxiedStream(videoUrl: string): boolean {
  try {
    const url = new URL(videoUrl)
    if (url.protocol !== 'https:' || url.username || url.password) return false
    const host = url.hostname
    if (host.endsWith('.dot.ca.gov') || host.endsWith('.dot.wi.gov')) return true
    if (host === 's3-eu-west-1.amazonaws.com' && url.pathname.toLowerCase().includes('jamcam')) return true
    return false
  } catch {
    return false
  }
}

export function feedMode(videoUrl: string, imageUrl: string, authRequired: boolean, videoType = ''): CamMode {
  const video = videoUrl.trim()
  const image = imageUrl.trim()
  if (authRequired || !video) return image ? 'snapshot' : 'offline'
  const kind = `${video} ${videoType}`.toLowerCase()
  let mode: CamMode = image ? 'snapshot' : 'offline'
  if (kind.includes('.m3u8') || kind.includes('mpegurl') || kind.includes('application/x-mpegurl') || kind.includes('hls')) mode = 'hls'
  else if (kind.includes('mjpeg') || kind.includes('.mjpg') || kind.includes('multipart/x-mixed-replace')) mode = 'mjpeg'
  else if (kind.includes('.mp4')) mode = 'mp4'
  if (mode !== 'snapshot' && mode !== 'offline' && !proxiedStream(video)) return image ? 'snapshot' : 'offline'
  return mode
}

export function modeLabel(mode: CamMode, refreshSec: number): string {
  if (mode === 'hls' || mode === 'mjpeg') return 'LIVE'
  if (mode === 'mp4') return 'VIDEO CLIP · refreshes every 60s'
  if (mode === 'snapshot') return `SNAPSHOT · refreshes every ${Math.max(3, Math.round(refreshSec || 30))}s`
  return 'FEED OFFLINE'
}

function nameKey(name: string): string {
  return name.toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim()
}

function richer(next: TrafficCam, prev: TrafficCam): boolean {
  const gap = RANK[next.mode] - RANK[prev.mode]
  if (gap !== 0) return gap > 0
  if (Boolean(next.imageUrl) !== Boolean(prev.imageUrl)) return Boolean(next.imageUrl)
  if (Boolean(next.videoUrl) !== Boolean(prev.videoUrl)) return Boolean(next.videoUrl)
  return false
}

/** Same id keeps the richer feed. Different sources collapse only when the rounded point and name match. */
export function dedupeCams(cams: readonly TrafficCam[]): TrafficCam[] {
  const byId = new Map<string, TrafficCam>()
  for (const cam of cams) {
    const prev = byId.get(cam.id)
    if (!prev || richer(cam, prev)) byId.set(cam.id, cam)
  }
  const byPlace = new Map<string, TrafficCam>()
  for (const cam of byId.values()) {
    const name = nameKey(cam.name)
    const key = name ? `${cam.lat.toFixed(3)}|${cam.lon.toFixed(3)}|${name}` : `id:${cam.id}`
    const prev = byPlace.get(key)
    if (!prev || richer(cam, prev)) byPlace.set(key, cam)
  }
  return [...byPlace.values()]
}

export interface CamMark {
  id: string
  lat: number
  lon: number
  label: string
  detail: string
  scale: number
  cluster: boolean
}

export function marksForView(cams: readonly TrafficCam[], view: { lat: number; lon: number; rangeKm: number }): CamMark[] {
  const reach = view.rangeKm * 0.62
  const near = cams.filter((cam) => distanceKm(view.lat, view.lon, cam.lat, cam.lon) <= Math.max(reach, 30))
  if (view.rangeKm >= 450) {
    const cell = Math.min(12, Math.max(0.2, view.rangeKm / 7000))
    const groups = new Map<string, TrafficCam[]>()
    for (const cam of near) {
      const key = `${Math.round(cam.lat / cell)}:${Math.round(cam.lon / cell)}`
      const list = groups.get(key)
      if (list) list.push(cam)
      else groups.set(key, [cam])
    }
    const cells = [...groups.values()].map((list) => {
      const lat = list.reduce((sum, cam) => sum + cam.lat, 0) / list.length
      const lon = list.reduce((sum, cam) => sum + cam.lon, 0) / list.length
      return { list, lat, lon, distance: distanceKm(view.lat, view.lon, lat, lon) }
    })
    cells.sort((a, b) => a.distance - b.distance)
    return cells.slice(0, 280).map((cell) => ({
      id: `camc:${cell.lat.toFixed(2)}:${cell.lon.toFixed(2)}`,
      lat: cell.lat,
      lon: cell.lon,
      label: cell.list.length === 1 ? cell.list[0]!.name : `${cell.list.length} CAMS`,
      detail: cell.list.length === 1 ? cell.list[0]!.road : 'CLUSTER',
      scale: cell.list.length === 1 ? 1 : 1.45,
      cluster: cell.list.length > 1,
    }))
  }
  const ranked = near
    .map((cam) => ({ cam, distance: distanceKm(view.lat, view.lon, cam.lat, cam.lon) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 420)
  return ranked.map(({ cam }) => ({
    id: cam.id,
    lat: cam.lat,
    lon: cam.lon,
    label: cam.name,
    detail: [cam.road, cam.direction].filter(Boolean).join(' '),
    scale: 1,
    cluster: false,
  }))
}
