/** Headline parsers. Nothing here invents a title, a time, or a coordinate. */

export interface Headline {
  id: string
  title: string
  link: string
  snippet: string
  time: string
  source: string
  country: string
}

export interface GeoStory {
  id: string
  title: string
  link: string
  lat: number
  lon: number
  source: string
  time: string
}

export interface NewsFeed {
  id: string
  name: string
  country: string
  regions: readonly string[]
}

export const NEWS_FEEDS: readonly NewsFeed[] = [
  { id: 'bbc', name: 'BBC World', country: 'GB', regions: ['world', 'europe'] },
  { id: 'aljazeera', name: 'Al Jazeera', country: 'QA', regions: ['world', 'mideast', 'africa'] },
  { id: 'npr', name: 'NPR', country: 'US', regions: ['world', 'americas'] },
  { id: 'guardian', name: 'Guardian', country: 'GB', regions: ['world', 'europe'] },
  { id: 'dw', name: 'DW', country: 'DE', regions: ['world', 'europe'] },
  { id: 'france24', name: 'France 24', country: 'FR', regions: ['world', 'europe', 'africa'] },
]

export const NEWS_REGIONS = ['all', 'world', 'americas', 'europe', 'asia', 'africa', 'mideast'] as const
export const NEWS_CATEGORIES = ['all', 'world', 'business', 'science', 'conflict'] as const

const COUNTRY: Record<string, { lat: number; lon: number }> = {
  US: { lat: 39.8, lon: -98.6 },
  CA: { lat: 56.1, lon: -106.3 },
  MX: { lat: 23.6, lon: -102.5 },
  BR: { lat: -14.2, lon: -51.9 },
  GB: { lat: 54.0, lon: -2.5 },
  FR: { lat: 46.2, lon: 2.2 },
  DE: { lat: 51.2, lon: 10.4 },
  IT: { lat: 41.9, lon: 12.6 },
  ES: { lat: 40.5, lon: -3.7 },
  RU: { lat: 61.5, lon: 105.3 },
  CN: { lat: 35.9, lon: 104.2 },
  JP: { lat: 36.2, lon: 138.3 },
  KR: { lat: 35.9, lon: 127.8 },
  IN: { lat: 20.6, lon: 79.0 },
  AU: { lat: -25.3, lon: 133.8 },
  ZA: { lat: -30.6, lon: 22.9 },
  NG: { lat: 9.1, lon: 8.7 },
  EG: { lat: 26.8, lon: 30.8 },
  QA: { lat: 25.3, lon: 51.2 },
  AE: { lat: 23.4, lon: 53.8 },
  SA: { lat: 23.9, lon: 45.1 },
  IL: { lat: 31.0, lon: 34.9 },
  TR: { lat: 39.0, lon: 35.2 },
  UA: { lat: 48.4, lon: 31.2 },
}

export function countryPoint(code: string): { lat: number; lon: number } | null {
  return COUNTRY[code.trim().toUpperCase()] ?? null
}

export function feedsForRegion(region: string): NewsFeed[] {
  if (!region || region === 'all' || region === 'world') return [...NEWS_FEEDS]
  return NEWS_FEEDS.filter((feed) => feed.regions.includes(region))
}

function decode(raw: string): string {
  const text = raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => {
      const code = Number(n)
      return Number.isFinite(code) ? String.fromCharCode(code) : ''
    })
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > 220 ? `${text.slice(0, 217)}...` : text
}

function tag(block: string, name: string): string {
  const match = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'))
  return match ? decode(match[1]) : ''
}

export function parseRss(xml: string, source: string, country = ''): Headline[] {
  if (!xml || !xml.includes('<item')) return []
  const chunks = xml.split(/<item\b/i).slice(1)
  const out: Headline[] = []
  for (const chunk of chunks) {
    const block = chunk.split(/<\/item>/i)[0] || ''
    const title = tag(block, 'title')
    const link = tag(block, 'link') || tag(block, 'guid')
    if (!title || !link) continue
    const when = tag(block, 'pubDate') || tag(block, 'dc:date') || tag(block, 'updated')
    out.push({
      id: link,
      title,
      link,
      snippet: tag(block, 'description') || tag(block, 'summary'),
      time: when,
      source,
      country,
    })
  }
  return out
}

