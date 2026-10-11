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

/** Stored CRT stays put. Street zoom eases the overlay so imagery stays readable. */
export function crtForZoom(base: number, rangeKm: number): number {
  const stored = Math.min(1, Math.max(0, base))
  if (rangeKm >= 140) return stored
  const t = Math.max(0, rangeKm) / 140
  return stored * (0.12 + 0.88 * t)
}
