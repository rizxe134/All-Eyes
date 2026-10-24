import { describe, expect, it } from 'vitest'
import { exchangeById, exchangeStatus, EXCHANGES } from '../src/desk/exchanges'
import { filterCams, streamingIds } from '../src/desk/cameras'
import { countryMarkers, filterHeadlines, parseGdeltArtList, parseGdeltGeo, parseRss } from '../src/desk/news'
import {
  changeFrom,
  labelQuote,
  looksLikeHtml,
  movers,
  parseCoinbaseCandles,
  parseCoinbaseSpot,
  parseFrankfurterLatest,
  parseFredCsv,
  parseKrakenTicker,
  parseStooqDaily,
  parseStooqQuote,
  sliceChart,
} from '../src/desk/quotes'
import { switchTab, tabFromShortcut, type DeskState } from '../src/desk/tabs'
import type { TrafficCam } from '../src/plugins/cameras/parse'

const desk: DeskState = { tab: 'globe', cameraId: 'cam:wi:1', newsQuery: 'port', watchlist: ['AAPL'] }

function cam(partial: Partial<TrafficCam> & Pick<TrafficCam, 'id' | 'mode' | 'source'>): TrafficCam {
  return {
    name: partial.id,
    road: '',
    direction: '',
    lat: partial.lat ?? 40,
    lon: partial.lon ?? -74,
    agency: '',
    attribution: '',
    imageUrl: '',
    videoUrl: '',
    pageUrl: '',
    refreshSec: 30,
    updated: '',
    online: partial.online ?? true,
    ...partial,
  }
}

describe('exchange sessions', () => {
  const nyse = exchangeById('nyse')!
  const jpx = exchangeById('jpx')!
  const tadawul = exchangeById('tadawul')!

  it('keeps a separate marker for every major board', () => {
    expect(EXCHANGES.map((ex) => ex.id)).toEqual([
      'nyse', 'nasdaq', 'tsx', 'b3', 'lse', 'euronext', 'xetra', 'six', 'jpx', 'hkex',
      'sse', 'szse', 'nse', 'bse', 'krx', 'twse', 'asx', 'jse', 'tadawul',
    ])
  })

  it('reads New York pre-market before the March 2026 DST change', () => {
    const session = exchangeStatus(nyse, new Date('2026-03-06T14:00:00Z'))
    expect(session.localTime).toBe('09:00')
    expect(session.status).toBe('PRE')
  })

  it('reads New York as open after DST starts', () => {
    const session = exchangeStatus(nyse, new Date('2026-03-10T14:00:00Z'))
    expect(session.localTime).toBe('10:00')
    expect(session.status).toBe('OPEN')
  })

  it('marks the summer session, a winter session, the holiday, and the weekend', () => {
    expect(exchangeStatus(nyse, new Date('2026-07-02T15:00:00Z')).status).toBe('OPEN')
    expect(exchangeStatus(nyse, new Date('2026-01-15T15:00:00Z'))).toMatchObject({ status: 'OPEN', localTime: '10:00' })
    expect(exchangeStatus(nyse, new Date('2026-01-01T15:00:00Z')).status).toBe('HOLIDAY')
    expect(exchangeStatus(nyse, new Date('2026-07-03T15:00:00Z')).status).toBe('HOLIDAY')
    expect(exchangeStatus(nyse, new Date('2026-10-24T15:00:00Z'))).toMatchObject({ status: 'CLOSED', note: 'WEEKEND' })
  })

  it('closes Tokyo for the lunch break and keeps Riyadh on a Sunday', () => {
    expect(exchangeStatus(jpx, new Date('2026-01-15T03:00:00Z'))).toMatchObject({ status: 'CLOSED', note: 'LUNCH', localTime: '12:00' })
    expect(exchangeStatus(jpx, new Date('2026-01-15T01:00:00Z')).status).toBe('OPEN')
    const sunday = exchangeStatus(tadawul, new Date('2026-01-11T08:00:00Z'))
    expect(sunday.status).toBe('OPEN')
    expect(sunday.localTime).toBe('11:00')
  })
})

