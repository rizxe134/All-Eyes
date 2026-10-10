import type { FlightView } from '../plugins/aircraft/detail'
import { emptyPhoto, requestPhoto, settlePhoto, showPlaceholder, type PhotoFrame } from './photo-state'

export interface FlightPanel {
  root: HTMLElement
  setView(view: FlightView | null): void
  setGraph(samples: { altFt: number; gsKt: number }[]): void
  setRouteOn(on: boolean): void
  onClose(cb: () => void): void
  onView3d(cb: () => void): void
  onRoute(cb: () => void): void
  onFollow(cb: () => void): void
  onShare(cb: () => void): void
  onCopy(cb: () => void): void
  onWatch(cb: () => void): void
  onSpeed(cb: () => void): void
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text) node.textContent = text
  return node
}

export function mountFlightPanel(): FlightPanel {
  const root = el('aside', 'ae-flight')
  root.hidden = true
  const head = el('header', 'ae-flight-head')
  const title = el('div', 'ae-flight-cs', 'FLIGHT')
  const badge = el('span', 'ae-flight-badge', '----')
  const close = el('button', 'ae-btn', 'X') as HTMLButtonElement
  close.type = 'button'
  close.title = 'Close'
  head.append(title, badge, close)

  const photo = el('div', 'ae-flight-photo ae-crt')
  const screen = el('div', 'ae-crt-screen')
  const img = el('img') as HTMLImageElement
  img.alt = ''
  img.hidden = true
  const snow = el('canvas', 'ae-crt-snow') as HTMLCanvasElement
  snow.width = 320
  snow.height = 180
  const placeholder = el('div', 'ae-nophoto', 'NO PHOTO')
  const mask = el('div', 'ae-crt-mask')
  const scan = el('div', 'ae-crt-scan')
  const chroma = el('div', 'ae-crt-chroma')
  screen.append(img, snow, placeholder, mask, scan, chroma)
  const credit = el('a', 'ae-flight-credit', '') as HTMLAnchorElement
  credit.target = '_blank'
  credit.rel = 'noreferrer'
  credit.hidden = true
  photo.append(screen, credit)

  const operator = el('div', 'ae-flight-op', 'NOT AVAILABLE')
  const route = el('div', 'ae-flight-route')
  const from = el('div', 'ae-leg')
  const fromCode = el('strong', '', '----')
  const fromCity = el('span', '', 'NOT AVAILABLE')
  from.append(fromCode, fromCity)
  const bar = el('div', 'ae-progress')
  const barFill = el('i')
  const barPlane = el('b', '', '')
  bar.append(barFill, barPlane)
  const to = el('div', 'ae-leg')
  const toCode = el('strong', '', '----')
  const toCity = el('span', '', 'NOT AVAILABLE')
  to.append(toCode, toCity)
  route.append(from, bar, to)
  const times = el('div', 'ae-flight-times')
  for (const label of ['SCHED', 'ACTUAL', 'EST']) {
    const row = el('div')
    row.append(el('span', '', label), el('span', '', 'NOT AVAILABLE'))
    times.append(row)
  }

  const grid = el('dl', 'ae-flight-grid')
  const graphWrap = el('details', 'ae-flight-graph')
  const graphSum = el('summary', '', 'SPEED & ALTITUDE GRAPH')
  const graph = el('canvas') as HTMLCanvasElement
  graph.width = 600
  graph.height = 180
  const graphNote = el('div', 'ae-flight-note', '')
  graphWrap.append(graphSum, graph, graphNote)

  const actions = el('div', 'ae-flight-actions')
  const actionBar = el('div', 'ae-flight-bar')
  const view3d = action('3D VIEW')
  const routeBtn = action('ROUTE')
  const follow = action('FOLLOW')
  const share = action('SHARE')
  const more = action('MORE')
  more.setAttribute('aria-expanded', 'false')
  actionBar.append(view3d, routeBtn, follow, share, more)
  const menu = el('div', 'ae-flight-menu')
  menu.hidden = true
  const copy = el('button', '', 'COPY DETAILS') as HTMLButtonElement
  const watch = el('button', '', 'ADD TO WATCHLIST') as HTMLButtonElement
  copy.type = 'button'
  watch.type = 'button'
  menu.append(copy, watch)
  actions.append(actionBar, menu)

  const body = el('div', 'ae-flight-body')
  body.append(photo, operator, route, times, grid, graphWrap)
  root.append(head, body, actions)

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  let snowTimer = 0

  function paintSnow(bars: boolean) {
    const ctx = snow.getContext('2d', { alpha: true })
    if (!ctx) return
    const w = snow.width
    const h = snow.height
    ctx.clearRect(0, 0, w, h)
    if (bars) {
      const colors = ['#c8c8c8', '#c8c800', '#00c8c8', '#00c800', '#c800c8', '#c80000', '#0000c8']
      const band = w / colors.length
      for (let i = 0; i < colors.length; i++) {
        ctx.fillStyle = colors[i]!
        ctx.fillRect(i * band, 0, band + 1, h)
      }
    }
    const frame = ctx.getImageData(0, 0, w, h)
    const pixels = frame.data
    const speck = bars ? 90 : 40
    const step = bars ? 8 : 24
    for (let i = 0; i < pixels.length; i += step) {
      const n = (Math.random() * speck) | 0
      const alpha = bars ? 255 : 90 + ((Math.random() * 80) | 0)
      pixels[i] = Math.min(255, (pixels[i] ?? 0) + n)
      pixels[i + 1] = Math.min(255, (pixels[i + 1] ?? 0) + n)
      pixels[i + 2] = Math.min(255, (pixels[i + 2] ?? 0) + n)
      if (!bars) pixels[i + 3] = alpha
    }
    ctx.putImageData(frame, 0, 0)
  }

  let frame: PhotoFrame = emptyPhoto()
  let onLoad: (() => void) | null = null
  let onError: (() => void) | null = null

  function detachPhoto() {
    if (onLoad) img.removeEventListener('load', onLoad)
    if (onError) img.removeEventListener('error', onError)
    onLoad = null
    onError = null
  }

  function syncSnow() {
    const bars = showPlaceholder(frame)
    snow.hidden = !bars
    snow.classList.toggle('is-bars', bars)
    placeholder.hidden = !bars
    img.hidden = bars
    if (!frame.url) img.removeAttribute('src')
    if (snowTimer) window.clearInterval(snowTimer)
    snowTimer = 0
    if (!bars || root.hidden || reduceMotion) return
    paintSnow(true)
    snowTimer = window.setInterval(() => paintSnow(true), 90)
  }

  function showPhoto(url: string) {
    const prevUrl = frame.url
    frame = requestPhoto(frame, url)
    if (!frame.url) {
      detachPhoto()
      syncSnow()
      return
    }
    if (frame.url === prevUrl && img.getAttribute('src') === frame.url && frame.phase !== 'failed') {
      syncSnow()
      return
    }
    const token = frame.token
    detachPhoto()
    const load = () => {
      frame = settlePhoto(frame, token, true)
      syncSnow()
    }
    const error = () => {
      frame = settlePhoto(frame, token, false)
      syncSnow()
    }
    onLoad = load
    onError = error
    img.addEventListener('load', load)
    img.addEventListener('error', error)
    if (img.getAttribute('src') === frame.url) img.removeAttribute('src')
    img.src = frame.url
    syncSnow()
  }

  const hooks = {
    close: [] as Array<() => void>,
    view3d: [] as Array<() => void>,
    route: [] as Array<() => void>,
    follow: [] as Array<() => void>,
    share: [] as Array<() => void>,
    copy: [] as Array<() => void>,
    watch: [] as Array<() => void>,
    speed: [] as Array<() => void>,
  }
  close.addEventListener('click', () => hooks.close.forEach((fn) => fn()))
  view3d.addEventListener('click', () => hooks.view3d.forEach((fn) => fn()))
  routeBtn.addEventListener('click', () => hooks.route.forEach((fn) => fn()))
  follow.addEventListener('click', () => hooks.follow.forEach((fn) => fn()))
  share.addEventListener('click', () => hooks.share.forEach((fn) => fn()))
  function setMenu(open: boolean) {
    menu.hidden = !open
    more.setAttribute('aria-expanded', open ? 'true' : 'false')
  }
  more.addEventListener('click', () => setMenu(menu.hidden))
  copy.addEventListener('click', () => {
    setMenu(false)
    hooks.copy.forEach((fn) => fn())
  })
  watch.addEventListener('click', () => {
    setMenu(false)
    hooks.watch.forEach((fn) => fn())
  })
  document.addEventListener('pointerdown', (event) => {
    if (menu.hidden) return
    const target = event.target
    if (target instanceof Node && actions.contains(target)) return
    setMenu(false)
  })
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setMenu(false)
  })

  function paint(view: FlightView | null) {
    root.hidden = !view
    root.classList.toggle('is-open', Boolean(view))
    if (!view) {
      showPhoto('')
      return
    }
    title.textContent = view.callsign
    badge.textContent = view.typeCode
    operator.textContent = view.operator
    fromCode.textContent = view.originCode
    fromCity.textContent = view.originCity
    toCode.textContent = view.destCode
    toCity.textContent = view.destCity
    const p = view.progress
    barFill.style.width = p == null ? '0%' : `${Math.round(p * 100)}%`
    barPlane.style.left = p == null ? '50%' : `${Math.round(p * 100)}%`
    grid.replaceChildren()
    for (const row of view.rows) {
      const dt = el('dt', '', row.k)
      const dd = el('dd', '', row.v)
      if (row.k === 'GROUND SPEED') {
        const speed = el('button', 'ae-btn', 'UNIT') as HTMLButtonElement
        speed.type = 'button'
        speed.title = 'Toggle KT / MPH / KM/H'
        speed.addEventListener('click', () => hooks.speed.forEach((fn) => fn()))
        dd.append(speed)
      }
      grid.append(dt, dd)
    }
    if (view.photoUrl && view.photoCredit) {
      credit.hidden = false
      credit.textContent = `PHOTO ${view.photoCredit}`
      credit.href = view.photoLink || view.photoUrl
    } else {
      credit.hidden = true
      credit.textContent = ''
      credit.removeAttribute('href')
    }
    showPhoto(view.photoUrl || '')
  }

  return {
    root,
    setView: paint,
    setGraph(samples) {
      drawGraph(graph, graphNote, samples)
    },
    setRouteOn(on) {
      routeBtn.classList.toggle('is-on', on)
    },
    onClose: (cb) => hooks.close.push(cb),
    onView3d: (cb) => hooks.view3d.push(cb),
    onRoute: (cb) => hooks.route.push(cb),
    onFollow: (cb) => hooks.follow.push(cb),
    onShare: (cb) => hooks.share.push(cb),
    onCopy: (cb) => hooks.copy.push(cb),
    onWatch: (cb) => hooks.watch.push(cb),
    onSpeed: (cb) => hooks.speed.push(cb),
  }
}

