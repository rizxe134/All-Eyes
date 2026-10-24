/** Quote parsers and honest LIVE / DELAYED / EOD labels. Prices come only from a parsed feed. */

export type QuoteQuality = 'LIVE' | 'DELAYED' | 'EOD'
export type ChartRange = '1D' | '5D' | '1M' | '6M' | '1Y' | '5Y'
export type BoardKind = 'index' | 'future' | 'fx' | 'crypto' | 'commodity'

export interface QuoteLabel {
  quality: QuoteQuality
  delayMin: number | null
  stamp: string
  note: string
}

export interface StooqQuote {
  symbol: string
  date: string
  time: string
  open: number | null
  high: number | null
  low: number | null
  close: number
  volume: number | null
}

export interface SeriesPoint {
  t: number
  v: number
  date: string
}

export interface BoardRow {
  id: string
  name: string
  kind: BoardKind
  fred?: string
  stooq?: string
  kraken?: string
  coinbase?: string
  fx?: string
}

export const BOARD: readonly BoardRow[] = [
  { id: 'spx', name: 'S&P 500', kind: 'index', fred: 'SP500', stooq: '^spx' },
  { id: 'djia', name: 'Dow', kind: 'index', fred: 'DJIA', stooq: '^dji' },
  { id: 'comp', name: 'Nasdaq Comp', kind: 'index', fred: 'NASDAQCOM', stooq: '^ndq' },
  { id: 'ndx', name: 'Nasdaq 100', kind: 'index', fred: 'NASDAQ100', stooq: '^ndx' },
  { id: 'rut', name: 'Russell 2000', kind: 'index', stooq: '^rut' },
  { id: 'tsx', name: 'TSX', kind: 'index', stooq: '^tsx' },
  { id: 'bov', name: 'Bovespa', kind: 'index', stooq: '^bvsp' },
  { id: 'ftse', name: 'FTSE 100', kind: 'index', stooq: '^ukx' },
  { id: 'dax', name: 'DAX', kind: 'index', stooq: '^dax' },
  { id: 'cac', name: 'CAC 40', kind: 'index', stooq: '^cac' },
  { id: 'stoxx', name: 'Euro Stoxx 50', kind: 'index', stooq: '^stoxx50e' },
  { id: 'n225', name: 'Nikkei 225', kind: 'index', fred: 'NIKKEI225', stooq: '^nkx' },
  { id: 'hsi', name: 'Hang Seng', kind: 'index', stooq: '^hsi' },
  { id: 'ssec', name: 'Shanghai Comp', kind: 'index', stooq: '^shc' },
  { id: 'sensex', name: 'Sensex', kind: 'index', stooq: '^snx' },
  { id: 'nifty', name: 'Nifty', kind: 'index', stooq: '^nsei' },
  { id: 'kospi', name: 'KOSPI', kind: 'index', stooq: '^kospi' },
  { id: 'asx', name: 'ASX 200', kind: 'index', stooq: '^aor' },
  { id: 'es', name: 'ES futures', kind: 'future', stooq: 'es.f' },
  { id: 'nq', name: 'NQ futures', kind: 'future', stooq: 'nq.f' },
  { id: 'eur', name: 'EUR/USD', kind: 'fx', fx: 'EUR' },
  { id: 'gbp', name: 'GBP/USD', kind: 'fx', fx: 'GBP' },
  { id: 'jpy', name: 'USD/JPY', kind: 'fx', fx: 'JPY' },
  { id: 'btc', name: 'Bitcoin', kind: 'crypto', kraken: 'XBTUSD', coinbase: 'BTC-USD' },
  { id: 'eth', name: 'Ether', kind: 'crypto', kraken: 'XETHZUSD', coinbase: 'ETH-USD' },
  { id: 'wti', name: 'WTI', kind: 'commodity', fred: 'DCOILWTICO', stooq: 'cl.f' },
  { id: 'gold', name: 'Gold', kind: 'commodity', stooq: 'xauusd' },
]

export const FRED_SERIES = ['SP500', 'DJIA', 'NASDAQCOM', 'NASDAQ100', 'NIKKEI225', 'DCOILWTICO'] as const

const RANGE_DAYS: Record<ChartRange, number> = {
  '1D': 1,
  '5D': 5,
  '1M': 31,
  '6M': 183,
  '1Y': 366,
  '5Y': 1830,
}

function num(value: string | undefined): number | null {
  if (!value) return null
  const text = value.trim()
  if (!text || text === 'N/A' || text === '.' || text === '-') return null
  const n = Number(text)
  return Number.isFinite(n) ? n : null
}

export function looksLikeHtml(body: string): boolean {
  const text = body.trimStart()
  return text.startsWith('<') || /javascript to verify/i.test(text.slice(0, 400))
}

