const UA = 'AllEyes/4.0.0 (local educational globe; https://github.com/rizxe134/All-Eyes)'

/** @type {Map<string, { exp: number, status: number, type: string, body: Buffer }>} */
const cache = new Map()

const FEEDS = {
  bbc: 'https://feeds.bbci.co.uk/news/world/rss.xml',
  aljazeera: 'https://www.aljazeera.com/xml/rss/all.xml',
  npr: 'https://feeds.npr.org/1004/rss.xml',
  guardian: 'https://www.theguardian.com/world/rss',
  dw: 'https://rss.dw.com/rdf/rss-en-world',
  france24: 'https://www.france24.com/en/rss',
}

const FRED = new Set(['SP500', 'DJIA', 'NASDAQCOM', 'NASDAQ100', 'NIKKEI225', 'DCOILWTICO'])
const FX = new Set(['EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'CNY', 'INR', 'BRL', 'MXN', 'ZAR', 'KRW', 'SGD', 'HKD', 'SEK', 'NOK'])
const COINS = new Set(['BTC-USD', 'ETH-USD', 'SOL-USD'])
const KRAKEN = new Set(['XBTUSD', 'XXBTZUSD', 'ETHUSD', 'XETHZUSD', 'SOLUSD'])
const GRAN = new Set(['60', '300', '900', '3600', '21600', '86400'])

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {string} name
 */
function header(req, name) {
  const value = req.headers[name]
  if (Array.isArray(value)) return value[0] ?? ''
  return value ?? ''
}

/**
 * @param {number} status
 * @param {string} message
 * @param {number} [ttl]
 */
function jsonError(status, message, ttl = 4000) {
  return {
    status,
    type: 'application/json; charset=utf-8',
    body: Buffer.from(JSON.stringify({ error: message })),
    exp: Date.now() + ttl,
  }
}

/**
 * @param {string} key
 * @param {number} ttl
 * @param {() => Promise<{ status: number, type: string, body: Buffer }>} load
 */
async function cached(key, ttl, load) {
  const now = Date.now()
  const hit = cache.get(key)
  if (hit && hit.exp > now) return hit
  try {
    const result = await load()
    const entry = {
      status: result.status,
      type: result.type,
      body: result.body,
      exp: now + (result.status >= 200 && result.status < 300 ? ttl : Math.min(ttl, 30000)),
    }
    cache.set(key, entry)
    return entry
  } catch (err) {
    const entry = jsonError(502, err instanceof Error ? err.message : 'fetch failed')
    cache.set(key, entry)
    return entry
  }
}

/**
 * @param {string} url
 * @param {number} ttl
 * @param {string} key
 * @param {Record<string, string>} [headers]
 */
async function pull(url, ttl, key, headers = {}) {
  return cached(key, ttl, async () => {
    const res = await fetch(url, {
      headers: { 'user-agent': UA, accept: '*/*', ...headers },
      signal: AbortSignal.timeout(20000),
    })
    const body = Buffer.from(await res.arrayBuffer())
    return { status: res.status, type: res.headers.get('content-type') || 'application/octet-stream', body }
  })
}

/**
 * @param {string} text
 * @param {number} max
 */
function words(text, max) {
  return text.replace(/[^A-Za-z0-9 .,'-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
}

/**
 * @param {string} csv
 */
function trimCsv(csv) {
  const lines = csv.split(/\r?\n/)
  if (lines.length <= 1500) return csv
  const head = lines[0]
  return [head, ...lines.slice(-1499)].join('\n')
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {URL} url
 */
export async function routeDesk(req, url) {
  const path = url.pathname

  if (path === '/api/desk/rss') {
    const id = url.searchParams.get('feed') || ''
    const target = FEEDS[id]
    if (!target) return jsonError(404, 'unknown feed')
    return pull(target, 120000, `rss:${id}`, { accept: 'application/rss+xml, application/xml, text/xml, */*' })
  }

  if (path === '/api/desk/gdelt') {
    const kind = url.searchParams.get('kind') === 'geo' ? 'geo' : 'doc'
    const q = words(url.searchParams.get('q') || 'world', 80) || 'world'
    const target = kind === 'geo'
      ? `https://api.gdeltproject.org/api/v2/geo/geo?query=${encodeURIComponent(q)}&mode=PointData&format=GeoJSON`
      : `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(q)}&mode=ArtList&format=json&maxrecords=40&sort=DateDesc`
    return pull(target, 120000, `gdelt:${kind}:${q}`)
  }

  if (path === '/api/desk/fred') {
    const id = (url.searchParams.get('id') || '').toUpperCase()
    if (!FRED.has(id)) return jsonError(404, 'unknown series')
    const from = url.searchParams.get('from') || ''
    const cosd = /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : '2021-01-01'
    const hit = await pull(
      `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}&cosd=${cosd}`,
      6 * 60 * 60000,
      `fred:${id}:${cosd}`,
      { accept: 'text/csv' },
    )
    if (hit.status < 200 || hit.status >= 300) return hit
    const text = trimCsv(hit.body.toString('utf8'))
    return { ...hit, type: 'text/csv; charset=utf-8', body: Buffer.from(text) }
  }

  if (path === '/api/desk/stooq') {
    const symbol = (url.searchParams.get('s') || '').toLowerCase()
    if (!/^[a-z0-9.^]{1,24}$/.test(symbol)) return jsonError(400, 'bad symbol')
    const daily = url.searchParams.get('kind') === 'daily'
    const target = daily
      ? `https://stooq.com/q/d/l/?s=${encodeURIComponent(symbol)}&i=d`
      : `https://stooq.com/q/l/?s=${encodeURIComponent(symbol)}&f=sd2t2ohlcv&h&e=csv`
    const hit = await pull(target, 60000, `stooq:${daily ? 'd' : 'l'}:${symbol}`, { accept: 'text/csv,text/plain,*/*' })
    const text = hit.body.toString('utf8')
    if (text.trimStart().startsWith('<') || /javascript to verify/i.test(text.slice(0, 400))) {
      return jsonError(502, 'STOOQ BROWSER CHECK', 60000)
    }
    return hit
  }

  if (path === '/api/desk/crypto') {
    const venue = url.searchParams.get('venue') || ''
    if (venue === 'kraken') {
      const pair = (url.searchParams.get('pair') || '').toUpperCase()
      if (!KRAKEN.has(pair)) return jsonError(400, 'bad pair')
      return pull(`https://api.kraken.com/0/public/Ticker?pair=${pair}`, 15000, `kraken:${pair}`)
    }
    if (venue === 'coinbase') {
      const product = (url.searchParams.get('product') || '').toUpperCase()
      if (!COINS.has(product)) return jsonError(400, 'bad product')
      return pull(`https://api.coinbase.com/v2/prices/${product}/spot`, 15000, `coin:${product}`)
    }
    return jsonError(404, 'unknown venue')
  }

  if (path === '/api/desk/candles') {
    const product = (url.searchParams.get('product') || '').toUpperCase()
    const gran = url.searchParams.get('granularity') || '86400'
    if (!COINS.has(product) || !GRAN.has(gran)) return jsonError(400, 'bad candles')
    return pull(
      `https://api.exchange.coinbase.com/products/${product}/candles?granularity=${gran}`,
      60000,
      `candles:${product}:${gran}`,
    )
  }

  if (path === '/api/desk/fx') {
    const from = (url.searchParams.get('from') || 'USD').toUpperCase()
    if (!new Set(['USD', 'EUR', 'GBP']).has(from)) return jsonError(400, 'bad base')
    const codes = (url.searchParams.get('to') || 'EUR').toUpperCase().split(',').filter((code) => FX.has(code))
    if (!codes.length) return jsonError(400, 'bad quote')
    const start = url.searchParams.get('start') || ''
    const end = url.searchParams.get('end') || ''
    const span = /^\d{4}-\d{2}-\d{2}$/.test(start) && /^\d{4}-\d{2}-\d{2}$/.test(end)
    const target = span
      ? `https://api.frankfurter.app/${start}..${end}?from=${from}&to=${codes.join(',')}`
      : `https://api.frankfurter.app/latest?from=${from}&to=${codes.join(',')}`
    return pull(target, span ? 6 * 60 * 60000 : 60 * 60000, `fx:${target}`)
  }

  const keyed = keyedRoute(path, url, req)
  if (keyed) return keyed

  return jsonError(404, 'unknown desk')
}

/**
 * @param {string} path
 * @param {URL} url
 * @param {import('node:http').IncomingMessage} req
 */
function keyedRoute(path, url, req) {
  const symbol = (url.searchParams.get('symbol') || url.searchParams.get('q') || '').trim()
  if (path === '/api/desk/newsapi') {
    const key = header(req, 'x-newsapi-key')
    if (!/^[A-Za-z0-9]{8,80}$/.test(key)) return jsonError(404, 'no newsapi key')
    const q = words(symbol || 'world', 80)
    return pull(
      `https://newsapi.org/v2/everything?q=${encodeURIComponent(q)}&pageSize=20&language=en&apiKey=${encodeURIComponent(key)}`,
      120000,
      `newsapi:${key.slice(0, 4)}:${q}`,
    )
  }
  if (path === '/api/desk/gnews') {
    const key = header(req, 'x-gnews-key')
    if (!/^[A-Za-z0-9]{8,80}$/.test(key)) return jsonError(404, 'no gnews key')
    const q = words(symbol || 'world', 80)
    return pull(
      `https://gnews.io/api/v4/search?q=${encodeURIComponent(q)}&lang=en&max=20&token=${encodeURIComponent(key)}`,
      120000,
      `gnews:${key.slice(0, 4)}:${q}`,
    )
  }
  if (!/^[A-Za-z0-9.^:-]{1,16}$/.test(symbol) && path !== '/api/desk/newsapi' && path !== '/api/desk/gnews') {
    if (!path.startsWith('/api/desk/finnhub') && !path.startsWith('/api/desk/twelve') && !path.startsWith('/api/desk/alpha') && !path.startsWith('/api/desk/polygon') && !path.startsWith('/api/desk/fmp')) {
      return null
    }
  }
  if (path === '/api/desk/finnhub') {
    const key = header(req, 'x-finnhub-key')
    if (!/^[A-Za-z0-9]{8,80}$/.test(key)) return jsonError(404, 'no finnhub key')
    if (!/^[A-Za-z0-9.^:-]{1,16}$/.test(symbol)) return jsonError(400, 'bad symbol')
    return pull(
      `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(key)}`,
      60000,
      `finnhub:${key.slice(0, 4)}:${symbol}`,
    )
  }
  if (path === '/api/desk/twelve') {
    const key = header(req, 'x-twelve-key')
    if (!/^[A-Za-z0-9]{8,80}$/.test(key)) return jsonError(404, 'no twelve key')
    if (!/^[A-Za-z0-9.^:-]{1,16}$/.test(symbol)) return jsonError(400, 'bad symbol')
    return pull(
      `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(key)}`,
      60000,
      `twelve:${key.slice(0, 4)}:${symbol}`,
    )
  }
  if (path === '/api/desk/alpha') {
    const key = header(req, 'x-alpha-key')
    if (!/^[A-Za-z0-9]{8,80}$/.test(key)) return jsonError(404, 'no alpha key')
    if (!/^[A-Za-z0-9.^:-]{1,16}$/.test(symbol)) return jsonError(400, 'bad symbol')
    return pull(
      `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(key)}`,
      60000,
      `alpha:${key.slice(0, 4)}:${symbol}`,
    )
  }
  if (path === '/api/desk/polygon') {
    const key = header(req, 'x-polygon-key')
    if (!/^[A-Za-z0-9]{8,80}$/.test(key)) return jsonError(404, 'no polygon key')
    if (!/^[A-Za-z0-9.^:-]{1,16}$/.test(symbol)) return jsonError(400, 'bad symbol')
    return pull(
      `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(symbol)}/prev?adjusted=true&apiKey=${encodeURIComponent(key)}`,
      60000,
      `polygon:${key.slice(0, 4)}:${symbol}`,
    )
  }
  if (path === '/api/desk/fmp') {
    const key = header(req, 'x-fmp-key')
    if (!/^[A-Za-z0-9]{8,80}$/.test(key)) return jsonError(404, 'no fmp key')
    if (!/^[A-Za-z0-9.^:-]{1,16}$/.test(symbol)) return jsonError(400, 'bad symbol')
    return pull(
      `https://financialmodelingprep.com/api/v3/quote/${encodeURIComponent(symbol)}?apikey=${encodeURIComponent(key)}`,
      60000,
      `fmp:${key.slice(0, 4)}:${symbol}`,
    )
  }
  return null
}
