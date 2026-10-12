/** US-style address fields, match quality, and suggestion ranking. No network. */

import type { GeoHit, MatchQuality } from './parse'

export interface ParsedAddress {
  house: string
  street: string
  unit: string
  city: string
  stateAbbr: string
  stateName: string
  postcode: string
  country: 'US' | ''
  partial: boolean
}

const STATES: readonly [string, string][] = [
  ['AL', 'Alabama'], ['AK', 'Alaska'], ['AZ', 'Arizona'], ['AR', 'Arkansas'], ['CA', 'California'],
  ['CO', 'Colorado'], ['CT', 'Connecticut'], ['DE', 'Delaware'], ['DC', 'District of Columbia'],
  ['FL', 'Florida'], ['GA', 'Georgia'], ['HI', 'Hawaii'], ['ID', 'Idaho'], ['IL', 'Illinois'],
  ['IN', 'Indiana'], ['IA', 'Iowa'], ['KS', 'Kansas'], ['KY', 'Kentucky'], ['LA', 'Louisiana'],
  ['ME', 'Maine'], ['MD', 'Maryland'], ['MA', 'Massachusetts'], ['MI', 'Michigan'], ['MN', 'Minnesota'],
  ['MS', 'Mississippi'], ['MO', 'Missouri'], ['MT', 'Montana'], ['NE', 'Nebraska'], ['NV', 'Nevada'],
  ['NH', 'New Hampshire'], ['NJ', 'New Jersey'], ['NM', 'New Mexico'], ['NY', 'New York'],
  ['NC', 'North Carolina'], ['ND', 'North Dakota'], ['OH', 'Ohio'], ['OK', 'Oklahoma'], ['OR', 'Oregon'],
  ['PA', 'Pennsylvania'], ['RI', 'Rhode Island'], ['SC', 'South Carolina'], ['SD', 'South Dakota'],
  ['TN', 'Tennessee'], ['TX', 'Texas'], ['UT', 'Utah'], ['VT', 'Vermont'], ['VA', 'Virginia'],
  ['WA', 'Washington'], ['WV', 'West Virginia'], ['WI', 'Wisconsin'], ['WY', 'Wyoming'],
]

const BY_ABBR = new Map(STATES.map(([abbr, name]) => [abbr, name]))
const BY_NAME = new Map(STATES.map(([abbr, name]) => [name.toLowerCase(), abbr]))

const SUFFIX = new Set(['st', 'street', 'rd', 'road', 'ave', 'avenue', 'av', 'blvd', 'boulevard', 'dr', 'drive', 'ln', 'lane', 'way', 'ct', 'court', 'pl', 'place', 'ter', 'terrace', 'cir', 'circle', 'pkwy', 'parkway', 'hwy', 'highway', 'trl', 'trail', 'sq', 'square'])
const DIRECTION = new Set(['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw', 'north', 'south', 'east', 'west', 'northeast', 'northwest', 'southeast', 'southwest'])

const SUFFIX_NORM: Record<string, string> = {
  street: 'st', st: 'st', road: 'rd', rd: 'rd', avenue: 'ave', ave: 'ave', av: 'ave',
  boulevard: 'blvd', blvd: 'blvd', drive: 'dr', dr: 'dr', lane: 'ln', ln: 'ln', way: 'way',
  court: 'ct', ct: 'ct', place: 'pl', pl: 'pl', terrace: 'ter', ter: 'ter', circle: 'cir', cir: 'cir',
  parkway: 'pkwy', pkwy: 'pkwy', highway: 'hwy', hwy: 'hwy', trail: 'trl', trl: 'trl', square: 'sq', sq: 'sq',
}
const DIR_NORM: Record<string, string> = {
  north: 'n', south: 's', east: 'e', west: 'w', northeast: 'ne', northwest: 'nw', southeast: 'se', southwest: 'sw',
}
const ORDINAL: Record<string, string> = {
  first: '1', second: '2', third: '3', fourth: '4', fifth: '5', sixth: '6', seventh: '7', eighth: '8', ninth: '9',
  tenth: '10', eleventh: '11', twelfth: '12',
}

const QUALITY_SCORE: Record<MatchQuality, number> = {
  EXACT: 400,
  INTERPOLATED: 300,
  'STREET ONLY': 160,
  'CITY ONLY': 40,
}

function cleanToken(token: string): string {
  return token.toLowerCase().replace(/\./g, '')
}

