/**
 * Story locations and categories for headlines. Every point says how it was located,
 * so a guess from a place name is never shown as if it were a reported coordinate.
 */
import { countryPoint } from './news'

export type NewsCategory = 'conflict' | 'business' | 'science' | 'world'
export type LocatedBy = 'GDELT GEO' | 'PLACE IN HEADLINE' | 'PLACE IN SUMMARY' | 'OUTLET COUNTRY' | 'SOURCE COUNTRY'

export const NEWS_GLYPH: Record<NewsCategory, string> = {
  conflict: 'news-conflict',
  business: 'news-business',
  science: 'news-science',
  world: 'news',
}

const KEYWORDS: [NewsCategory, RegExp][] = [
  ['conflict', /\b(war|wars|attack|attacks|strike|strikes|missile|missiles|drone|drones|troops|army|military|killed|bomb|bombing|shelling|ceasefire|militants?|rebels?|invasion|hostages?|gunmen|clashes)\b/i],
  ['business', /\b(market|markets|stocks?|shares|economy|economic|inflation|bank|banks|tariffs?|trade|gdp|oil price|prices|earnings|company|companies|investors?|ipo|dollar|euro|interest rates?|recession|jobs report)\b/i],
  ['science', /\b(science|scientists?|study|research|space|nasa|rocket|climate|species|vaccine|virus|disease|health|medical|ai|artificial intelligence|planet|telescope|fossil|ocean|quantum)\b/i],
]

export function categorize(text: string): NewsCategory {
  for (const [cat, re] of KEYWORDS) if (re.test(text)) return cat
  return 'world'
}

/** Place name → point. Cities are matched before countries so the most specific place wins. */
const CITIES: Record<string, [number, number]> = {
  Kyiv: [50.45, 30.52], Kiev: [50.45, 30.52], Kharkiv: [49.99, 36.23], Odesa: [46.48, 30.72], Moscow: [55.76, 37.62],
  Gaza: [31.5, 34.47], Jerusalem: [31.77, 35.21], 'Tel Aviv': [32.08, 34.78], Beirut: [33.89, 35.5], Damascus: [33.51, 36.28],
  Tehran: [35.69, 51.39], Baghdad: [33.31, 44.36], Riyadh: [24.71, 46.68], Dubai: [25.2, 55.27], Doha: [25.29, 51.53],
  Cairo: [30.04, 31.24], Khartoum: [15.5, 32.56], Nairobi: [-1.29, 36.82], Lagos: [6.52, 3.38], Johannesburg: [-26.2, 28.05],
  London: [51.51, -0.13], Paris: [48.86, 2.35], Berlin: [52.52, 13.4], Brussels: [50.85, 4.35], Rome: [41.9, 12.5],
  Madrid: [40.42, -3.7], Warsaw: [52.23, 21.01], Istanbul: [41.01, 28.98], Ankara: [39.93, 32.86], Athens: [37.98, 23.73],
  Washington: [38.9, -77.04], 'New York': [40.71, -74.01], 'Los Angeles': [34.05, -118.24], Chicago: [41.88, -87.63],
  Ottawa: [45.42, -75.7], Toronto: [43.65, -79.38], 'Mexico City': [19.43, -99.13], 'São Paulo': [-23.55, -46.63],
  'Sao Paulo': [-23.55, -46.63], 'Buenos Aires': [-34.6, -58.38], Caracas: [10.48, -66.9], Bogotá: [4.71, -74.07], Bogota: [4.71, -74.07],
  Beijing: [39.9, 116.4], Shanghai: [31.23, 121.47], 'Hong Kong': [22.32, 114.17], Taipei: [25.03, 121.57], Tokyo: [35.68, 139.69],
  Seoul: [37.57, 126.98], Pyongyang: [39.04, 125.76], 'New Delhi': [28.61, 77.21], Delhi: [28.61, 77.21], Mumbai: [19.08, 72.88],
  Karachi: [24.86, 67.01], Islamabad: [33.68, 73.05], Kabul: [34.56, 69.21], Dhaka: [23.81, 90.41], Bangkok: [13.76, 100.5],
  Manila: [14.6, 120.98], Jakarta: [-6.21, 106.85], Sydney: [-33.87, 151.21], Canberra: [-35.28, 149.13],
}

