import Hls from 'hls.js'
import type { ViewState } from '../core/types'
import { allCams, camById } from '../plugins/cameras/catalog'
import type { TrafficCam } from '../plugins/cameras/parse'
import { CAM_REGIONS, CAM_SOURCES, feedBucket, filterCams, sourceLabel, streamingIds, tileCount, type FeedFilter, type GridSize } from '../desk/cameras'
import type { CameraPanel } from '../ui/camera-panel'

export interface CamerasDesk {
  root: HTMLElement
  open(id: string): void
  close(): void
  setActive(on: boolean): void
  selected(): string | null
}

export interface CamerasDeskOptions {
  panel: CameraPanel
  view(): ViewState
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

function mediaSrc(url: string): string {
  return `/api/cams/media?u=${encodeURIComponent(url)}`
}

function bust(url: string): string {
  const join = url.includes('?') ? '&' : '?'
  return `${url}${join}t=${Date.now()}`
}

export function mountCamerasDesk(host: HTMLElement, opts: CamerasDeskOptions): CamerasDesk {
  host.classList.add('ae-camdesk')
  const bar = el('div', 'ae-deskbar')
  const search = document.createElement('input')
  search.className = 'ae-desk-search'
  search.type = 'text'
  search.placeholder = 'Name, road, or city'
  search.setAttribute('aria-label', 'Search cameras')
  const source = document.createElement('select')
  source.className = 'ae-desk-select'
  source.append(option('All sources', ''))
  for (const row of CAM_SOURCES) source.append(option(row.label, row.id))
  const region = document.createElement('select')
  region.className = 'ae-desk-select'
  for (const name of CAM_REGIONS) region.append(option(name, name))
  const mode = document.createElement('select')
  mode.className = 'ae-desk-select'
  mode.append(option('ALL', 'all'), option('LIVE', 'live'), option('CLIP', 'clip'), option('SNAPSHOT', 'snapshot'))
  const nearMe = button('NEAR ME')
  const nearView = button('NEAR VIEW')
  nearView.classList.add('is-on')
  const nearAll = button('ALL')
  const grids = [1, 4, 9].map((size) => {
    const node = button(String(size))
    node.title = `${size} tiles`
    if (size === 4) node.classList.add('is-on')
    return node
  })
  const note = el('div', 'ae-desk-note', 'CAMERAS LOADING')
  bar.append(search, source, region, mode, nearMe, nearView, nearAll, ...grids, note)

  const wall = el('div', 'ae-camwall is-4')
  const viewer = el('div', 'ae-camhost')
  viewer.append(opts.panel.root)
  host.append(bar, wall, viewer)

  let active = false
  let selected: string | null = null
  let grid: GridSize = 4
  let near: 'view' | 'me' | 'all' = 'view'
  let me: { lat: number; lon: number } | null = null
  let timer = 0
  let snapTimer = 0
  let signature = ''
  const players = new Map<string, Hls>()

  function option(label: string, value: string): HTMLOptionElement {
    const node = document.createElement('option')
    node.value = value
    node.textContent = label
    return node
  }

  function radius(): { lat: number; lon: number; radiusKm: number } | null {
    if (near === 'all') return null
    if (near === 'me' && me) return { lat: me.lat, lon: me.lon, radiusKm: 80 }
    const view = opts.view()
    return { lat: view.lat, lon: view.lon, radiusKm: Math.min(400, Math.max(40, view.rangeKm * 0.62)) }
  }

  function rows(): TrafficCam[] {
    return filterCams(allCams(), {
      text: search.value,
      source: source.value,
      region: region.value,
      mode: mode.value as FeedFilter,
      near: radius(),
    }).slice(0, 80)
  }

  function stopPlayers() {
    for (const player of players.values()) player.destroy()
    players.clear()
    for (const video of wall.querySelectorAll('video')) {
      video.pause()
      video.removeAttribute('src')
    }
  }

  function paint() {
    const list = rows()
    const shown = list.slice(0, tileCount(grid))
    const sig = `${grid}|${selected}|${shown.map((row) => row.id).join(',')}`
    note.textContent = list.length ? `${list.length} CAMERAS` : allCams().length ? 'NO CAMERAS IN THIS FILTER' : 'CAMERAS LOADING'
    if (sig === signature && wall.childElementCount) return
    signature = sig
    stopPlayers()
    wall.replaceChildren()
    wall.className = `ae-camwall is-${grid}`
    const streams = new Set(streamingIds(shown, selected, grid))
    for (const cam of shown) {
      wall.append(tile(cam, streams.has(cam.id)))
    }
    if (active && selected) {
      const cam = camById(selected)
      if (cam) opts.panel.setView(cam)
    }
  }

  function tile(cam: TrafficCam, stream: boolean): HTMLElement {
    const card = document.createElement('button')
    card.className = 'ae-camtile' + (cam.id === selected ? ' is-on' : '')
    card.type = 'button'
    const badge = feedBucket(cam.mode)
    const label = badge === 'live' ? 'LIVE' : badge === 'clip' ? 'VIDEO CLIP' : 'SNAPSHOT'
    card.append(el('div', 'ae-camtile-badge', label), el('div', 'ae-camtile-name', cam.name), el('div', 'ae-camtile-meta', `${cam.road || sourceLabel(cam.source)} · ${sourceLabel(cam.source)}`))
    const stage = el('div', 'ae-camtile-stage')
    if (stream && cam.videoUrl && cam.mode === 'hls' && Hls.isSupported()) {
      const video = document.createElement('video')
      video.muted = true
      video.autoplay = true
      video.playsInline = true
      stage.append(video)
      const player = new Hls({
        enableWorker: false,
        manifestLoadingMaxRetry: 1,
        levelLoadingMaxRetry: 1,
        fragLoadingMaxRetry: 0,
        manifestLoadingTimeOut: 8000,
        levelLoadingTimeOut: 8000,
        fragLoadingTimeOut: 8000,
      })
      player.loadSource(mediaSrc(cam.videoUrl))
      player.attachMedia(video)
      player.on(Hls.Events.MANIFEST_PARSED, () => {
        void video.play().catch(() => undefined)
      })
      players.set(cam.id, player)
    } else if (stream && cam.videoUrl && cam.mode === 'mp4') {
      const video = document.createElement('video')
      video.muted = true
      video.autoplay = true
      video.playsInline = true
      video.src = mediaSrc(cam.videoUrl)
      stage.append(video)
      void video.play().catch(() => undefined)
    } else if (cam.mode === 'mjpeg' && cam.imageUrl) {
      const img = document.createElement('img')
      img.alt = ''
      img.src = cam.imageUrl
      stage.append(img)
    } else if (cam.imageUrl) {
      const img = document.createElement('img')
      img.alt = ''
      img.src = mediaSrc(bust(cam.imageUrl))
      stage.append(img)
    } else {
      stage.append(el('div', 'ae-camtile-off', 'NO PICTURE'))
    }
    card.prepend(stage)
    card.addEventListener('click', () => desk.open(cam.id))
    return card
  }

  function arm() {
    clearInterval(timer)
    clearInterval(snapTimer)
    timer = 0
    snapTimer = 0
    if (!active) return
    timer = window.setInterval(paint, 2000)
    snapTimer = window.setInterval(() => {
      signature = ''
      paint()
    }, 30000)
  }

  const desk: CamerasDesk = {
    root: host,
    selected: () => selected,
    open(id: string) {
      selected = id
      signature = ''
      if (active) {
        const cam = camById(id)
        if (cam) opts.panel.setView(cam)
      }
      paint()
    },
    close() {
      selected = null
      signature = ''
      opts.panel.setView(null)
      paint()
    },
    setActive(on: boolean) {
      active = on
      if (!on) {
        clearInterval(timer)
        clearInterval(snapTimer)
        stopPlayers()
        opts.panel.setView(null)
        signature = ''
        return
      }
      paint()
      if (selected) {
        const cam = camById(selected)
        if (cam) opts.panel.setView(cam)
      }
      arm()
    },
  }

  search.addEventListener('input', () => {
    signature = ''
    paint()
  })
  for (const box of [source, region, mode]) {
    box.addEventListener('change', () => {
      signature = ''
      paint()
    })
  }
  nearView.addEventListener('click', () => {
    near = 'view'
    nearView.classList.add('is-on')
    nearMe.classList.remove('is-on')
    nearAll.classList.remove('is-on')
    signature = ''
    paint()
  })
  nearAll.addEventListener('click', () => {
    near = 'all'
    nearAll.classList.add('is-on')
    nearView.classList.remove('is-on')
    nearMe.classList.remove('is-on')
    signature = ''
    paint()
  })
  nearMe.addEventListener('click', () => {
    near = 'me'
    nearMe.classList.add('is-on')
    nearView.classList.remove('is-on')
    nearAll.classList.remove('is-on')
    if (!navigator.geolocation) {
      note.textContent = 'LOCATION UNAVAILABLE'
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        me = { lat: pos.coords.latitude, lon: pos.coords.longitude }
        signature = ''
        paint()
      },
      () => {
        note.textContent = 'LOCATION DENIED'
      },
      { maximumAge: 60000, timeout: 8000 },
    )
  })
  grids.forEach((node, index) => {
    node.addEventListener('click', () => {
      grid = ([1, 4, 9] as const)[index]
      for (const other of grids) other.classList.toggle('is-on', other === node)
      signature = ''
      paint()
    })
  })

  return desk
}
