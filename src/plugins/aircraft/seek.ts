/** Ask the keyless callsign feeds when the flight is not already on the globe. */

import type { SettingsStore } from '../../core/types'
import { getJson } from '../../net/http'
import { normCallsign, type FlightQuery } from './callsign'
import { parseAdsb, type AirFix } from './parse'
import { ingestAirFixes } from './plugin'

const FEEDS = [
  (cs: string) => `/api/adsb/callsign?cs=${encodeURIComponent(cs)}`,
  (cs: string) => `/api/adsbfi/callsign?cs=${encodeURIComponent(cs)}`,
  (cs: string) => `/api/airplanes/callsign?cs=${encodeURIComponent(cs)}`,
]

function pick(rows: AirFix[], query: FlightQuery): AirFix | null {
  const wanted = new Set(query.candidates.map((item) => item.toUpperCase()))
  wanted.add(query.raw.toUpperCase())
  const exact = rows.find((row) => wanted.has(normCallsign(row.callsign)))
  return exact ?? rows[0] ?? null
}

/**
 * Worldwide callsign lookup.
 * OpenSky has no callsign filter. Aircraft it already returned are in the merged list
 * and are matched before this runs. These three feeds answer a callsign directly.
 */
async function pullFeed(url: string, settings: SettingsStore, signal?: AbortSignal): Promise<AirFix[]> {
  try {
    return parseAdsb(await getJson(url, settings, signal))
  } catch {
    return []
  }
}

/** Callsign, hex, or registration. Empty when no feed currently has that aircraft. */
export async function seekAircraft(query: FlightQuery, settings: SettingsStore, signal?: AbortSignal): Promise<AirFix | null> {
  if (query.kind === 'hex' && /^[0-9a-f]{6}$/.test(query.raw)) {
    const rows = await pullFeed(`/api/adsb/hex?hex=${query.raw}`, settings, signal)
    if (!rows.length) return null
    ingestAirFixes(rows)
    return rows.find((row) => row.icao === query.raw) ?? rows[0] ?? null
  }
  if (query.kind === 'reg') {
    const reg = query.raw.toUpperCase().replace(/[^A-Z0-9]/g, '')
    const rows = await pullFeed(`/api/adsb/reg?reg=${encodeURIComponent(reg)}`, settings, signal)
    if (!rows.length) return null
    ingestAirFixes(rows)
    return rows[0] ?? null
  }
  return seekCallsign(query, settings, signal)
}

export async function seekCallsign(query: FlightQuery, settings: SettingsStore, signal?: AbortSignal): Promise<AirFix | null> {
  const tried = new Set<string>()
  for (const cand of query.candidates) {
    const cs = cand.toUpperCase().replace(/[^A-Z0-9]/g, '')
    if (!/^[A-Z0-9]{3,8}$/.test(cs) || tried.has(cs)) continue
    tried.add(cs)
    for (const path of FEEDS) {
      if (signal?.aborted) return null
      try {
        const rows = parseAdsb(await getJson(path(cs), settings, signal))
        if (!rows.length) continue
        ingestAirFixes(rows)
        const hit = pick(rows, query)
        if (hit) return hit
      } catch {
        /* the next feed may have it */
      }
    }
  }
  return null
}
