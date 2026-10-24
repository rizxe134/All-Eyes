/** Headlines the NEWS layer draws. The news tab is the only writer. */

export interface NewsPoint {
  id: string
  lat: number
  lon: number
  title: string
  detail: string
  source: string
  /** How the location was derived, e.g. GDELT GEO, PLACE IN HEADLINE, OUTLET COUNTRY. */
  locatedBy?: string
  /** Sprite id for the category glyph. */
  glyph?: string
  category?: string
}

let points: NewsPoint[] = []
const listeners = new Set<() => void>()

export function setNewsPoints(next: readonly NewsPoint[]): void {
  points = next.map((point) => ({ ...point }))
  for (const fn of listeners) fn()
}

export function newsPoints(): readonly NewsPoint[] {
  return points
}

export function onNewsPoints(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function resetNewsPoints(): void {
  points = []
  listeners.clear()
}