function action(label: string) {
  const button = el('button', 'ae-btn', label) as HTMLButtonElement
  button.type = 'button'
  return button
}

function drawGraph(canvas: HTMLCanvasElement, note: HTMLElement, samples: { altFt: number; gsKt: number }[]) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const w = canvas.width
  const h = canvas.height
  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = '#010a06'
  ctx.fillRect(0, 0, w, h)
  ctx.strokeStyle = '#145c32'
  ctx.lineWidth = 2
  ctx.strokeRect(8, 8, w - 16, h - 16)
  if (samples.length < 2) {
    note.textContent = 'NOT ENOUGH HISTORY'
    return
  }
  note.textContent = 'ALT  BRIGHT    GS  DIM'
  const alts = samples.map((sample) => sample.altFt)
  const speeds = samples.map((sample) => sample.gsKt)
  const plot = (values: number[], color: string) => {
    const min = Math.min(...values)
    const max = Math.max(...values)
    const span = Math.max(1, max - min)
    ctx.beginPath()
    values.forEach((value, index) => {
      const x = 16 + (index / (values.length - 1)) * (w - 32)
      const y = h - 16 - ((value - min) / span) * (h - 32)
      if (index === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.strokeStyle = color
    ctx.lineWidth = 3
    ctx.stroke()
  }
  plot(alts, '#d8ffe8')
  plot(speeds, '#1f8f45')
}
