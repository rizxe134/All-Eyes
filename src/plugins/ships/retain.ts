export interface HeldShip {
  mmsi: number
  lat: number
  lon: number
  sog: number
  cog: number
  heading: number
  navStat: number
  time: number
  seen: number
}

export const SHIP_STALE_MS = 90_000

/** Later reports replace the same MMSI. An empty poll keeps the previous ones until they expire. */
export function mergeShips(previous: readonly HeldShip[], incoming: readonly HeldShip[] | null, now: number, staleMs = SHIP_STALE_MS): HeldShip[] {
  const map = new Map<number, HeldShip>()
  for (const ship of previous) {
    if (now - ship.seen <= staleMs) map.set(ship.mmsi, ship)
  }
  if (incoming) {
    for (const ship of incoming) map.set(ship.mmsi, { ...ship, seen: ship.seen || now })
  }
  return [...map.values()]
}

/** A point ahead along the course. Speed is knots, time is minutes. */
export function projectAhead(lat: number, lon: number, cogDeg: number, sogKt: number, minutes: number): { lat: number; lon: number } {
  const nm = (sogKt * minutes) / 60
  const rad = (cogDeg * Math.PI) / 180
  const dLat = (nm * Math.cos(rad)) / 60
  const cos = Math.cos((lat * Math.PI) / 180) || 0.01
  const dLon = (nm * Math.sin(rad)) / (60 * cos)
  return { lat: lat + dLat, lon: lon + dLon }
}