export function parseStooqQuote(csv: string): StooqQuote | null {
  if (!csv || looksLikeHtml(csv)) return null
  const lines = csv.trim().split(/\r?\n/).filter((line) => line.trim())
  if (lines.length < 2) return null
  const head = lines[0].toLowerCase()
  if (!head.includes('close') && !head.includes('symbol')) return null
  const cells = lines[1].split(',')
  if (cells.length < 7) return null
  const close = num(cells[6])
  if (close == null) return null
  return {
    symbol: cells[0].trim(),
    date: cells[1].trim(),
    time: cells[2].trim(),
    open: num(cells[3]),
    high: num(cells[4]),
    low: num(cells[5]),
    close,
    volume: num(cells[7]),
  }
}

export function parseStooqDaily(csv: string): SeriesPoint[] {
  if (!csv || looksLikeHtml(csv)) return []
  const lines = csv.trim().split(/\r?\n/)
  const out: SeriesPoint[] = []
  for (const line of lines.slice(1)) {
    const cells = line.split(',')
    if (cells.length < 5) continue
    const date = cells[0].trim()
    const close = num(cells[4])
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || close == null) continue
    out.push({ date, v: close, t: Date.parse(`${date}T00:00:00Z`) })
  }
  return out
}

export function parseFredCsv(csv: string): SeriesPoint[] {
  if (!csv || looksLikeHtml(csv)) return []
  const lines = csv.trim().split(/\r?\n/)
  const out: SeriesPoint[] = []
  for (const line of lines.slice(1)) {
    const cells = line.split(',')
    if (cells.length < 2) continue
    const date = cells[0].trim()
    const value = num(cells[1])
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || value == null) continue
    out.push({ date, v: value, t: Date.parse(`${date}T00:00:00Z`) })
  }
  return out
}

export function parseKrakenTicker(json: unknown): { price: number; open: number | null } | null {
  if (!json || typeof json !== 'object') return null
  const result = (json as { result?: Record<string, { c?: string[]; o?: string }> }).result
  if (!result) return null
  const row = Object.values(result)[0]
  const price = num(row?.c?.[0])
  if (price == null) return null
  return { price, open: num(row?.o) }
}

export function parseCoinbaseSpot(json: unknown): number | null {
  if (!json || typeof json !== 'object') return null
  return num((json as { data?: { amount?: string } }).data?.amount ?? undefined)
}

export function parseCoinbaseCandles(json: unknown): SeriesPoint[] {
  if (!Array.isArray(json)) return []
  const out: SeriesPoint[] = []
  for (const row of json) {
    if (!Array.isArray(row) || row.length < 5) continue
    const sec = Number(row[0])
    const close = Number(row[4])
    if (!Number.isFinite(sec) || !Number.isFinite(close)) continue
    const t = sec * 1000
    out.push({ t, v: close, date: new Date(t).toISOString().slice(0, 10) })
  }
  out.sort((a, b) => a.t - b.t)
  return out
}

export function parseFrankfurterLatest(json: unknown): { date: string; rates: Record<string, number> } | null {
  if (!json || typeof json !== 'object') return null
  const row = json as { date?: string; rates?: Record<string, number> }
  if (!row.date || !row.rates) return null
  const rates: Record<string, number> = {}
  for (const [code, value] of Object.entries(row.rates)) {
    if (typeof value === 'number' && Number.isFinite(value)) rates[code] = value
  }
  if (!Object.keys(rates).length) return null
  return { date: row.date, rates }
}

export function parseFrankfurterRange(json: unknown, code: string): SeriesPoint[] {
  if (!json || typeof json !== 'object') return []
  const rates = (json as { rates?: Record<string, Record<string, number>> }).rates
  if (!rates) return []
  const out: SeriesPoint[] = []
  for (const [date, bag] of Object.entries(rates)) {
    const value = bag?.[code]
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || typeof value !== 'number') continue
    out.push({ date, v: value, t: Date.parse(`${date}T00:00:00Z`) })
  }
  out.sort((a, b) => a.t - b.t)
  return out
}

export function sessionDate(now: number, timeZone = 'America/New_York'): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(now))
}

function clock(now: number): string {
  return new Date(now).toISOString().slice(11, 19) + 'Z'
}

function ageMinutes(ts: number | null | undefined, now: number): number | null {
  if (ts == null || !Number.isFinite(ts) || ts <= 0) return null
  const ms = ts < 1e12 ? ts * 1000 : ts
  return Math.max(0, (now - ms) / 60000)
}

export interface LabelInput {
  source: 'kraken' | 'coinbase' | 'frankfurter' | 'stooq' | 'fred' | 'finnhub' | 'twelve' | 'alpha' | 'polygon' | 'fmp'
  now: number
  quoteDate?: string | null
  quoteTime?: string | null
  exchangeTs?: number | null
  observed?: string | null
}

