/** View limits and the depth clip. Street zoom tightens near; the wide formula is v1.4.1. */

export const MIN_RANGE_KM = 0.22
export const MAX_RANGE_KM = 70000

/**
 * Dynamic near plane. Above ~13 km the v1.4.1 clip is unchanged:
 * max(0.05, camDist - radius * 1.35). Closer than that, 0.05 would sit
 * behind the surface, so near shrinks with altitude.
 */
export function cameraNear(camDist: number, radius: number): number {
  const alt = camDist - radius
  const wide = Math.max(0.05, camDist - radius * 1.35)
  if (alt > 0.2) return wide
  return Math.min(wide, Math.max(0.00004, alt * 0.18))
}

/**
 * Stored CRT stays put. From 140 km down to a city (55 km) the overlay fades
 * to zero, including the RGB phosphor dots and the red/cyan fringe. Closer
 * than that the overlay is off so street labels are not doubled.
 */
export function crtForZoom(base: number, rangeKm: number): number {
  const stored = Math.min(1, Math.max(0, base))
  if (rangeKm >= 140) return stored
  if (rangeKm <= 55) return 0
  return stored * ((rangeKm - 55) / (140 - 55))
}