function seen(value: string): string {
  const text = value.trim()
  const match = text.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/)
  if (!match) return text
  return `${match[1]}-${match[2]}-${match[3]} ${match[4]}:${match[5]}:${match[6]}Z`
}

export function parseGdeltArtList(json: unknown): Headline[] {
  if (!json || typeof json !== 'object') return []
  const articles = (json as { articles?: unknown }).articles
  if (!Array.isArray(articles)) return []
  const out: Headline[] = []
  for (const row of articles) {
    if (!row || typeof row !== 'object') continue
    const item = row as { url?: string; title?: string; seendate?: string; domain?: string; sourcecountry?: string }
    const title = typeof item.title === 'string' ? item.title.trim() : ''
    const link = typeof item.url === 'string' ? item.url.trim() : ''
    if (!title || !link) continue
    out.push({
      id: link,
      title,
      link,
      snippet: '',
      time: seen(typeof item.seendate === 'string' ? item.seendate : ''),
      source: typeof item.domain === 'string' && item.domain ? item.domain : 'GDELT',
      country: typeof item.sourcecountry === 'string' ? item.sourcecountry.trim().toUpperCase() : '',
    })
  }
  return out
}

function firstHref(html: string): string {
  const match = html.match(/href\s*=\s*["']([^"']+)["']/i)
  return match?.[1]?.trim() || ''
}

export function parseGdeltGeo(json: unknown): GeoStory[] {
  if (!json || typeof json !== 'object') return []
  const features = (json as { features?: unknown }).features
  if (!Array.isArray(features)) return []
  const out: GeoStory[] = []
  for (const feature of features) {
    if (!feature || typeof feature !== 'object') continue
    const row = feature as {
      geometry?: { type?: string; coordinates?: unknown }
      properties?: { name?: string; html?: string; title?: string }
    }
    const coords = row.geometry?.type === 'Point' ? row.geometry.coordinates : null
    if (!Array.isArray(coords) || coords.length < 2) continue
    const lon = Number(coords[0])
    const lat = Number(coords[1])
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) continue
    const props = row.properties ?? {}
    const html = typeof props.html === 'string' ? props.html : ''
    const title = (typeof props.title === 'string' && props.title.trim()) || (typeof props.name === 'string' ? props.name.trim() : '')
    if (!title) continue
    const link = firstHref(html)
    out.push({
      id: link || `${lat.toFixed(3)},${lon.toFixed(3)}:${title}`,
      title,
      link,
      lat,
      lon,
      source: 'GDELT',
      time: '',
    })
  }
  return out
}

export interface CountryMarker {
  id: string
  country: string
  lat: number
  lon: number
  title: string
  count: number
  source: string
  detail: string
}

/** Outlet-country pins. Used only when a feed actually supplied a country code. */
export function countryMarkers(
  items: readonly { country: string; title: string; source: string }[],
  label = 'OUTLET COUNTRY',
): CountryMarker[] {
  const groups = new Map<string, { title: string; source: string; count: number }>()
  for (const item of items) {
    const code = item.country.trim().toUpperCase()
    if (!code || !countryPoint(code) || !item.title) continue
    const prev = groups.get(code)
    if (prev) prev.count += 1
    else groups.set(code, { title: item.title, source: item.source, count: 1 })
  }
  const out: CountryMarker[] = []
  let index = 0
  for (const [country, group] of groups) {
    const point = countryPoint(country)
    if (!point) continue
    out.push({
      id: `news:${country}`,
      country,
      lat: point.lat,
      lon: point.lon + index * 0.35,
      title: group.title,
      count: group.count,
      source: group.source,
      detail: `${label} · ${group.count} · ${group.source}`,
    })
    index += 1
  }
  return out
}

export function filterHeadlines(items: readonly Headline[], query: string): Headline[] {
  const text = query.trim().toUpperCase()
  if (text.length < 2) return [...items]
  return items.filter((item) => `${item.title} ${item.snippet} ${item.source}`.toUpperCase().includes(text))
}
