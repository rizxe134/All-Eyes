import type { SettingsStore } from '../core/types'
import { authHeaders } from '../net/http'
import { EXCHANGES, exchangeStatus } from '../desk/exchanges'
import {
  BOARD,
  changeFrom,
  labelQuote,
  movers,
  parseAlphaQuote,
  parseCoinbaseCandles,
  parseCoinbaseSpot,
  parseFinnhubQuote,
  parseFmpQuote,
  parseFrankfurterLatest,
  parseFrankfurterRange,
  parseFredCsv,
  parseKrakenTicker,
  parsePolygonPrev,
  parseStooqDaily,
  parseStooqQuote,
  parseTwelveQuote,
  sliceChart,
  type BoardRow,
  type ChartRange,
  type QuoteLabel,
  type SeriesPoint,
} from '../desk/quotes'

export interface StocksDesk {
  root: HTMLElement
  setActive(on: boolean): void
}

const RANGES: ChartRange[] = ['1D', '5D', '1M', '6M', '1Y', '5Y']
const GRAN: Record<ChartRange, string> = {
  '1D': '300',
  '5D': '3600',
  '1M': '21600',
  '6M': '86400',
  '1Y': '86400',
  '5Y': '86400',
}

interface Shown {
  id: string
  name: string
  price: number | null
  change: number | null
  percent: number | null
  label: QuoteLabel | null
  spark: number[]
  history: SeriesPoint[]
  historyNote: string
  note: string
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

function money(value: number | null, digits: number): string {
  if (value == null || !Number.isFinite(value)) return 'NOT AVAILABLE'
  return value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

function signed(value: number | null, digits: number): string {
  if (value == null || !Number.isFinite(value)) return 'NOT AVAILABLE'
  const text = value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
  return value > 0 ? `+${text}` : text
}

function digitsFor(id: string): number {
  if (id === 'jpy') return 2
  if (id === 'eur' || id === 'gbp') return 4
  if (id === 'btc') return 0
  if (id === 'eth') return 2
  return 2
}

function drawLine(canvas: HTMLCanvasElement, values: number[], width: number, height: number) {
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  canvas.width = Math.floor(width * dpr)
  canvas.height = Math.floor(height * dpr)
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, width, height)
  ctx.strokeStyle = '#3dff7a'
  ctx.lineWidth = 2
  if (values.length < 2) {
    ctx.fillStyle = '#6d8f78'
    ctx.font = '12px "Ae Term", monospace'
    ctx.fillText('NO SERIES', 8, height / 2)
    return
  }
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  ctx.beginPath()
  values.forEach((value, index) => {
    const x = (index / (values.length - 1)) * (width - 8) + 4
    const y = height - 4 - ((value - min) / span) * (height - 8)
    if (index === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  })
  ctx.stroke()
}

export function mountStocksDesk(host: HTMLElement, settings: SettingsStore): StocksDesk {
  host.classList.add('ae-stockdesk')
  const boards = el('section', 'ae-stock-ex')
  const boardTitle = el('h2', 'ae-desk-h', 'EXCHANGES')
  const boardNote = el('p', 'ae-desk-foot', 'Local time and OPEN / CLOSED / PRE / POST / HOLIDAY use the built-in 2026–2027 calendar, not a live exchange feed.')
  const boardGrid = el('div', 'ae-exgrid')
  boards.append(boardTitle, boardGrid, boardNote)

  const quoteTitle = el('h2', 'ae-desk-h', 'MARKETS')
  const quoteGrid = el('div', 'ae-quotegrid')
  const moversBox = el('section', 'ae-movers')
  const moverTitle = el('h2', 'ae-desk-h', 'TOP MOVERS')
  const moverList = el('div', 'ae-moverlist', 'MOVERS NEED A CHANGE FIELD')
  moversBox.append(moverTitle, moverList)

  const watch = el('section', 'ae-watchlist')
  const watchTitle = el('h2', 'ae-desk-h', 'WATCHLIST')
  const watchForm = document.createElement('form')
  watchForm.className = 'ae-deskbar'
  const watchInput = document.createElement('input')
  watchInput.className = 'ae-desk-search'
  watchInput.placeholder = 'Add ticker'
  watchInput.maxLength = 16
  watchInput.setAttribute('aria-label', 'Add ticker')
  const add = button('ADD')
  add.type = 'submit'
  watchForm.append(watchInput, add)
  const watchList = el('div', 'ae-quotegrid')
  watch.append(watchTitle, watchForm, watchList)

  const chartBox = el('section', 'ae-chart')
  const chartTitle = el('h2', 'ae-desk-h', 'CHART')
  const ranges = el('div', 'ae-deskbar')
  const rangeButtons = RANGES.map((range) => {
    const node = button(range)
    if (range === '1M') node.classList.add('is-on')
    return node
  })
  ranges.append(...rangeButtons)
  const chartNote = el('div', 'ae-desk-note', 'SELECT A SYMBOL')
  const chart = document.createElement('canvas')
  chart.className = 'ae-chart-canvas'
  chartBox.append(chartTitle, ranges, chartNote, chart)

  const foot = el(
    'p',
    'ae-desk-foot',
    'Keyless: FRED is EOD with the observation date. Frankfurter FX is EOD with its date. Kraken and Coinbase crypto are LIVE at fetch time, because those public tickers do not include an exchange timestamp. Stooq is DELAYED 15 minutes on the session date and EOD otherwise; a browser check comes back as STOOQ BROWSER CHECK and is not parsed as a price. Finnhub, Twelve Data, Alpha Vantage, Polygon, and FMP run only when a key is saved in CFG on the GLOBE tab. No price is filled in.',
  )
  host.append(boards, quoteTitle, quoteGrid, moversBox, watch, chartBox, foot)

  const shown = new Map<string, Shown>()
  let active = false
  let timer = 0
  let cryptoTimer = 0
  let clockTimer = 0
  let selected = 'btc'
  let range: ChartRange = '1M'
  let backoff = 0

  function blank(id: string, name: string, note = ''): Shown {
    return { id, name, price: null, change: null, percent: null, label: null, spark: [], history: [], historyNote: '', note }
  }

  function put(row: Shown) {
    shown.set(row.id, row)
    paintQuotes()
    if (row.id === selected) paintChart()
  }

  function paintBoards() {
    const now = new Date()
    boardGrid.replaceChildren()
    for (const ex of EXCHANGES) {
      const session = exchangeStatus(ex, now)
      const card = el('div', `ae-ex is-${session.status.toLowerCase()}`)
      const note = session.note && session.note !== 'HOLIDAY' ? `${session.status} · ${session.note}` : session.status
      card.append(el('strong', '', ex.name), el('span', '', ex.city), el('span', '', session.localTime), el('em', '', note))
      boardGrid.append(card)
    }
  }

  function card(row: Shown): HTMLElement {
    const node = document.createElement('button')
    node.className = 'ae-quote' + (row.id === selected ? ' is-on' : '')
    node.type = 'button'
    const digits = digitsFor(row.id)
    const quality = row.label ? `${row.label.quality}${row.label.delayMin != null ? ` ${row.label.delayMin}m` : ''}` : 'NO QUOTE'
    const stamp = row.label?.stamp ? ` · ${row.label.note} ${row.label.stamp}` : ''
    node.append(el('strong', '', row.name))
    node.append(el('span', 'ae-quote-px', row.price == null ? row.note || 'NO KEYLESS QUOTE' : money(row.price, digits)))
    node.append(el('span', '', `${signed(row.change, digits)}  ${signed(row.percent, 2)}%`))
    node.append(el('span', 'ae-quote-q', `${quality}${stamp}`))
    const spark = document.createElement('canvas')
    spark.className = 'ae-spark'
    node.append(spark)
    node.addEventListener('click', () => {
      selected = row.id
      paintQuotes()
      void loadHistory(row.id)
      paintChart()
    })
    requestAnimationFrame(() => drawLine(spark, row.spark, 120, 36))
    return node
  }

  function paintQuotes() {
    quoteGrid.replaceChildren()
    for (const row of BOARD) quoteGrid.append(card(shown.get(row.id) ?? blank(row.id, row.name)))
    watchList.replaceChildren()
    for (const ticker of settings.get().watchlist) {
      watchList.append(card(shown.get(`w:${ticker}`) ?? blank(`w:${ticker}`, ticker)))
    }
    const ranked = movers([...shown.values()].map((row) => ({ name: row.name, percent: row.percent })))
    moverList.replaceChildren()
    if (!ranked) {
      moverList.textContent = 'MOVERS NEED A CHANGE FIELD'
      return
    }
    for (const row of ranked) {
      moverList.append(el('div', '', `${row.name}  ${signed(row.percent, 2)}%`))
    }
  }

  function paintChart() {
    const row = shown.get(selected)
    chartTitle.textContent = row ? `CHART ${row.name}` : 'CHART'
    const points = row ? sliceChart(row.history, range, Date.now()) : []
    const eod = row?.historyNote === 'EOD' || row?.label?.quality === 'EOD'
    chartNote.textContent = !row
      ? 'SELECT A SYMBOL'
      : points.length
        ? `${row.label?.quality ?? 'NO QUOTE'} · ${eod ? 'EOD' : row.historyNote || row.label?.note || ''} · ${points.length} POINTS`
        : row.note || 'NO KEYLESS HISTORY'
    drawLine(chart, points.map((point) => point.v), Math.max(280, host.clientWidth - 40), 180)
  }

  async function fromStooq(symbol: string): Promise<{ price: number; prior: number | null; label: QuoteLabel; history: SeriesPoint[]; note: string } | { error: string } | null> {
    const last = await pull(`/api/desk/stooq?s=${encodeURIComponent(symbol)}&kind=last`, settings)
    if (!last.ok) {
      let error = `STOOQ ${last.status}`
      try {
        const body = JSON.parse(last.text) as { error?: string }
        if (body.error) error = body.error
      } catch {
        /* keep status */
      }
      return { error }
    }
    const quote = parseStooqQuote(last.text)
    if (!quote) return { error: 'STOOQ UNREADABLE' }
    const daily = await pull(`/api/desk/stooq?s=${encodeURIComponent(symbol)}&kind=daily`, settings)
    const history = daily.ok ? parseStooqDaily(daily.text) : []
    const prior = history.length >= 2 ? history[history.length - 2].v : quote.open
    return {
      price: quote.close,
      prior,
      label: labelQuote({ source: 'stooq', now: Date.now(), quoteDate: quote.date, quoteTime: quote.time }),
      history,
      note: '',
    }
  }

  async function fromFred(id: string): Promise<Shown | null> {
    const from = new Date(Date.now() - 1830 * 86400000).toISOString().slice(0, 10)
    const hit = await pull(`/api/desk/fred?id=${id}&from=${from}`, settings)
    if (!hit.ok) return null
    const history = parseFredCsv(hit.text)
    if (!history.length) return null
    const last = history[history.length - 1]
    const prior = history.length >= 2 ? history[history.length - 2].v : null
    const moved = changeFrom(last.v, prior)
    return {
      id: '',
      name: '',
      price: last.v,
      change: moved.change,
      percent: moved.percent,
      label: labelQuote({ source: 'fred', now: Date.now(), observed: last.date }),
      spark: history.slice(-40).map((point) => point.v),
      history,
      historyNote: 'EOD',
      note: '',
    }
  }

  async function keyed(symbol: string): Promise<Partial<Shown> | null> {
    const current = settings.get()
    const now = Date.now()
    if (current.finnhubKey) {
      const hit = await pull(`/api/desk/finnhub?symbol=${encodeURIComponent(symbol)}`, settings)
      if (hit.ok) {
        const quote = parseFinnhubQuote(safeJson(hit.text))
        if (quote) {
          return {
            price: quote.price,
            change: quote.change,
            percent: quote.percent,
            label: labelQuote({ source: 'finnhub', now, exchangeTs: quote.ts }),
            note: '',
          }
        }
      }
    }
    if (current.twelveKey) {
      const hit = await pull(`/api/desk/twelve?symbol=${encodeURIComponent(symbol)}`, settings)
      if (hit.ok) {
        const quote = parseTwelveQuote(safeJson(hit.text))
        if (quote) {
          return {
            price: quote.price,
            change: quote.change,
            percent: quote.percent,
            label: labelQuote({ source: 'twelve', now, exchangeTs: quote.ts }),
          }
        }
      }
    }
    if (current.alphaKey) {
      const hit = await pull(`/api/desk/alpha?symbol=${encodeURIComponent(symbol)}`, settings)
      if (hit.ok) {
        const quote = parseAlphaQuote(safeJson(hit.text))
        if (quote) {
          return {
            price: quote.price,
            change: quote.change,
            percent: quote.percent,
            label: labelQuote({ source: 'alpha', now, observed: quote.date }),
          }
        }
      }
    }
    if (current.polygonKey) {
      const hit = await pull(`/api/desk/polygon?symbol=${encodeURIComponent(symbol)}`, settings)
      if (hit.ok) {
        const quote = parsePolygonPrev(safeJson(hit.text))
        if (quote) {
          return { price: quote.price, label: labelQuote({ source: 'polygon', now, exchangeTs: quote.ts }) }
        }
      }
    }
    if (current.fmpKey) {
      const hit = await pull(`/api/desk/fmp?symbol=${encodeURIComponent(symbol)}`, settings)
      if (hit.ok) {
        const quote = parseFmpQuote(safeJson(hit.text))
        if (quote) {
          return {
            price: quote.price,
            change: quote.change,
            percent: quote.percent,
            label: labelQuote({ source: 'fmp', now, exchangeTs: quote.ts }),
          }
        }
      }
    }
    return null
  }

  async function loadBoard(row: BoardRow) {
    const next = blank(row.id, row.name)
    try {
      if (row.kind === 'crypto' && row.kraken && row.coinbase) {
        const ticker = await pull(`/api/desk/crypto?venue=kraken&pair=${row.kraken}`, settings)
        const parsed = ticker.ok ? parseKrakenTicker(safeJson(ticker.text)) : null
        let price = parsed?.price ?? null
        let prior = parsed?.open ?? null
        let source: 'kraken' | 'coinbase' = 'kraken'
        if (price == null) {
          const spot = await pull(`/api/desk/crypto?venue=coinbase&product=${row.coinbase}`, settings)
          price = spot.ok ? parseCoinbaseSpot(safeJson(spot.text)) : null
          prior = null
          source = 'coinbase'
        }
        if (price == null) {
          next.note = 'NO KEYLESS QUOTE'
          put(next)
          return
        }
        const moved = changeFrom(price, prior)
        const candles = await pull(`/api/desk/candles?product=${row.coinbase}&granularity=86400`, settings)
        const history = candles.ok ? parseCoinbaseCandles(safeJson(candles.text)) : []
        put({
          ...next,
          price,
          change: moved.change,
          percent: moved.percent,
          label: labelQuote({ source, now: Date.now() }),
          spark: history.slice(-40).map((point) => point.v),
          history,
          historyNote: source === 'coinbase' && moved.change == null ? 'CHANGE NOT AVAILABLE' : 'LIVE',
        })
        return
      }
      if (row.fx) {
        const base = row.fx === 'JPY' ? 'USD' : row.fx
        const quote = row.fx === 'JPY' ? 'JPY' : 'USD'
        const latest = await pull(`/api/desk/fx?from=${base}&to=${quote}`, settings)
        const parsed = latest.ok ? parseFrankfurterLatest(safeJson(latest.text)) : null
        const price = parsed?.rates[quote] ?? null
        if (price == null || !parsed) {
          next.note = 'NO KEYLESS QUOTE'
          put(next)
          return
        }
        const end = parsed.date
        const start = new Date(Date.parse(`${end}T00:00:00Z`) - 40 * 86400000).toISOString().slice(0, 10)
        const series = await pull(`/api/desk/fx?from=${base}&to=${quote}&start=${start}&end=${end}`, settings)
        const history = series.ok ? parseFrankfurterRange(safeJson(series.text), quote) : []
        const prior = history.length >= 2 ? history[history.length - 2].v : null
        const moved = changeFrom(price, prior)
        put({
          ...next,
          price,
          change: moved.change,
          percent: moved.percent,
          label: labelQuote({ source: 'frankfurter', now: Date.now(), observed: parsed.date }),
          spark: history.map((point) => point.v),
          history,
          historyNote: 'EOD',
        })
        return
      }
      let stooqNote = ''
      if (row.stooq) {
        const hit = await fromStooq(row.stooq)
        if (hit && 'price' in hit) {
          const moved = changeFrom(hit.price, hit.prior)
          put({
            ...next,
            price: hit.price,
            change: moved.change,
            percent: moved.percent,
            label: hit.label,
            spark: hit.history.slice(-40).map((point) => point.v),
            history: hit.history,
            historyNote: 'EOD',
          })
          return
        }
        if (hit && 'error' in hit) stooqNote = hit.error
      }
      if (row.fred) {
        const fred = await fromFred(row.fred)
        if (fred) {
          put({ ...fred, id: row.id, name: row.name, note: stooqNote })
          return
        }
      }
      const extra = row.stooq ? await keyed(row.stooq) : null
      if (extra?.price != null) {
        put({ ...next, ...extra, price: extra.price, note: stooqNote })
        return
      }
      next.note = stooqNote || 'NO KEYLESS QUOTE'
      put(next)
    } catch {
      next.note = 'QUOTE FAILED'
      put(next)
      backoff = Date.now() + 120000
    }
  }

  async function loadTicker(ticker: string) {
    const id = `w:${ticker}`
    const next = blank(id, ticker)
    const symbols = ticker.includes('.') ? [ticker.toLowerCase()] : [`${ticker.toLowerCase()}.us`, ticker.toLowerCase()]
    let stooqNote = ''
    for (const symbol of symbols) {
      const hit = await fromStooq(symbol)
      if (hit && 'price' in hit) {
        const moved = changeFrom(hit.price, hit.prior)
        put({
          ...next,
          price: hit.price,
          change: moved.change,
          percent: moved.percent,
          label: hit.label,
          spark: hit.history.slice(-40).map((point) => point.v),
          history: hit.history,
          historyNote: 'EOD',
        })
        return
      }
      if (hit && 'error' in hit) stooqNote = hit.error
    }
    const extra = await keyed(ticker)
    if (extra?.price != null) {
      put({ ...next, ...extra, price: extra.price })
      return
    }
    next.note = stooqNote || 'NO KEYLESS QUOTE'
    put(next)
  }

  async function loadHistory(id: string) {
    const row = BOARD.find((item) => item.id === id)
    const current = shown.get(id)
    if (!row?.coinbase) {
      if (current) paintChart()
      return
    }
    const hit = await pull(`/api/desk/candles?product=${row.coinbase}&granularity=${GRAN[range]}`, settings)
    if (!hit.ok || !current) return
    const history = parseCoinbaseCandles(safeJson(hit.text))
    if (!history.length) return
    put({ ...current, history, spark: history.slice(-40).map((point) => point.v), historyNote: 'COINBASE' })
  }

  async function loadAll() {
    if (!active || Date.now() < backoff) return
    paintBoards()
    await Promise.all(BOARD.map((row) => loadBoard(row)))
    await Promise.all(settings.get().watchlist.map((ticker) => loadTicker(ticker)))
  }

  function arm() {
    clearInterval(timer)
    clearInterval(cryptoTimer)
    clearInterval(clockTimer)
    if (!active) return
    clockTimer = window.setInterval(paintBoards, 30000)
    timer = window.setInterval(() => void loadAll(), 60000)
    cryptoTimer = window.setInterval(() => {
      for (const row of BOARD) if (row.kind === 'crypto') void loadBoard(row)
    }, 15000)
  }

  watchForm.addEventListener('submit', (event) => {
    event.preventDefault()
    const ticker = watchInput.value.trim().toUpperCase()
    if (!/^[A-Z0-9.^]{1,16}$/.test(ticker)) return
    const cur = settings.get().watchlist.filter((item) => item !== ticker)
    settings.update({ watchlist: [ticker, ...cur].slice(0, 40) })
    watchInput.value = ''
    void loadTicker(ticker)
  })
  rangeButtons.forEach((node, index) => {
    node.addEventListener('click', () => {
      range = RANGES[index]
      for (const other of rangeButtons) other.classList.toggle('is-on', other === node)
      void loadHistory(selected)
      paintChart()
    })
  })

  paintBoards()
  paintQuotes()

  return {
    root: host,
    setActive(on: boolean) {
      active = on
      if (!on) {
        clearInterval(timer)
        clearInterval(cryptoTimer)
        clearInterval(clockTimer)
        return
      }
      backoff = 0
      void loadAll()
      arm()
    },
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}
