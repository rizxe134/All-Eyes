export type FeedState = 'OK' | 'RATE-LIMITED' | 'OFFLINE'

export interface FeedSource {
  id: string
  path: string
}

/** Keyless ADS-B readers, first choice first. OpenSky is the last resort in the plugin. */
export const FEED_SOURCES: FeedSource[] = [
  { id: 'AIRPLANES.LIVE', path: '/api/airplanes/point' },
  { id: 'ADSB.LOL', path: '/api/adsb/point' },
  { id: 'ADSB.FI', path: '/api/adsbfi/point' },
]

export interface ViewSample {
  lat: number
  lon: number
  dist: number
}

/** Regional circles around the camera, plus a few busy hubs when the view is the whole globe. */
export function viewSamples(lat: number, lon: number, rangeKm: number): ViewSample[] {
  const dist = Math.round(Math.min(250, Math.max(60, rangeKm / 10)))
  const raw: Array<[number, number]> = [[lat, lon]]
  if (rangeKm > 800) {
    const step = Math.min(12, Math.max(2.5, rangeKm / 1200))
    raw.push([lat + step, lon], [lat - step, lon], [lat, lon + step * 1.4], [lat, lon - step * 1.4])
  }
  if (rangeKm > 3200) {
    raw.push(
      [40.64, -73.78],
      [51.47, -0.46],
      [50.04, 8.56],
      [35.55, 139.78],
      [1.36, 103.99],
      [25.25, 55.36],
    )
  }
  const seen = new Set<string>()
  const out: ViewSample[] = []
  for (const [la, lo] of raw) {
    const latC = Math.max(-80, Math.min(80, la))
    let lonC = lo
    while (lonC > 180) lonC -= 360
    while (lonC < -180) lonC += 360
    const key = `${latC.toFixed(1)}:${lonC.toFixed(1)}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ lat: latC, lon: lonC, dist })
  }
  return out
}

export function pointUrl(source: FeedSource, sample: ViewSample): string {
  return `${source.path}?lat=${sample.lat.toFixed(2)}&lon=${sample.lon.toFixed(2)}&dist=${sample.dist}`
}

export type FeedFailure = 'rate' | 'denied' | 'down'

export function feedFailure(err: unknown): FeedFailure {
  const msg = err instanceof Error ? err.message : String(err)
  if (/\b429\b/.test(msg) || /\b420\b/.test(msg)) return 'rate'
  if (/\b403\b/.test(msg)) return 'denied'
  return 'down'
}

export function backoffMs(kind: FeedFailure): number {
  if (kind === 'rate') return 90_000
  if (kind === 'denied') return 5 * 60_000
  return 30_000
}

export function feedStatusLine(count: number, state: FeedState, source: string): string {
  const name = source || 'NONE'
  return `AIR ${count} · ${state} · ${name}`
}

/** OpenSky box around the view. A wide view asks for the whole globe. */
export function openSkyBox(lat: number, lon: number, rangeKm: number): string {
  const dLat = Math.min(90, Math.max(2, rangeKm / 111))
  const cos = Math.max(0.25, Math.abs(Math.cos((lat * Math.PI) / 180)))
  const dLon = Math.min(180, dLat / cos)
  const lamin = Math.max(-90, lat - dLat).toFixed(2)
  const lamax = Math.min(90, lat + dLat).toFixed(2)
  const lomin = Math.max(-180, lon - dLon).toFixed(2)
  const lomax = Math.min(180, lon + dLon).toFixed(2)
  return `/api/opensky/states?lamin=${lamin}&lomin=${lomin}&lamax=${lamax}&lomax=${lomax}`
}
