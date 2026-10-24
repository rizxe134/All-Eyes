import type { SettingsStore } from '../core/types'
import { authHeaders } from '../net/http'
import {
  countryMarkers,
  feedsForRegion,
  filterHeadlines,
  NEWS_CATEGORIES,
  NEWS_FEEDS,
  NEWS_REGIONS,
  parseGdeltArtList,
  parseGdeltGeo,
  parseRss,
  type Headline,
} from '../desk/news'
import { setNewsPoints, type NewsPoint } from '../desk/news-store'

export interface NewsDesk {
  root: HTMLElement
  setActive(on: boolean): void
  query(): string
}

export interface NewsDeskOptions {
  settings: SettingsStore
  newsOn(): boolean
  setNewsLayer(on: boolean): void
}

function el(tag: string, className = '', text = ''): HTMLElement {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text) node.textContent = text
  return node
}

function button(text: string): HTMLButtonElement {
  const node = document.createElement('button')
  node.type = 'button'
  node.className = 'ae-btn'
  node.textContent = text
  return node
}

async function pull(url: string, settings: SettingsStore): Promise<{ ok: boolean; status: number; text: string }> {
  try {
    const res = await fetch(url, { headers: authHeaders(url, settings) })
    return { ok: res.ok, status: res.status, text: await res.text() }
  } catch (err) {
    return { ok: false, status: 0, text: err instanceof Error ? err.message : 'FETCH FAILED' }
  }
}

function keyedArticles(json: unknown, fallback: string): Headline[] {
  if (!json || typeof json !== 'object') return []
  const articles = (json as { articles?: unknown }).articles
  if (!Array.isArray(articles)) return []
  const out: Headline[] = []
  for (const row of articles) {
    if (!row || typeof row !== 'object') continue
    const item = row as { title?: string; url?: string; description?: string; publishedAt?: string; source?: { name?: string } }
    const title = item.title?.trim() || ''
    const link = item.url?.trim() || ''
    if (!title || !link || title === '[Removed]') continue
    out.push({
      id: link,
      title,
      link,
      snippet: (item.description || '').replace(/\s+/g, ' ').trim().slice(0, 220),
      time: item.publishedAt || '',
      source: item.source?.name || fallback,
      country: '',
    })
  }
  return out
}