describe('quote labels', () => {
  const csv = 'Symbol,Date,Time,Open,High,Low,Close,Volume\naapl.us,2026-10-24,16:00:00,100,110,90,105,1000\n'
  const fred = 'observation_date,value\n2026-10-22,5800.1\n2026-10-23,.\n2026-10-24,5810.5\n'

  it('parses Stooq, FRED, Kraken, Coinbase, and Frankfurter', () => {
    expect(parseStooqQuote(csv)?.close).toBe(105)
    expect(parseStooqQuote('<html>This site requires JavaScript to verify your browser</html>')).toBeNull()
    expect(looksLikeHtml('<html></html>')).toBe(true)
    expect(parseStooqDaily('Date,Open,High,Low,Close,Volume\n2026-10-23,1,2,0,4,9\n')).toHaveLength(1)
    expect(parseFredCsv(fred).map((point) => point.v)).toEqual([5800.1, 5810.5])
    expect(parseKrakenTicker({ result: { XXBTZUSD: { c: ['80886.9'], o: '80000' } } })?.price).toBe(80886.9)
    expect(parseCoinbaseSpot({ data: { amount: '2382.455' } })).toBe(2382.455)
    expect(parseFrankfurterLatest({ date: '2026-10-23', rates: { EUR: 0.89342, JPY: 156.8 } })?.rates.JPY).toBe(156.8)
    expect(parseCoinbaseCandles([[1700000000, 1, 3, 2, 2.5, 10]])).toEqual([
      { t: 1700000000000, v: 2.5, date: '2023-11-14' },
    ])
  })

  it('labels live crypto, delayed Stooq, and end-of-day FRED without inventing a clock', () => {
    const now = Date.parse('2026-10-24T20:00:00Z')
    expect(labelQuote({ source: 'kraken', now })).toMatchObject({ quality: 'LIVE', note: 'FETCH' })
    expect(labelQuote({ source: 'stooq', now, quoteDate: '2026-10-24', quoteTime: '16:00:00' })).toMatchObject({
      quality: 'DELAYED',
      delayMin: 15,
    })
    expect(labelQuote({ source: 'stooq', now, quoteDate: '2026-10-23' }).quality).toBe('EOD')
    expect(labelQuote({ source: 'fred', now, observed: '2026-10-24' })).toMatchObject({ quality: 'EOD', stamp: '2026-10-24' })
    expect(labelQuote({ source: 'frankfurter', now, observed: '2026-10-23' })).toMatchObject({ quality: 'EOD', stamp: '2026-10-23' })
    expect(labelQuote({ source: 'finnhub', now, exchangeTs: Math.floor(now / 1000) - 30 }).quality).toBe('LIVE')
    expect(labelQuote({ source: 'finnhub', now }).quality).toBe('DELAYED')
    expect(labelQuote({ source: 'alpha', now, exchangeTs: now - 10 * 60000 })).toMatchObject({ quality: 'DELAYED', delayMin: 10 })
    expect(labelQuote({ source: 'twelve', now, exchangeTs: now - 40 * 60000 }).quality).toBe('EOD')
    expect(changeFrom(5810.5, 5800.1).change).toBeCloseTo(10.4)
  })

  it('slices a daily series and skips movers that have no change', () => {
    const points = [
      { t: Date.parse('2026-10-20T00:00:00Z'), v: 1 },
      { t: Date.parse('2026-10-23T00:00:00Z'), v: 2 },
      { t: Date.parse('2026-10-24T00:00:00Z'), v: 3 },
    ]
    expect(sliceChart(points, '1D', Date.parse('2026-10-24T20:00:00Z'))).toHaveLength(1)
    expect(sliceChart(points, '5D', Date.parse('2026-10-24T20:00:00Z'))).toHaveLength(3)
    expect(movers([{ name: 'A', percent: null }, { name: 'B', percent: null }])).toBeNull()
    expect(movers([{ name: 'A', percent: 1 }, { name: 'B', percent: -4 }])?.map((row) => row.name)).toEqual(['B', 'A'])
  })
})

