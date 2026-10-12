/** Debounced place lookup. Photon first, then Open-Meteo, then Nominatim at the proxy's 1/s cap. */

import type { SettingsStore } from '../core/types'
import { getJson } from '../net/http'
import { geoCacheGet, geoCachePut } from './cache'
import { parseCoordinates } from './coords'
import { dedupeHits, nominatimHits, parseKeyedGeo, parseMeteoGeo, parsePhoton, type GeoHit } from './parse'
import { rangeForCoordinate } from './zoom'

export function coordinateHit(query: string): GeoHit | null {
  const fix = parseCoordinates(query)
  if (!fix) return null
  const rangeKm = rangeForCoordinate(fix.places, fix.dms)
  return {
    lat: fix.lat,
    lon: fix.lon,
    label: `${fix.lat.toFixed(4)}, ${fix.lon.toFixed(4)}`,
    scale: rangeKm <= 0.5 ? 'street' : rangeKm <= 3 ? 'landmark' : rangeKm <= 12 ? 'city' : rangeKm <= 400 ? 'region' : 'country',
    rangeKm,
    source: 'coord',
  }
}

export async function geocodeQuery(query: string, settings: SettingsStore, signal?: AbortSignal): Promise<GeoHit[]> {
  const text = query.trim()
  if (text.length < 2) return []
  const coord = coordinateHit(text)
  if (coord) return [coord]
  const cached = geoCacheGet(text)
  if (cached?.length) return cached
  const bag: GeoHit[] = []
  const pull = async (url: string, read: (body: unknown) => GeoHit[]) => {
    if (signal?.aborted || bag.length >= 6) return
    try {
      bag.push(...read(await getJson(url, settings, signal)))
    } catch {
      /* fall through to the next source */
    }
  }
  await pull(`/api/photon?q=${encodeURIComponent(text)}`, parsePhoton)
  if (!bag.length) await pull(`/api/geocode/meteo?q=${encodeURIComponent(text)}`, parseMeteoGeo)
  if (!bag.length) await pull(`/api/nominatim?limit=5&q=${encodeURIComponent(text)}`, nominatimHits)
  const current = settings.get()
  if (current.maptilerKey) {
    await pull(`/api/geocode/maptiler?q=${encodeURIComponent(text)}`, (body) => parseKeyedGeo(body, 'maptiler'))
  }
  if (current.mapboxKey) {
    await pull(`/api/geocode/mapbox?q=${encodeURIComponent(text)}`, (body) => parseKeyedGeo(body, 'mapbox'))
  }
  const hits = dedupeHits(bag)
  if (hits.length) geoCachePut(text, hits)
  return hits
}
