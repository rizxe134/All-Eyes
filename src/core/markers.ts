/** Screen size and declutter for globe markers. Pure so tests can lock the floor. */

export interface DeclutterItem {
  id: string
  lat: number
  lon: number
  brightness: number
}

/**
 * Degrees per cell. Zero means show every contact.
 * The cell is about one marker-width of ground, so thinning only stacks dots that
 * already overlap on screen. An airport view is never thinned.
 */
export function declutterCellDeg(rangeKm: number): number {
  if (!(rangeKm > 700)) return 0
  const kmPerPx = rangeKm / 1300
  const overlapKm = 8 * kmPerPx
  const deg = overlapKm / 111
  return Math.min(1.15, Math.max(0.05, deg))
}

/**
 * Keep the brightest contact in each cell. A hovered or locked id always stays.
 * A non-empty list never comes back empty.
 */
export function declutterMarkers<T extends DeclutterItem>(
  markers: readonly T[],
  cellDeg: number,
  keep: ReadonlySet<string> = new Set(),
): T[] {
  if (markers.length === 0) return []
  if (!(cellDeg > 0) || markers.length <= 12) return markers.slice()
  const picked = new Map<string, T>()
  const extras: T[] = []
  for (const marker of markers) {
    if (keep.has(marker.id)) {
      extras.push(marker)
      continue
    }
    const key = `${Math.floor(marker.lat / cellDeg)}:${Math.floor(marker.lon / cellDeg)}`
    const prev = picked.get(key)
    if (!prev || marker.brightness > prev.brightness) picked.set(key, marker)
  }
  const out = [...extras, ...picked.values()]
  return out.length > 0 ? out : [markers[0]!]
}

/**
 * CSS pixels for one marker. Far dots stay at least 4 px so the CRT mask
 * cannot round them away. Close sprites stay at least 6 px.
 */
export function markerScreenPx(far: boolean, ring: boolean, air: boolean, markerSize: number): number {
  const base = far ? (ring ? 10 : 8) : ring ? 26 : air ? 20 : 11
  const min = far ? (ring ? 5 : 4) : 6
  const scale = Number.isFinite(markerSize) ? markerSize : 0
  const px = base * scale
  if (!Number.isFinite(px) || px <= 0) return min
  return Math.max(px, min)
}
