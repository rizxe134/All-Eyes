import type { AirFix } from './parse'

/** Drop a contact in the camera disk only after this long with no fresh hit. */
export const STALE_MS = 90_000

/**
 * Contacts outside the camera disk stay this long, so a world sweep can lap
 * the globe without the far side blinking off, and moving the camera does not
 * throw them away.
 */
export const FAR_STALE_MS = 7 * 60_000

export interface HeldContact {
  fix: AirFix
  updatedAt: number
}

/**
 * Merge a poll into the contacts already on the globe.
 * `incoming === null` or `[]` means the fetch failed or came back empty:
 * previous contacts stay until they are older than `staleMs`.
 */
export function mergeHeld(
  previous: ReadonlyMap<string, HeldContact>,
  incoming: readonly AirFix[] | null,
  now: number,
  staleMs = STALE_MS,
): Map<string, HeldContact> {
  const next = new Map<string, HeldContact>()
  for (const [icao, held] of previous) {
    if (!icao) continue
    if (now - held.updatedAt > staleMs) continue
    next.set(icao, held)
  }
  if (!incoming || incoming.length === 0) return next
  for (const fix of incoming) {
    const icao = fix.icao?.trim().toLowerCase()
    if (!icao) continue
    next.set(icao, { fix: { ...fix, icao }, updatedAt: now })
  }
  return next
}

/** Same merge, with a per-contact age so far traffic outlives the view. */
export function mergeHeldAged(
  previous: ReadonlyMap<string, HeldContact>,
  incoming: readonly AirFix[] | null,
  now: number,
  staleFor: (fix: AirFix) => number,
): Map<string, HeldContact> {
  const next = new Map<string, HeldContact>()
  for (const [icao, held] of previous) {
    if (!icao) continue
    const limit = staleFor(held.fix)
    if (!Number.isFinite(limit) || now - held.updatedAt > limit) continue
    next.set(icao, held)
  }
  if (!incoming || incoming.length === 0) return next
  for (const fix of incoming) {
    const icao = fix.icao?.trim().toLowerCase()
    if (!icao) continue
    next.set(icao, { fix: { ...fix, icao }, updatedAt: now })
  }
  return next
}

/** Coast along the last track between polls. Ground and slow traffic stay put. */
export function deadReckonFix(fix: AirFix, updatedAt: number, now: number, staleMs = STALE_MS): AirFix {
  const dt = Math.max(0, Math.min(staleMs, now - updatedAt)) / 1000
  if (dt < 1 || fix.onGround || !(fix.speedKt >= 40) || !Number.isFinite(fix.track)) return fix
  const meters = fix.speedKt * 0.514444 * dt
  const heading = (fix.track * Math.PI) / 180
  const lat = fix.lat + (meters * Math.cos(heading)) / 111_320
  const cos = Math.cos((fix.lat * Math.PI) / 180)
  if (Math.abs(cos) < 0.05) return fix
  let lon = fix.lon + (meters * Math.sin(heading)) / (111_320 * cos)
  if (lat > 85 || lat < -85) return fix
  while (lon > 180) lon -= 360
  while (lon < -180) lon += 360
  return { ...fix, lat, lon }
}