const COUNTRIES: Record<string, string> = {
  'United States': 'US', America: 'US', US: 'US', USA: 'US', Canada: 'CA', Mexico: 'MX', Brazil: 'BR', Britain: 'GB', UK: 'GB',
  England: 'GB', France: 'FR', Germany: 'DE', Italy: 'IT', Spain: 'ES', Russia: 'RU', China: 'CN', Japan: 'JP',
  'South Korea': 'KR', India: 'IN', Australia: 'AU', 'South Africa': 'ZA', Nigeria: 'NG', Egypt: 'EG', Qatar: 'QA',
  UAE: 'AE', 'Saudi Arabia': 'SA', Israel: 'IL', Turkey: 'TR', Türkiye: 'TR', Ukraine: 'UA',
}

const EXTRA_COUNTRY: Record<string, [number, number]> = {
  Iran: [32.4, 53.7], Iraq: [33.2, 43.7], Syria: [34.8, 38.99], Lebanon: [33.85, 35.86], Yemen: [15.55, 48.52],
  Afghanistan: [33.94, 67.71], Pakistan: [30.38, 69.35], Bangladesh: [23.68, 90.36], Sudan: [12.86, 30.22],
  Ethiopia: [9.15, 40.49], Kenya: [-0.02, 37.91], Somalia: [5.15, 46.2], Congo: [-4.04, 21.76], Venezuela: [6.42, -66.59],
  Argentina: [-38.42, -63.62], Colombia: [4.57, -74.3], Chile: [-35.68, -71.54], Peru: [-9.19, -75.02], Poland: [51.92, 19.15],
  Greece: [39.07, 21.82], Taiwan: [23.7, 120.96], 'North Korea': [40.34, 127.51], Philippines: [12.88, 121.77],
  Indonesia: [-0.79, 113.92], Thailand: [15.87, 100.99], Vietnam: [14.06, 108.28], Myanmar: [21.91, 95.96], Haiti: [18.97, -72.29],
  Cuba: [21.52, -77.78],
}

interface Place { name: string; lat: number; lon: number; specificity: number }

const PLACES: Place[] = (() => {
  const out: Place[] = []
  for (const [name, [lat, lon]] of Object.entries(CITIES)) out.push({ name, lat, lon, specificity: 2 })
  for (const [name, [lat, lon]] of Object.entries(EXTRA_COUNTRY)) out.push({ name, lat, lon, specificity: 1 })
  for (const [name, code] of Object.entries(COUNTRIES)) {
    const p = countryPoint(code)
    if (p) out.push({ name, lat: p.lat, lon: p.lon, specificity: 1 })
  }
  // Longer names first, so "North Korea" beats "Korea" and "New York" beats "York".
  return out.sort((a, b) => b.specificity - a.specificity || b.name.length - a.name.length)
})()

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const MATCHERS = PLACES.map((place) => ({
  place,
  // Short all-caps codes (US, UK, UAE) must match case-sensitively to avoid "us" the pronoun.
  re: new RegExp(`(^|[^\\p{L}])${escape(place.name)}(?=$|[^\\p{L}])`, /^[A-Z]{2,3}$/.test(place.name) ? 'u' : 'iu'),
}))

export function findPlace(text: string): Place | null {
  if (!text) return null
  for (const { place, re } of MATCHERS) if (re.test(text)) return place
  return null
}

export interface LocatedStory {
  lat: number
  lon: number
  place: string
  locatedBy: LocatedBy
}

/** Headline first, then summary, then the outlet's home country. Returns null when nothing honest is left. */
export function locateHeadline(title: string, snippet: string, outletCountry: string): LocatedStory | null {
  const inTitle = findPlace(title)
  if (inTitle) return { lat: inTitle.lat, lon: inTitle.lon, place: inTitle.name, locatedBy: 'PLACE IN HEADLINE' }
  const inSnippet = findPlace(snippet)
  if (inSnippet) return { lat: inSnippet.lat, lon: inSnippet.lon, place: inSnippet.name, locatedBy: 'PLACE IN SUMMARY' }
  const home = outletCountry ? countryPoint(outletCountry) : null
  if (home) return { lat: home.lat, lon: home.lon, place: outletCountry.toUpperCase(), locatedBy: 'OUTLET COUNTRY' }
  return null
}

/** Spread points that share a spot so every icon stays clickable. */
export function spread<T extends { lat: number; lon: number }>(points: readonly T[]): T[] {
  const seen = new Map<string, number>()
  return points.map((p) => {
    const key = `${p.lat.toFixed(2)},${p.lon.toFixed(2)}`
    const n = seen.get(key) ?? 0
    seen.set(key, n + 1)
    if (!n) return { ...p }
    const angle = n * 2.399
    const r = 0.35 * Math.sqrt(n)
    return { ...p, lat: Math.max(-89, Math.min(89, p.lat + r * Math.sin(angle))), lon: p.lon + r * Math.cos(angle) }
  })
}