export function mountNewsDesk(host: HTMLElement, opts: NewsDeskOptions): NewsDesk {
  host.classList.add('ae-newsdesk')
  const bar = el('div', 'ae-deskbar')
  const region = document.createElement('select')
  region.className = 'ae-desk-select'
  for (const name of NEWS_REGIONS) region.append(choice(name.toUpperCase(), name))
  const category = document.createElement('select')
  category.className = 'ae-desk-select'
  for (const name of NEWS_CATEGORIES) category.append(choice(name.toUpperCase(), name))
  const search = document.createElement('input')
  search.className = 'ae-desk-search'
  search.type = 'search'
  search.placeholder = 'Search headlines'
  search.setAttribute('aria-label', 'Search headlines')
  const globe = button('SHOW ON GLOBE')
  const stamp = el('div', 'ae-desk-note', 'NEWS IDLE')
  bar.append(region, category, search, globe, stamp)
  const status = el('div', 'ae-desk-note', '')
  const list = el('div', 'ae-newslist')
  const foot = el(
    'p',
    'ae-desk-foot',
    'Headlines from BBC World, Al Jazeera, NPR, the Guardian, DW, and France 24, plus GDELT when it answers. Reuters and AP have no public RSS here; a NewsAPI or GNews key in CFG can add them. Open a headline for the full article. No headline is filled in.',
  )
  host.append(bar, status, list, foot)

  let active = false
  let timer = 0
  let busy = false
  let failUntil = 0
  let searchTimer = 0
  let last: Headline[] = []

  function choice(label: string, value: string): HTMLOptionElement {
    const node = document.createElement('option')
    node.value = value
    node.textContent = label
    return node
  }

  function queryText(): string {
    const bits = [search.value.trim()]
    if (category.value !== 'all') bits.push(category.value)
    if (region.value !== 'all' && region.value !== 'world') bits.push(region.value)
    return bits.filter(Boolean).join(' ')
  }

  function paintGlobe(headlines: Headline[], geo: ReturnType<typeof parseGdeltGeo>) {
    let points: NewsPoint[] = []
    if (geo.length) {
      points = geo.slice(0, 40).map((story) => ({
        id: `news:${story.id}`,
        lat: story.lat,
        lon: story.lon,
        title: story.title,
        detail: 'GDELT',
        source: story.source,
      }))
    } else {
      const gdelt = headlines.filter((row) => row.country && row.source !== 'BBC World' && !NEWS_FEEDS.some((feed) => feed.name === row.source))
      const markers = gdelt.length
        ? countryMarkers(gdelt, 'SOURCE COUNTRY')
        : countryMarkers(headlines, 'OUTLET COUNTRY')
      points = markers.map((marker) => ({
        id: marker.id,
        lat: marker.lat,
        lon: marker.lon,
        title: marker.title,
        detail: marker.detail,
        source: marker.source,
      }))
    }
    setNewsPoints(points)
  }

  function paint(headlines: Headline[]) {
    const shown = filterHeadlines(headlines, search.value).slice(0, 60)
    list.replaceChildren()
    if (!shown.length) {
      list.append(el('div', 'ae-desk-note', 'NO HEADLINES'))
      return
    }
    for (const row of shown) {
      const card = el('article', 'ae-news')
      const title = document.createElement('button')
      title.type = 'button'
      title.className = 'ae-news-title'
      title.textContent = row.title
      title.addEventListener('click', () => {
        if (row.link) window.open(row.link, '_blank', 'noopener')
      })
      card.append(title)
      card.append(el('div', 'ae-news-meta', [row.source, row.time || 'TIME NOT IN FEED'].filter(Boolean).join(' · ')))
      if (row.snippet) card.append(el('p', 'ae-news-snip', row.snippet))
      list.append(card)
    }
  }

  async function refresh() {
    if (!active || busy) return
    if (Date.now() < failUntil) return
    busy = true
    stamp.textContent = 'NEWS LOADING'
    const feeds = feedsForRegion(region.value)
    const notes: string[] = []
    const headlines: Headline[] = []
    await Promise.all(feeds.map(async (feed) => {
      const hit = await pull(`/api/desk/rss?feed=${feed.id}`, opts.settings)
      if (!hit.ok) {
        notes.push(`${feed.name.toUpperCase()} OFFLINE ${hit.status || ''}`.trim())
        return
      }
      headlines.push(...parseRss(hit.text, feed.name, feed.country))
    }))
    const q = encodeURIComponent(queryText() || 'world')
    const doc = await pull(`/api/desk/gdelt?kind=doc&q=${q}`, opts.settings)
    const geoHit = await pull(`/api/desk/gdelt?kind=geo&q=${q}`, opts.settings)
    let geo: ReturnType<typeof parseGdeltGeo> = []
    if (doc.ok) {
      try {
        headlines.push(...parseGdeltArtList(JSON.parse(doc.text)))
      } catch {
        notes.push('GDELT DOC UNREADABLE')
      }
    } else {
      let reason = `GDELT ${doc.status || 'OFFLINE'}`
      try {
        const body = JSON.parse(doc.text) as { error?: string }
        if (body.error) reason = `GDELT ${body.error}`
      } catch {
        /* status is enough */
      }
      notes.push(reason)
    }
    if (geoHit.ok) {
      try {
        geo = parseGdeltGeo(JSON.parse(geoHit.text))
      } catch {
        notes.push('GDELT GEO UNREADABLE')
      }
    } else {
      notes.push(`GDELT GEO ${geoHit.status || 'OFFLINE'}`)
    }
    const current = opts.settings.get()
    if (current.newsApiKey) {
      const extra = await pull(`/api/desk/newsapi?q=${q}`, opts.settings)
      if (extra.ok) {
        try { headlines.push(...keyedArticles(JSON.parse(extra.text), 'NewsAPI')) } catch { notes.push('NEWSAPI UNREADABLE') }
      } else notes.push(`NEWSAPI ${extra.status}`)
    }
    if (current.gnewsKey) {
      const extra = await pull(`/api/desk/gnews?q=${q}`, opts.settings)
      if (extra.ok) {
        try { headlines.push(...keyedArticles(JSON.parse(extra.text), 'GNews')) } catch { notes.push('GNEWS UNREADABLE') }
      } else notes.push(`GNEWS ${extra.status}`)
    }
    const seen = new Set<string>()
    const unique = headlines.filter((row) => {
      if (seen.has(row.link)) return false
      seen.add(row.link)
      return true
    })
    last = unique
    paint(unique)
    paintGlobe(unique, geo)
    const when = new Date().toISOString().slice(11, 19) + 'Z'
    stamp.textContent = `UPDATED ${when}`
    status.textContent = notes.length ? notes.join(' · ') : geo.length ? `${geo.length} GDELT POINTS` : 'NO GEO POINTS'
    if (!unique.length && notes.length) failUntil = Date.now() + 120000
    busy = false
  }

  function arm() {
    clearInterval(timer)
    timer = active ? window.setInterval(() => void refresh(), 120000) : 0
  }

  globe.addEventListener('click', () => {
    const on = !opts.newsOn()
    opts.setNewsLayer(on)
    globe.classList.toggle('is-on', on)
  })
  for (const box of [region, category]) {
    box.addEventListener('change', () => {
      failUntil = 0
      void refresh()
    })
  }
  search.addEventListener('input', () => {
    paint(last)
    clearTimeout(searchTimer)
    searchTimer = window.setTimeout(() => {
      failUntil = 0
      void refresh()
    }, 500)
  })

  return {
    root: host,
    query: () => search.value,
    setActive(on: boolean) {
      active = on
      globe.classList.toggle('is-on', opts.newsOn())
      if (!on) {
        clearInterval(timer)
        timer = 0
        return
      }
      failUntil = 0
      void refresh()
      arm()
    },
  }
}