describe('news parsers', () => {
  const rss = `<?xml version="1.0"?><rss><channel><item>
    <title><![CDATA[Markets open &amp; close]]></title>
    <link>https://example.com/a</link>
    <description><![CDATA[<p>Short snippet here.</p>]]></description>
    <pubDate>Fri, 24 Oct 2026 03:00:00 GMT</pubDate>
    </item></channel></rss>`

  it('reads RSS and GDELT without inventing a headline', () => {
    const rows = parseRss(rss, 'BBC World', 'GB')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ title: 'Markets open & close', link: 'https://example.com/a', country: 'GB' })
    expect(rows[0].snippet).toContain('Short snippet')
    expect(parseRss('<rss></rss>', 'BBC World')).toEqual([])
    const articles = parseGdeltArtList({
      articles: [{ url: 'https://example.com/g', title: 'Port strike', seendate: '20261024030100', domain: 'example.com', sourcecountry: 'US' }],
    })
    expect(articles[0]).toMatchObject({ title: 'Port strike', time: '2026-10-24 03:01:00Z', country: 'US', source: 'example.com' })
    const geo = parseGdeltGeo({
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [-74, 40.7] },
        properties: { name: 'Port strike', html: '<a href="https://example.com/g">Port strike</a>' },
      }],
    })
    expect(geo[0]).toMatchObject({ lat: 40.7, lon: -74, title: 'Port strike', link: 'https://example.com/g', source: 'GDELT' })
    expect(parseGdeltGeo({ features: [{ geometry: { type: 'Point', coordinates: [0, 0] }, properties: {} }] })).toEqual([])
  })

  it('labels outlet-country pins and filters a search', () => {
    const pins = countryMarkers([
      { country: 'GB', title: 'One', source: 'BBC World' },
      { country: 'GB', title: 'Two', source: 'BBC World' },
      { country: '', title: 'Skip', source: 'RSS' },
    ])
    expect(pins).toHaveLength(1)
    expect(pins[0].detail).toBe('OUTLET COUNTRY · 2 · BBC World')
    expect(pins[0].title).toBe('One')
    const headlines = parseRss(rss, 'BBC World', 'GB')
    expect(filterHeadlines(headlines, 'markets')).toHaveLength(1)
    expect(filterHeadlines(headlines, 'zzzz')).toHaveLength(0)
  })
})

describe('tabs and camera wall', () => {
  it('keeps the open camera and the news query when the tab changes', () => {
    const next = switchTab(desk, 'stocks')
    expect(next).toMatchObject({ tab: 'stocks', cameraId: 'cam:wi:1', newsQuery: 'port', watchlist: ['AAPL'] })
    expect(desk.tab).toBe('globe')
    expect(tabFromShortcut('2')).toBe('cameras')
    expect(tabFromShortcut('a')).toBeNull()
  })

  it('filters the wall and caps streams so the viewer owns the selected camera', () => {
    const rows = [
      cam({ id: 'a', source: 'wi', mode: 'hls', name: 'County B', road: 'I-39', lat: 43, lon: -89 }),
      cam({ id: 'b', source: 'tfl', mode: 'mp4', name: 'Billet', agency: 'Transport for London', lat: 51.5, lon: 0 }),
      cam({ id: 'c', source: 'ga', mode: 'snapshot', name: 'Lenox', road: 'SR 13', lat: 33.8, lon: -84.3 }),
      cam({ id: 'd', source: 'nyc', mode: 'offline', name: 'Closed', online: false }),
      cam({ id: 'e', source: 'caltrans', mode: 'hls', name: '20th St', lat: 34, lon: -118 }),
      cam({ id: 'f', source: 'fl', mode: 'mjpeg', name: 'Bay', lat: 25.7, lon: -80.2 }),
      cam({ id: 'g', source: 'az', mode: 'hls', name: 'Extra', lat: 33.4, lon: -112 }),
    ]
    expect(filterCams(rows, { text: 'london' }).map((row) => row.id)).toEqual(['b'])
    expect(filterCams(rows, { mode: 'live' }).map((row) => row.id)).toEqual(['a', 'e', 'f', 'g'])
    expect(filterCams(rows, { region: 'US East', mode: 'snapshot' }).map((row) => row.id)).toEqual(['c'])
    expect(filterCams(rows, { text: 'closed' })).toEqual([])
    const visible = rows.filter((row) => row.online).slice(0, 9)
    expect(streamingIds(visible, 'a', 9)).toEqual(['b', 'e', 'f'])
    expect(streamingIds(visible, 'a', 1)).toEqual([])
    expect(streamingIds(visible, null, 4)).toEqual(['a', 'b', 'e'])
  })
})