/** Never invents a price. The caller already parsed one. */
export function labelQuote(input: LabelInput): QuoteLabel {
  if (input.source === 'kraken' || input.source === 'coinbase') {
    return { quality: 'LIVE', delayMin: null, stamp: clock(input.now), note: 'FETCH' }
  }
  if (input.source === 'frankfurter') {
    return { quality: 'EOD', delayMin: null, stamp: input.observed || input.quoteDate || '', note: 'FRANKFURTER' }
  }
  if (input.source === 'fred') {
    return { quality: 'EOD', delayMin: null, stamp: input.observed || '', note: 'FRED' }
  }
  if (input.source === 'stooq') {
    const today = sessionDate(input.now)
    const delayed = Boolean(input.quoteDate) && input.quoteDate === today
    const stamp = [input.quoteDate, input.quoteTime].filter(Boolean).join(' ')
    return delayed
      ? { quality: 'DELAYED', delayMin: 15, stamp, note: 'STOOQ' }
      : { quality: 'EOD', delayMin: null, stamp, note: 'STOOQ' }
  }
  const age = ageMinutes(input.exchangeTs, input.now)
  if (input.source === 'finnhub' && age == null) {
    return { quality: 'DELAYED', delayMin: null, stamp: 'NOT STAMPED', note: 'FINNHUB' }
  }
  if (age == null) return { quality: 'EOD', delayMin: null, stamp: input.observed || '', note: input.source.toUpperCase() }
  if (age < 2) return { quality: 'LIVE', delayMin: null, stamp: clock(input.now - age * 60000), note: input.source.toUpperCase() }
  if (age < 20) return { quality: 'DELAYED', delayMin: Math.round(age), stamp: clock(input.now - age * 60000), note: input.source.toUpperCase() }
  return { quality: 'EOD', delayMin: Math.round(age), stamp: clock(input.now - age * 60000), note: input.source.toUpperCase() }
}

export function changeFrom(price: number, prior: number | null): { change: number | null; percent: number | null } {
  if (prior == null || !Number.isFinite(prior) || prior === 0) return { change: null, percent: null }
  const change = price - prior
  return { change, percent: (change / prior) * 100 }
}

export function sliceChart<T extends { t: number }>(points: readonly T[], range: ChartRange, now: number): T[] {
  const cut = now - RANGE_DAYS[range] * 86400000
  const sliced = points.filter((point) => point.t >= cut)
  if (sliced.length) return sliced
  const keep = range === '1D' || range === '5D' ? 2 : 1
  return points.slice(-keep)
}

export function parseFinnhubQuote(json: unknown): { price: number; change: number | null; percent: number | null; ts: number | null } | null {
  if (!json || typeof json !== 'object') return null
  const row = json as { c?: number; d?: number; dp?: number; t?: number }
  if (typeof row.c !== 'number' || !Number.isFinite(row.c) || row.c === 0) return null
  return {
    price: row.c,
    change: typeof row.d === 'number' ? row.d : null,
    percent: typeof row.dp === 'number' ? row.dp : null,
    ts: typeof row.t === 'number' && row.t > 0 ? row.t : null,
  }
}

export function parseTwelveQuote(json: unknown): { price: number; change: number | null; percent: number | null; ts: number | null } | null {
  if (!json || typeof json !== 'object') return null
  const row = json as { close?: string; change?: string; percent_change?: string; timestamp?: number }
  const price = num(row.close)
  if (price == null) return null
  return {
    price,
    change: num(row.change),
    percent: num(row.percent_change),
    ts: typeof row.timestamp === 'number' ? row.timestamp : null,
  }
}

export function parseAlphaQuote(json: unknown): { price: number; change: number | null; percent: number | null; date: string } | null {
  if (!json || typeof json !== 'object') return null
  const row = (json as { 'Global Quote'?: Record<string, string> })['Global Quote']
  if (!row) return null
  const price = num(row['05. price'])
  if (price == null) return null
  const percent = num(String(row['10. change percent'] || '').replace('%', ''))
  return { price, change: num(row['09. change']), percent, date: row['07. latest trading day'] || '' }
}

export function parsePolygonPrev(json: unknown): { price: number; ts: number | null } | null {
  if (!json || typeof json !== 'object') return null
  const bar = (json as { results?: { c?: number; t?: number }[] }).results?.[0]
  if (!bar || typeof bar.c !== 'number') return null
  return { price: bar.c, ts: typeof bar.t === 'number' ? bar.t : null }
}

export function parseFmpQuote(json: unknown): { price: number; change: number | null; percent: number | null; ts: number | null } | null {
  const row = Array.isArray(json) ? json[0] : null
  if (!row || typeof row !== 'object') return null
  const price = (row as { price?: number }).price
  if (typeof price !== 'number' || !Number.isFinite(price)) return null
  const change = (row as { change?: number }).change
  const percent = (row as { changesPercentage?: number }).changesPercentage
  const ts = (row as { timestamp?: number }).timestamp
  return {
    price,
    change: typeof change === 'number' ? change : null,
    percent: typeof percent === 'number' ? percent : null,
    ts: typeof ts === 'number' ? ts : null,
  }
}

export function movers<T extends { name: string; percent: number | null }>(rows: readonly T[], limit = 5): T[] | null {
  const scored = rows.filter((row) => row.percent != null && Number.isFinite(row.percent))
  if (!scored.length) return null
  return [...scored].sort((a, b) => Math.abs(b.percent ?? 0) - Math.abs(a.percent ?? 0)).slice(0, limit)
}