export function normalizeState(token: string): { abbr: string; name: string } | null {
  const text = token.trim().toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ')
  if (!text) return null
  const abbr = BY_NAME.get(text)
  if (abbr) return { abbr, name: BY_ABBR.get(abbr) || token }
  const upper = text.toUpperCase()
  const name = BY_ABBR.get(upper)
  if (name && text.length === 2) return { abbr: upper, name }
  if (text === 'dc' || text === 'd c') return { abbr: 'DC', name: 'District of Columbia' }
  return null
}

function lastSuffix(tokens: readonly string[]): number {
  let at = -1
  tokens.forEach((token, index) => {
    if (SUFFIX.has(cleanToken(token))) at = index
  })
  return at
}

/** A trailing state, but not a direction that only finishes the street. */
function takeState(tokens: string[]): { abbr: string; name: string } | null {
  for (const size of [3, 2, 1]) {
    if (tokens.length <= size) continue
    const chunk = tokens.slice(-size).join(' ')
    const state = normalizeState(chunk)
    if (!state) continue
    const abbreviation = size === 1 && state.abbr === chunk.replace(/\./g, '').toUpperCase()
    if (abbreviation) {
      const before = tokens.slice(0, -1)
      const suffixAt = lastSuffix(before)
      if (suffixAt < 0) continue
      const after = before[suffixAt + 1]
      const dir = after != null && DIRECTION.has(cleanToken(after))
      const cityTokens = before.length - 1 - suffixAt - (dir ? 1 : 0)
      if (cityTokens < 1) continue
    }
    tokens.splice(tokens.length - size, size)
    return state
  }
  return null
}

function blank(over: Partial<ParsedAddress>): ParsedAddress {
  return {
    house: '',
    street: '',
    unit: '',
    city: '',
    stateAbbr: '',
    stateName: '',
    postcode: '',
    country: '',
    partial: true,
    ...over,
  }
}

function finish(row: ParsedAddress): ParsedAddress | null {
  if (!row.house || !row.street) return null
  const full = Boolean(row.city && row.stateAbbr)
  return { ...row, country: row.stateAbbr ? 'US' : '', partial: !full }
}

function streetLine(line: string): { house: string; street: string } | null {
  const match = line.trim().match(/^(\d{1,6}[a-z]?)\s+(.+)$/i)
  if (!match) return null
  return { house: match[1], street: match[2].trim() }
}

function parseCommas(body: string, unit: string, postcode: string): ParsedAddress | null {
  const parts = body.split(',').map((part) => part.trim()).filter(Boolean)
    .filter((part) => !/^(usa?|united states|america)$/i.test(part))
  if (parts.length < 2) return null
  let state = normalizeState(parts[parts.length - 1] || '')
  if (state) parts.pop()
  else {
    const words = (parts[parts.length - 1] || '').split(/\s+/)
    state = takeState(words)
    if (state) parts[parts.length - 1] = words.join(' ')
  }
  const line = streetLine(parts[0] || '')
  if (!line) return null
  const city = parts.slice(1).join(', ').trim()
  return finish(blank({ house: line.house, street: line.street, unit, city, stateAbbr: state?.abbr ?? '', stateName: state?.name ?? '', postcode }))
}

function parseLoose(body: string, unit: string, postcode: string): ParsedAddress | null {
  const tokens = body.split(/\s+/).filter(Boolean)
  const state = takeState(tokens)
  if (!/^\d{1,6}[a-z]?$/i.test(tokens[0] || '')) return null
  const house = tokens.shift() || ''
  const suffixAt = lastSuffix(tokens)
  let streetEnd = suffixAt
  if (streetEnd >= 0 && DIRECTION.has(cleanToken(tokens[streetEnd + 1] || ''))) streetEnd += 1
  let street = ''
  let city = ''
  if (streetEnd >= 0) {
    street = tokens.slice(0, streetEnd + 1).join(' ')
    city = tokens.slice(streetEnd + 1).join(' ')
  } else if (state && tokens.length >= 2) {
    city = tokens[tokens.length - 1] || ''
    street = tokens.slice(0, -1).join(' ')
  } else {
    street = tokens.join(' ')
  }
  return finish(blank({ house, street, unit, city, stateAbbr: state?.abbr ?? '', stateName: state?.name ?? '', postcode }))
}

