export interface CreditPhoto {
  url: string
  link: string
  credit: string
}

function nasaImage(links: unknown): string {
  if (!Array.isArray(links)) return ''
  const hrefs: string[] = []
  for (const link of links) {
    if (!link || typeof link !== 'object') continue
    const href = (link as { href?: unknown }).href
    if (typeof href === 'string' && href.startsWith('https://') && /\.(jpg|jpeg|png|webp)(\?|$)/i.test(href)) hrefs.push(href)
  }
  return hrefs.find((href) => /~medium\./i.test(href))
    || hrefs.find((href) => /~small\./i.test(href))
    || hrefs.find((href) => /~thumb\./i.test(href))
    || hrefs[0]
    || ''
}

/** NASA image search. A result counts only when the title names the subject and the link is an image. */
export function parseNasa(payload: unknown, required: string): CreditPhoto | null {
  if (!payload || typeof payload !== 'object') return null
  const items = (payload as { collection?: { items?: unknown } }).collection?.items
  if (!Array.isArray(items)) return null
  const needle = required.toUpperCase()
  let best: CreditPhoto | null = null
  let bestScore = 0
  for (const item of items) {
    if (!item || typeof item !== 'object') continue
    const row = item as { data?: unknown; links?: unknown }
    const data = Array.isArray(row.data) ? row.data[0] : null
    const title = data && typeof data === 'object' ? String((data as { title?: unknown }).title ?? '') : ''
    if (!title.toUpperCase().includes(needle)) continue
    const url = nasaImage(row.links)
    if (!url) continue
    let score = 2
    if (/~medium\./i.test(url)) score += 4
    if (title.toUpperCase().startsWith(needle)) score += 3
    if (/MOCKUP|EXPERIMENT|TRAINING|CREW|FOOD/i.test(title)) score -= 3
    if (score > bestScore) {
      bestScore = score
      best = { url, link: url, credit: `NASA / ${title}` }
    }
  }
  return best
}

export function nasaQuery(name: string): { q: string; required: string } | null {
  const text = name.toUpperCase()
  if (/ISS|ZARYA/.test(text)) return { q: 'International Space Station', required: 'International Space Station' }
  if (/TIANHE|TIANGONG/.test(text)) return { q: 'Tiangong space station', required: 'Tiangong' }
  if (/HST|HUBBLE/.test(text)) return { q: 'Hubble Space Telescope', required: 'Hubble' }
  if (text.startsWith('STARLINK')) return { q: 'Starlink satellite', required: 'Starlink' }
  if (/GPS|NAVSTAR/.test(text)) return { q: 'GPS satellite NASA', required: 'GPS' }
  return null
}
