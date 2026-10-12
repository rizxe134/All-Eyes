/** Place lookup. Typing asks Photon. GO asks Photon, the US Census, and Nominatim together. */

import type { SettingsStore } from '../core/types'
import { getJson } from '../net/http'
import { collapseQuery, countryHint, looksLikeUsAddress, orderPlaces } from './address'
import { geoCacheGet, geoCachePut } from './cache'
import { parseCoordinates } from './coords'
import { dedupeHits, nominatimHits, parseCensus, parsePhoton, type GeoHit } from './parse'
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

function trace(provider: string, query: string, hits: readonly GeoHit[]): void {
  try {
    if (typeof localStorage === 'undefined' || localStorage.getItem('alleyes.geo.debug') !== '1') return
    console.info('[geo]', provider, query, hits.map((hit) => ({
      label: hit.label,
      lat: hit.lat,
      lon: hit.lon,
      quality: hit.quality ?? '',
      source: hit.source,
    })))
  } catch {
    /* private mode */
  }
}

function biasQuery(bias?: GeoBias): string {
  if (!bias || !Number.isFinite(bias.lat) || !Number.isFinite(bias.lon)) return ''
  if (Math.abs(bias.lat) > 90 || Math.abs(bias.lon) > 180) return ''
  return `&lat=${encodeURIComponent(bias.lat.toFixed(4))}&lon=${encodeURIComponent(bias.lon.toFixed(4))}`
}

async function pull(
  url: string,
  read: (body: unknown) => GeoHit[],
  provider: string,
  query: string,
  settings: SettingsStore,
  signal?: AbortSignal,
): Promise<GeoHit[]> {
  if (signal?.aborted) return []
  try {
    const hits = read(await getJson(url, settings, signal))
    trace(provider, query, hits)
    return hits
  } catch {
    trace(provider, query, [])
    return []
  }
}

/** Photon only, in the order Photon returned. Camera lat/lon is a soft hint. */
export async function suggestPlaces(query: string, settings: SettingsStore, signal?: AbortSignal, bias?: GeoBias): Promise<GeoHit[]> {
  const text = collapseQuery(query)
  if (!text) return []
  const coord = coordinateHit(text)
  if (coord) return [coord]
  const scope = `photon3:${bias ? bias.lat.toFixed(0) : 'x'}:${bias ? bias.lon.toFixed(0) : 'x'}`
  const cached = geoCacheGet(text, Date.now(), scope)
  if (cached) return cached
  const hits = await pull(
    `/api/photon?limit=8&q=${encodeURIComponent(text)}${biasQuery(bias)}`,
    parsePhoton,
    'photon',
    text,
    settings,
    signal,
  )
  if (signal?.aborted) return []
  if (hits.length) geoCachePut(text, hits, Date.now(), scope)
  return hits
}

/**
 * Finished lookup. The query string is sent unchanged.
 * A US house number also asks Census and Nominatim. Nothing is dropped for rank.
 */
export async function resolvePlaces(query: string, settings: SettingsStore, signal?: AbortSignal): Promise<GeoHit[]> {
  const text = collapseQuery(query)
  if (!text) return []
  const coord = coordinateHit(text)
  if (coord) return [coord]
  const scope = 'resolve3'
  const cached = geoCacheGet(text, Date.now(), scope)
  if (cached) return cached
  const us = looksLikeUsAddress(text)
  const country = countryHint(text)
  const nominatim = `/api/nominatim?limit=5&q=${encodeURIComponent(text)}${country ? `&countrycodes=${country}` : ''}`
  const [photon, census, named] = await Promise.all([
    pull(`/api/photon?limit=8&q=${encodeURIComponent(text)}`, parsePhoton, 'photon', text, settings, signal),
    us
      ? pull(`/api/geocode/census?q=${encodeURIComponent(text)}`, parseCensus, 'census', text, settings, signal)
      : Promise.resolve([] as GeoHit[]),
    pull(nominatim, nominatimHits, 'nominatim', text, settings, signal),
  ])
  if (signal?.aborted) return []
  const hits = dedupeHits(orderPlaces(text, [...photon, ...census, ...named])).slice(0, 8)
  trace('chosen', text, hits)
  if (hits.length) geoCachePut(text, hits, Date.now(), scope)
  return hits
}
