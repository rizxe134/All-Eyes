import { distanceKm } from '../core/geo'
import type { CamMode, TrafficCam } from '../plugins/cameras/parse'

export type GridSize = 1 | 4 | 9
export type FeedFilter = 'all' | 'live' | 'clip' | 'snapshot'

export interface CamSource {
  id: string
  label: string
  region: string
}

export const CAM_SOURCES: readonly CamSource[] = [
  { id: 'tfl', label: 'London', region: 'UK' },
  { id: 'caltrans', label: 'Caltrans', region: 'US West' },
  { id: 'az', label: 'Arizona', region: 'US West' },
  { id: 'ut', label: 'Utah', region: 'US West' },
  { id: 'wsdot', label: 'Washington', region: 'US West' },
  { id: 'nyc', label: 'New York City', region: 'US East' },
  { id: 'ga', label: 'Georgia', region: 'US East' },
  { id: 'fl', label: 'Florida', region: 'US East' },
  { id: 'pa', label: 'Pennsylvania', region: 'US East' },
  { id: 'ne', label: 'New England', region: 'US East' },
  { id: 'wi', label: 'Wisconsin', region: 'US Midwest' },
  { id: 'ohgo', label: 'Ohio', region: 'US Midwest' },
  { id: 'on', label: 'Ontario', region: 'Canada' },
  { id: 'fi', label: 'Finland', region: 'Europe' },
  { id: 'windy', label: 'Windy', region: 'Other' },
]

export const CAM_REGIONS = ['All', 'UK', 'US West', 'US East', 'US Midwest', 'Canada', 'Europe', 'Other'] as const

export function regionOf(source: string): string {
  return CAM_SOURCES.find((row) => row.id === source)?.region ?? 'Other'
}

export function sourceLabel(source: string): string {
  return CAM_SOURCES.find((row) => row.id === source)?.label ?? source.toUpperCase()
}

export function feedBucket(mode: CamMode): FeedFilter | 'other' {
  if (mode === 'hls' || mode === 'mjpeg') return 'live'
  if (mode === 'mp4') return 'clip'
  if (mode === 'snapshot') return 'snapshot'
  return 'other'
}

export interface CamFilter {
  text?: string
  source?: string
  region?: string
  mode?: FeedFilter
  near?: { lat: number; lon: number; radiusKm: number } | null
}

export function filterCams(cams: readonly TrafficCam[], opts: CamFilter = {}): TrafficCam[] {
  const text = (opts.text || '').trim().toUpperCase()
  const mode = opts.mode && opts.mode !== 'all' ? opts.mode : ''
  const scored: { cam: TrafficCam; distance: number }[] = []
  for (const cam of cams) {
    if (!cam.online) continue
    const bucket = feedBucket(cam.mode)
    if (bucket === 'other') continue
    if (mode && bucket !== mode) continue
    if (opts.source && cam.source !== opts.source) continue
    if (opts.region && opts.region !== 'All' && regionOf(cam.source) !== opts.region) continue
    if (text.length >= 2) {
      const hay = `${cam.name} ${cam.road} ${cam.agency} ${cam.direction} ${cam.attribution}`.toUpperCase()
      if (!hay.includes(text)) continue
    }
    const distance = opts.near ? distanceKm(opts.near.lat, opts.near.lon, cam.lat, cam.lon) : 0
    if (opts.near && distance > opts.near.radiusKm) continue
    scored.push({ cam, distance })
  }
  if (opts.near) scored.sort((a, b) => a.distance - b.distance)
  return scored.map((row) => row.cam)
}

/**
 * The selected camera is streamed by the full viewer.
 * Other visible live or clip tiles stream, up to `cap`. Grid 1 streams none here.
 */
export function streamingIds(
  rows: readonly { id: string; mode: CamMode }[],
  selectedId: string | null,
  grid: GridSize,
  cap = 3,
): string[] {
  if (grid === 1) return []
  const out: string[] = []
  for (const row of rows) {
    if (row.id === selectedId) continue
    if (feedBucket(row.mode) !== 'live' && feedBucket(row.mode) !== 'clip') continue
    out.push(row.id)
    if (out.length >= cap) break
  }
  return out
}

export function tileCount(grid: GridSize): number {
  return grid
}
