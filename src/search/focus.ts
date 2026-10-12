/** Bridges the city panel to the globe. The panel mounts without a pin setter. */

import type { GeoHit } from './parse'

export interface CitySearchApi {
  focus(): void
  run(query: string): Promise<string>
}

type PlaceFly = (hit: GeoHit) => void

let city: CitySearchApi | null = null
let fly: PlaceFly | null = null

export function registerCitySearch(api: CitySearchApi): () => void {
  city = api
  return () => {
    if (city === api) city = null
  }
}

export function citySearch(): CitySearchApi | null {
  return city
}

export function registerPlaceFly(fn: PlaceFly): () => void {
  fly = fn
  return () => {
    if (fly === fn) fly = null
  }
}

/** Returns false when the app has not registered a fly handler yet. */
export function placeFly(hit: GeoHit): boolean {
  if (!fly) return false
  fly(hit)
  return true
}
