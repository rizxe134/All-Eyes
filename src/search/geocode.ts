/** Debounced place lookup. Photon first, then Open-Meteo, then Nominatim at the proxy's 1/s cap. */

import type { SettingsStore } from '../core/types'
import { getJson } from '../net/http'
import { censusLine, isFullUsAddress, nominatimStructured, parseAddress, rankPlaces } from './address'
import { geoCacheGet, geoCachePut } from './cache'
import { parseCoordinates } from './coords'
import { dedupeHits, nominatimHits, parseCensus, parseKeyedGeo, parseMeteoGeo, parsePhoton, type GeoHit } from './parse'
import { rangeForCoordinate } from './zoom'

export interface GeoBias {
  lat: number
  lon: number
}

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

function biasQuery(bias?: GeoBias): string {
  if (!bias || !Number.isFinite(bias.lat) || !Number.isFinite(bias.lon)) return ''
  return `&lat=${encodeURIComponent(bias.lat.toFixed(4))}&lon=${encodeURIComponent(bias.lon.toFixed(4))}`
}

async function lookupPlaces(query: string, settings: SettingsStore, signal: AbortSignal | undefined, bias: GeoBias | undefined, exact: boolean): Promise<GeoHit[]> {
  const text = query.trim()
  if (text.length < 2) return []
  const coord = coordinateHit(text)
  if (coord) return [coord]
  const parsed = parseAddress(text)
  const full = isFullUsAddress(parsed)
  const scope = exact
    ? 'resolve2'
    : `cam2:${bias ? bias.lat.toFixed(0) : 'x'}:${bias ? bias.lon.toFixed(0) : 'x'}`
  const cached = geoCacheGet(text, Date.now(), scope)
  if (cached?.length) return cached
  const bag: GeoHit[] = []
  const pull = async (url: string, read: (body: unknown) => GeoHit[]) => {
    if (signal?.aborted) return
    try {
      bag.push(...read(await getJson(url, settings, signal)))
    } catch {
      /* fall through to the next source */
    }
  }
  await pull(`/api/photon?q=${encodeURIComponent(text)}${biasQuery(bias)}`, parsePhoton)
  if (exact && full && parsed) {
    await pull(`/api/geocode/census?q=${encodeURIComponent(censusLine(parsed))}`, parseCensus)
    await pull(`/api/nominatim?limit=5&${nominatimStructured(parsed)}`, nominatimHits)
  } else if (!bag.length) {
    await pull(`/api/nominatim?limit=5&q=${encodeURIComponent(text)}`, nominatimHits)
  }
  if (!bag.length && !parsed?.house) await pull(`/api/geocode/meteo?q=${encodeURIComponent(text)}`, parseMeteoGeo)
  const current = settings.get()
  if (current.maptilerKey) {
    await pull(`/api/geocode/maptiler?q=${encodeURIComponent(text)}`, (body) => parseKeyedGeo(body, 'maptiler'))
  }
  if (current.mapboxKey) {
    await pull(`/api/geocode/mapbox?q=${encodeURIComponent(text)}`, (body) => parseKeyedGeo(body, 'mapbox'))
  }
  const hits = dedupeHits(rankPlaces(text, bag))
  if (hits.length && !signal?.aborted) geoCachePut(text, hits, Date.now(), scope)
  return hits
}

/** Suggestions while typing. Photon, biased to the camera. Nominatim only when Photon is empty. */
export async function geocodeQuery(query: string, settings: SettingsStore, signal?: AbortSignal, bias?: GeoBias): Promise<GeoHit[]> {
  return lookupPlaces(query, settings, signal, bias, false)
}

/** A finished US address. Census and structured Nominatim run with Photon. */
export async function resolveAddress(query: string, settings: SettingsStore, signal?: AbortSignal, bias?: GeoBias): Promise<GeoHit[]> {
  return lookupPlaces(query, settings, signal, bias, true)
}