/** House, street, city, state, ZIP, and unit. Null when this is not an address. */
export function parseAddress(query: string): ParsedAddress | null {
  const text = query.trim().replace(/\s+/g, ' ')
  if (!text || text.length > 140) return null
  if (/^[A-Z]{1,3}\s?\d{1,4}[A-Z]?$/i.test(text)) return null
  if (/^[0-9a-f]{6}$/i.test(text)) return null
  if (/^N\d{1,5}[A-Z]{0,2}$/i.test(text)) return null
  let unit = ''
  const stripped = text.replace(/(?:,|\s)\s*(?:apt|apartment|unit|ste|suite|fl|floor|#)\s*[#.]?\s*([a-z0-9-]+)\b/i, (_all, id: string) => {
    unit = id
    return ' '
  }).replace(/\s+/g, ' ').trim()
  const zipMatch = stripped.match(/^(.*\D)\s+(\d{5}(?:-\d{4})?)\s*$/)
  const postcode = zipMatch?.[2] ?? ''
  const body = (zipMatch?.[1] ?? stripped).replace(/[,\s]+$/g, '').trim()
  if (body.includes(',')) return parseCommas(body, unit, postcode)
  return parseLoose(body, unit, postcode)
}

export function isFullUsAddress(parsed: ParsedAddress | null): boolean {
  return Boolean(parsed && parsed.country === 'US' && parsed.house && parsed.street && parsed.city && parsed.stateAbbr)
}

export function censusLine(parsed: ParsedAddress): string {
  const street = [parsed.house, parsed.street].filter(Boolean).join(' ')
  const state = [parsed.stateAbbr, parsed.postcode].filter(Boolean).join(' ')
  return [street, parsed.city, state].filter(Boolean).join(', ')
}

export function nominatimStructured(parsed: ParsedAddress): string {
  const params = new URLSearchParams()
  const street = [parsed.house, parsed.street].filter(Boolean).join(' ')
  if (street) params.set('street', street)
  if (parsed.city) params.set('city', parsed.city)
  if (parsed.stateName) params.set('state', parsed.stateName)
  if (parsed.postcode) params.set('postalcode', parsed.postcode)
  if (parsed.country === 'US') params.set('country', 'United States')
  return params.toString()
}

export function normStreet(value: string): string {
  return value
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/\b(\d+)(?:st|nd|rd|th)\b/g, '$1')
    .split(/\s+/)
    .map((token) => ORDINAL[token] || SUFFIX_NORM[token] || DIR_NORM[token] || token)
    .join(' ')
    .trim()
}

export function streetMatches(query: string, result: string): boolean {
  const left = normStreet(query).split(' ').filter(Boolean)
  const right = normStreet(result).split(' ').filter(Boolean)
  if (!left.length || !right.length || left.length > right.length) return false
  return left.every((token, index) => {
    const other = right[index] || ''
    if (token === other) return true
    return token.length >= 3 && other.startsWith(token)
  })
}

