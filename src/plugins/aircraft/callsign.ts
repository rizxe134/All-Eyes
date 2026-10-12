/** Flight numbers and callsigns. IATA designators become the ICAO prefix used on ADS-B. */

import { icaoPrefix } from './airlines'

export type FlightKind = 'iata' | 'icao' | 'hex' | 'reg' | 'text'

export interface FlightQuery {
  raw: string
  kind: FlightKind
  candidates: string[]
}

const IATA = /^([A-Z][A-Z0-9]|[A-Z0-9][A-Z])(\d{1,4})([A-Z]?)$/
const ICAO = /^([A-Z]{3})([A-Z0-9]{1,4})$/
const HEX = /^[0-9a-f]{6}$/
const REG = /^(?:[A-Z]{1,2}-[A-Z0-9]{2,5}|N\d{1,5}[A-Z]{0,2})$/

export function normalizeFlight(input: string): string {
  return input.trim().toUpperCase().replace(/[\s-]+/g, '')
}

function withPad(prefix: string, number: string, letter: string): string[] {
  const bare = `${number}${letter}`
  const out = [`${prefix}${bare}`]
  if (!letter && /^\d+$/.test(number) && number.length < 4) out.push(`${prefix}${number.padStart(4, '0')}`)
  const stripped = number.replace(/^0+/, '') || '0'
  if (stripped !== number) out.push(`${prefix}${stripped}${letter}`)
  return out
}

/** Candidates to try against a live callsign. Does not invent a schedule. */
export function parseFlightQuery(input: string): FlightQuery {
  const compact = input.trim().toUpperCase().replace(/\s+/g, '')
  const raw = compact.replace(/-/g, '')
  if (!raw) return { raw, kind: 'text', candidates: [] }
  if (REG.test(compact) && (compact.includes('-') || /^N\d/.test(compact))) {
    return { raw: compact, kind: 'reg', candidates: [compact] }
  }
  const iata = raw.match(IATA)
  if (iata && !/^[A-Z]{3}/.test(raw)) {
    const prefix = icaoPrefix(iata[1]!)
    const candidates = new Set<string>()
    if (prefix) for (const item of withPad(prefix, iata[2]!, iata[3] ?? '')) candidates.add(item)
    candidates.add(raw)
    return { raw, kind: 'iata', candidates: [...candidates] }
  }
  const icao = raw.match(ICAO)
  if (icao && /^[A-Z]{3}/.test(raw)) {
    const candidates = new Set<string>(withPad(icao[1]!, icao[2]!, ''))
    candidates.add(raw)
    return { raw, kind: 'icao', candidates: [...candidates] }
  }
  if (REG.test(compact)) return { raw: compact, kind: 'reg', candidates: [compact] }
  if (HEX.test(raw.toLowerCase()) && /[A-F]/i.test(raw)) return { raw: raw.toLowerCase(), kind: 'hex', candidates: [raw.toLowerCase()] }
  if (HEX.test(raw.toLowerCase()) && raw.length === 6) return { raw: raw.toLowerCase(), kind: 'hex', candidates: [raw.toLowerCase()] }
  return { raw, kind: 'text', candidates: raw.length >= 2 ? [raw] : [] }
}

export function normCallsign(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, '')
}

export function callsignMatch(callsign: string, registration: string, icao: string, query: FlightQuery): boolean {
  const cs = normCallsign(callsign)
  const reg = registration.trim().toUpperCase().replace(/\s+/g, '')
  const hex = icao.trim().toLowerCase()
  if (!query.raw) return false
  if (query.kind === 'hex') return hex === query.raw
  if (query.kind === 'reg') return reg === query.raw || reg.replace(/-/g, '') === query.raw.replace(/-/g, '')
  for (const cand of query.candidates) {
    const up = cand.toUpperCase()
    if (cs && cs === up) return true
    if (reg && reg.replace(/-/g, '') === up.replace(/-/g, '')) return true
    if (hex && hex === cand.toLowerCase()) return true
  }
  if (query.kind === 'text' && query.raw.length >= 3) {
    return cs.includes(query.raw) || reg.includes(query.raw) || hex === query.raw.toLowerCase()
  }
  return false
}
