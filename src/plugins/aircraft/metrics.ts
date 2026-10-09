import { distanceKm } from '../../core/geo'

const NA = 'NOT AVAILABLE'

export { NA }

const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']

/** ICAO 24-bit address blocks. Factual allocations, not a copied database. */
const HEX_RANGES: Array<[number, number, string]> = [
  [0x380000, 0x3bffff, 'France'],
  [0x300000, 0x33ffff, 'Italy'],
  [0x340000, 0x37ffff, 'Spain'],
  [0x3c0000, 0x3fffff, 'Germany'],
  [0x400000, 0x43ffff, 'United Kingdom'],
  [0x440000, 0x447fff, 'Austria'],
  [0x448000, 0x44ffff, 'Belgium'],
  [0x450000, 0x457fff, 'Bulgaria'],
  [0x458000, 0x45ffff, 'Denmark'],
  [0x460000, 0x467fff, 'Finland'],
  [0x468000, 0x46ffff, 'Greece'],
  [0x470000, 0x477fff, 'Hungary'],
  [0x478000, 0x47ffff, 'Norway'],
  [0x480000, 0x487fff, 'Netherlands'],
  [0x488000, 0x48ffff, 'Poland'],
  [0x490000, 0x497fff, 'Portugal'],
  [0x498000, 0x49ffff, 'Czechia'],
  [0x4a0000, 0x4a7fff, 'Romania'],
  [0x4a8000, 0x4affff, 'Sweden'],
  [0x4b0000, 0x4b7fff, 'Switzerland'],
  [0x4b8000, 0x4bffff, 'Turkey'],
  [0x4ca000, 0x4cafff, 'Ireland'],
  [0x800000, 0x83ffff, 'India'],
  [0x840000, 0x87ffff, 'Japan'],
  [0x880000, 0x887fff, 'China'],
  [0xa00000, 0xafffff, 'United States'],
  [0xc00000, 0xc3ffff, 'Canada'],
  [0xe00000, 0xe3ffff, 'Brazil'],
  [0xe40000, 0xe7ffff, 'Mexico'],
]

const REG_PREFIX: Array<[string, string]> = [
  ['N', 'United States'],
  ['C-', 'Canada'],
  ['G-', 'United Kingdom'],
  ['D-', 'Germany'],
  ['F-', 'France'],
  ['EC-', 'Spain'],
  ['I-', 'Italy'],
  ['PH-', 'Netherlands'],
  ['EI-', 'Ireland'],
  ['HB-', 'Switzerland'],
  ['TC-', 'Turkey'],
  ['JA', 'Japan'],
  ['VH-', 'Australia'],
  ['ZK-', 'New Zealand'],
  ['B-', 'China'],
  ['HL', 'South Korea'],
  ['VT-', 'India'],
  ['PP-', 'Brazil'],
  ['PR-', 'Brazil'],
  ['PT-', 'Brazil'],
  ['XA-', 'Mexico'],
  ['XB-', 'Mexico'],
  ['9V-', 'Singapore'],
  ['OY-', 'Denmark'],
  ['SE-', 'Sweden'],
  ['OH-', 'Finland'],
  ['LN-', 'Norway'],
  ['OE-', 'Austria'],
  ['OO-', 'Belgium'],
  ['SP-', 'Poland'],
  ['OK-', 'Czechia'],
  ['SX-', 'Greece'],
  ['CS-', 'Portugal'],
  ['YR-', 'Romania'],
  ['HA-', 'Hungary'],
  ['4X-', 'Israel'],
  ['A6-', 'United Arab Emirates'],
  ['A7-', 'Qatar'],
  ['HZ-', 'Saudi Arabia'],
  ['SU-', 'Egypt'],
  ['ZS-', 'South Africa'],
]

export function flightLevel(feet: number): string {
  const fl = Math.max(0, Math.round(feet / 100))
  return `FL${String(fl).padStart(3, '0')}`
}

export function trackCompass(deg: number): string {
  const turn = ((deg % 360) + 360) % 360
  const index = Math.round(turn / 22.5) % 16
  return COMPASS[index] ?? 'N'
}

export function countryFromHex(hex: string): string {
  const value = Number.parseInt(hex, 16)
  if (!Number.isFinite(value)) return ''
  for (const [start, end, name] of HEX_RANGES) {
    if (value >= start && value <= end) return name
  }
  return ''
}

export function countryFromReg(registration: string): string {
  const reg = registration.trim().toUpperCase()
  if (!reg) return ''
  const ranked = [...REG_PREFIX].sort((a, b) => b[0].length - a[0].length)
  for (const [prefix, name] of ranked) {
    if (reg.startsWith(prefix)) return name
  }
  return ''
}

export interface AirEstimates {
  tasKt: number
  iasKt: number
  mach: number
}

/** Ground speed stands in for true airspeed when the feed has no wind or airspeed. */
export function estimateAirspeeds(gsKt: number, altFt: number): AirEstimates {
  const altM = Math.max(0, altFt) * 0.3048
  const temp = altM <= 11000 ? 288.15 - 0.0065 * altM : 216.65
  const sound = Math.sqrt(1.4 * 287.05287 * temp)
  const tas = Math.max(0, gsKt) * 0.514444
  const mach = sound > 0 ? tas / sound : 0
  const pressure = altM <= 11000
    ? 101325 * (temp / 288.15) ** 5.2561
    : 22632.06 * Math.exp(-0.000157688 * (altM - 11000))
  const sigma = pressure / (287.05287 * temp) / 1.225
  const iasKt = Math.max(0, gsKt) * Math.sqrt(Math.max(0, sigma))
  return { tasKt: Math.max(0, gsKt), iasKt, mach }
}

export function routeProgress(
  originLat: number,
  originLon: number,
  lat: number,
  lon: number,
  destLat: number,
  destLon: number,
): number | null {
  const done = distanceKm(originLat, originLon, lat, lon)
  const left = distanceKm(lat, lon, destLat, destLon)
  const total = done + left
  if (!Number.isFinite(total) || total < 1) return null
  return Math.max(0, Math.min(1, done / total))
}

export function categoryLabel(family: string): string {
  const text = family.toLowerCase()
  if (text.includes('helicopter')) return 'Helicopter'
  if (text.includes('fighter')) return 'Fighter'
  if (text.includes('business')) return 'Business jet'
  if (text.includes('regional')) return 'Regional jet'
  if (text.includes('turboprop')) return 'Turboprop'
  if (text.includes('light')) return 'Light aircraft'
  if (text.includes('cargo')) return 'Cargo'
  if (text.includes('four-engine') || text.includes('wide')) return 'Widebody'
  if (text.includes('narrow')) return 'Narrowbody'
  return 'Aircraft'
}