function houseMatches(query: string, result: string): boolean {
  if (!query || !result) return false
  return query.toLowerCase().replace(/[^a-z0-9]/g, '') === result.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function cityMatches(query: string, result: string): boolean {
  const left = query.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim()
  const right = result.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim()
  if (!left || !right) return false
  if (left === right) return true
  if (right.startsWith(left) && (left.length >= 4 || right.split(' ')[0] === left)) return true
  return left.startsWith(right) && right.length >= 4
}

function stateMatches(abbr: string, name: string, result: string): boolean {
  if (!abbr || !result) return true
  const known = normalizeState(result)
  if (known) return known.abbr === abbr
  const text = result.toLowerCase()
  return text === abbr.toLowerCase() || text.includes(name.toLowerCase())
}

export function matchQuality(parsed: ParsedAddress | null, hit: GeoHit): MatchQuality | undefined {
  if (!parsed?.house) return undefined
  const house = hit.parts?.house ?? ''
  const street = hit.parts?.street ?? ''
  const city = hit.parts?.city ?? ''
  const streetOk = streetMatches(parsed.street, street) || streetMatches(parsed.street, hit.label)
  const houseOk = houseMatches(parsed.house, house)
  const cityRequired = parsed.city.length >= 4
  const cityOk = !cityRequired || !city || cityMatches(parsed.city, city)
  const stateOk = stateMatches(parsed.stateAbbr, parsed.stateName, hit.parts?.state ?? '')
  const placed = houseOk && streetOk && cityOk && stateOk
  if (hit.source === 'census' && placed) return 'INTERPOLATED'
  if (placed) return 'EXACT'
  if (streetOk) return 'STREET ONLY'
  if (parsed.city && city && (city.toLowerCase().startsWith(parsed.city.toLowerCase()) || parsed.city.toLowerCase().startsWith(city.toLowerCase()))) return 'CITY ONLY'
  if (hit.scale === 'city' || hit.scale === 'region' || hit.scale === 'country') return 'CITY ONLY'
  if (hit.scale === 'street') return 'STREET ONLY'
  return undefined
}

function scaleScore(scale: GeoHit['scale']): number {
  if (scale === 'street') return 30
  if (scale === 'landmark' || scale === 'airport') return 12
  if (scale === 'city') return 4
  if (scale === 'region') return 0
  return -20
}

/** House and street matches lead. Cities stay available under them. */
export function rankPlaces(query: string, rows: readonly GeoHit[]): GeoHit[] {
  const parsed = parseAddress(query)
  return rows.map((row, index) => {
    const quality = matchQuality(parsed, row) ?? row.quality
    const score = (quality ? QUALITY_SCORE[quality] : 0) + scaleScore(row.scale)
    return { row: quality ? { ...row, quality } : row, index, score }
  }).sort((a, b) => b.score - a.score || a.index - b.index).map((item) => item.row)
}

/** Trim and collapse whitespace. Reject URLs and control characters. The query is not rewritten. */
export function collapseQuery(raw: string): string | null {
  if (typeof raw !== 'string') return null
  const query = raw.trim().replace(/\s+/g, ' ')
  if (query.length < 2 || query.length > 200) return null
  if (/[\u0000-\u001F\u007F]/.test(query)) return null
  if (/^https?:\/\//i.test(query)) return null
  return query
}

export function houseToken(query: string): string {
  const match = query.match(/\b(\d{1,6}[a-z]?)\b/i)
  return match?.[1]?.toLowerCase() ?? ''
}

/** A house number plus a US state, ZIP, or country word. The original text is left intact. */
export function looksLikeUsAddress(query: string): boolean {
  if (!houseToken(query)) return false
  if (/\b(united states|u\.s\.a?\.?|usa)\b/i.test(query)) return true
  if (/\b\d{5}(?:-\d{4})?\b/.test(query)) return true
  const tokens = query.replace(/[.,#]/g, ' ').split(/\s+/).filter(Boolean)
  for (let i = 0; i < tokens.length; i += 1) {
    const one = tokens[i] ?? ''
    const two = tokens.slice(i, i + 2).join(' ')
    const three = tokens.slice(i, i + 3).join(' ')
    if (normalizeState(three) || normalizeState(two)) return true
    if (one.length === 2 && normalizeState(one)) return true
  }
  return false
}

export function countryHint(query: string): string {
  if (looksLikeUsAddress(query)) return 'us'
  if (/\b(united kingdom|england|scotland|wales|london)\b/i.test(query)) return 'gb'
  if (/\b(tokyo|osaka|kyoto|日本|東京)\b/i.test(query)) return 'jp'
  if (/\b(paris|france)\b/i.test(query)) return 'fr'
  return ''
}

function sameHouse(query: string, hit: GeoHit): boolean {
  const want = houseToken(query)
  const got = (hit.parts?.house ?? '').toLowerCase()
  return Boolean(want && got && want === got)
}

/**
 * House-number matches lead, then a Census range, then everything else.
 * Photon order is kept inside a tier. No row is removed.
 */
export function orderPlaces(query: string, rows: readonly GeoHit[]): GeoHit[] {
  return rows.map((row, index) => {
    let tier = 2
    let quality: MatchQuality | undefined = row.quality
    if (row.source !== 'census' && sameHouse(query, row)) {
      tier = 0
      quality = 'EXACT'
    } else if (row.source === 'census') {
      tier = 1
      quality = 'INTERPOLATED'
    } else if (!quality) {
      quality = row.parts?.street || row.scale === 'street' ? 'STREET ONLY' : 'CITY ONLY'
    }
    return { row: quality ? { ...row, quality } : row, tier, index }
  }).sort((a, b) => a.tier - b.tier || a.index - b.index).map((item) => item.row)
}

/** Dim completion after the caret. Empty when the top guess does not continue the text. */
export function ghostSuffix(typed: string, suggestion: string): string {
  if (!typed.trim() || !suggestion) return ''
  let i = 0
  let j = 0
  const skip = (value: string, at: number) => {
    while (at < value.length && /[\s,.]/.test(value[at] || '')) at += 1
    return at
  }
  while (i < typed.length && j < suggestion.length) {
    i = skip(typed, i)
    j = skip(suggestion, j)
    if (i >= typed.length) break
    if (j >= suggestion.length) return ''
    if ((typed[i] || '').toLowerCase() !== (suggestion[j] || '').toLowerCase()) return ''
    i += 1
    j += 1
  }
  if (skip(typed, i) < typed.length) return ''
  return suggestion.slice(j)
}
