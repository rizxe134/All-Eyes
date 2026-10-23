import Hls from 'hls.js'
import type { TrafficCam } from '../plugins/cameras/parse'
import { camsNear } from '../plugins/cameras/catalog'
import { modeLabel } from '../plugins/cameras/feed'

export interface CameraPanel {
  root: HTMLElement
  setView(cam: TrafficCam | null): void
}

export interface CameraActions {
  follow(cam: TrafficCam): void
  open(id: string): void
  close(): void
}

function el(tag: string, className: string, text = ''): HTMLElement {
  const node = document.createElement(tag)
  node.className = className
  if (text) node.textContent = text
  return node
}

function bust(url: string): string {
  const join = url.includes('?') ? '&' : '?'
  return `${url}${join}t=${Date.now()}`
}

function mediaSrc(url: string): string {
  return `/api/cams/media?u=${encodeURIComponent(url)}`
}

export function mountCameraPanel(actions: CameraActions): CameraPanel {
  const root = el('section', 'ae-cam')
  root.hidden = true
  const head = el('header', 'ae-cam-head')
  const title = el('div', 'ae-cam-title', 'CAMERA')
  const badge = el('div', 'ae-cam-badge', '')
  const close = el('button', 'ae-btn', 'X') as HTMLButtonElement
  close.type = 'button'
  close.title = 'Close'
  close.addEventListener('click', () => actions.close())
  head.append(title, badge, close)
  const body = el('div', 'ae-cam-body')
  const stage = el('div', 'ae-cam-stage')
  const img = document.createElement('img')
  img.className = 'ae-cam-still'
  img.alt = ''
  img.hidden = true
  const video = document.createElement('video')
  video.className = 'ae-cam-video'
  video.muted = true
  video.playsInline = true
  video.controls = true
  video.hidden = true
  stage.append(img, video)
  const name = line(body, 'NAME')
  const road = line(body, 'ROAD')
  const agency = line(body, 'AGENCY')
  const updated = line(body, 'UPDATED')
  body.prepend(stage)
  const actionsRow = el('div', 'ae-cam-actions')
  const follow = button('FOLLOW')
  const source = button('SOURCE')
  const pop = button('POP')
  const prev = button('PREV')
  const next = button('NEXT')
  actionsRow.append(follow, source, pop, prev, next)
  body.append(actionsRow)
  root.append(head, body)

  let hls: Hls | null = null
  let popup: Hls | null = null
  let timer = 0
  let shown = ''
  let current: TrafficCam | null = null

  function stopMedia() {
    window.clearInterval(timer)
    timer = 0
    hls?.destroy()
    hls = null
    video.pause()
    video.onerror = null
    video.removeAttribute('src')
    video.load()
    video.hidden = true
    img.onerror = null
    img.removeAttribute('src')
    img.hidden = true
  }

  function offline(cam: TrafficCam | null) {
    stopMedia()
    if (cam?.imageUrl) {
      badge.textContent = 'FEED OFFLINE · SNAPSHOT'
      showStill(cam, false)
      return
    }
    badge.textContent = 'FEED OFFLINE'
  }

  function showStill(cam: TrafficCam, labeled: boolean) {
    video.hidden = true
    img.hidden = false
    img.alt = cam.name
    const sec = Math.max(3, cam.refreshSec || 30)
    if (labeled) badge.textContent = modeLabel('snapshot', sec)
    const paint = () => {
      img.src = bust(cam.imageUrl)
    }
    paint()
    img.onerror = () => {
      badge.textContent = 'FEED OFFLINE'
      img.hidden = true
    }
    timer = window.setInterval(paint, sec * 1000)
  }

  function showHls(cam: TrafficCam) {
    badge.textContent = modeLabel('hls', cam.refreshSec)
    img.hidden = true
    video.hidden = false
    video.loop = false
    const src = mediaSrc(cam.videoUrl)
    const fail = () => offline(cam.imageUrl ? cam : null)
    if (Hls.isSupported()) {
      hls = new Hls({ enableWorker: false })
      hls.loadSource(src)
      hls.attachMedia(video)
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return
        hls?.destroy()
        hls = null
        fail()
      })
      void video.play().catch(() => undefined)
      return
    }
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src
      video.onerror = fail
      void video.play().catch(() => undefined)
      return
    }
    fail()
  }

  function showMp4(cam: TrafficCam) {
    badge.textContent = modeLabel('mp4', 60)
    img.hidden = true
    video.hidden = false
    video.loop = true
    let triedProxy = false
    const play = (src: string) => {
      video.src = src
      void video.play().catch(() => undefined)
    }
    video.onerror = () => {
      if (!triedProxy) {
        triedProxy = true
        play(mediaSrc(cam.videoUrl))
        return
      }
      offline(cam.imageUrl ? cam : null)
    }
    play(cam.videoUrl)
    timer = window.setInterval(() => play(triedProxy ? mediaSrc(cam.videoUrl) : cam.videoUrl), 60000)
  }

  function showMjpeg(cam: TrafficCam) {
    badge.textContent = modeLabel('mjpeg', cam.refreshSec)
    video.hidden = true
    img.hidden = false
    img.alt = cam.name
    img.src = cam.videoUrl
    img.onerror = () => {
      if (cam.imageUrl) showStill(cam, false)
      else offline(null)
    }
  }

  function start(cam: TrafficCam) {
    stopMedia()
    if (!cam.online && cam.mode !== 'snapshot') {
      offline(cam.imageUrl ? cam : null)
      return
    }
    if (cam.mode === 'hls' && cam.videoUrl) showHls(cam)
    else if (cam.mode === 'mp4' && cam.videoUrl) showMp4(cam)
    else if (cam.mode === 'mjpeg' && cam.videoUrl) showMjpeg(cam)
    else if (cam.imageUrl) showStill(cam, true)
    else offline(null)
  }

  function paint(cam: TrafficCam) {
    title.textContent = cam.name
    name.textContent = cam.name
    road.textContent = [cam.road, cam.direction].filter(Boolean).join(' · ') || 'NOT AVAILABLE'
    agency.textContent = cam.attribution || cam.agency
    updated.textContent = cam.updated || 'NOT AVAILABLE'
  }

  follow.addEventListener('click', () => {
    if (current) actions.follow(current)
  })
  source.addEventListener('click', () => {
    if (current?.pageUrl) window.open(current.pageUrl, '_blank', 'noopener')
  })
  pop.addEventListener('click', () => {
    if (current) openPop(current)
  })
  prev.addEventListener('click', () => step(-1))
  next.addEventListener('click', () => step(1))

  function step(dir: number) {
    if (!current) return
    const near = camsNear(current.lat, current.lon, 40, 24)
    if (near.length < 2) return
    const index = Math.max(0, near.findIndex((cam) => cam.id === current?.id))
    const pick = near[(index + dir + near.length) % near.length]
    if (pick && pick.id !== current.id) actions.open(pick.id)
  }

  function openPop(cam: TrafficCam) {
    popup?.destroy()
    popup = null
    const win = window.open('', 'alleyes-cam', 'width=960,height=640')
    if (!win) return
    win.document.title = cam.name
    win.document.body.style.margin = '0'
    win.document.body.style.background = '#02140a'
    win.document.body.replaceChildren()
    const note = win.document.createElement('div')
    note.textContent = `${cam.name} — ${badge.textContent}`
    note.style.cssText = 'font:14px monospace;color:#b6ff9a;padding:8px'
    if (cam.mode === 'mp4' && cam.videoUrl) {
      const node = win.document.createElement('video')
      node.controls = true
      node.autoplay = true
      node.loop = true
      node.muted = true
      node.src = cam.videoUrl
      node.style.width = '100%'
      win.document.body.append(note, node)
      return
    }
    if (cam.mode === 'hls' && cam.videoUrl && Hls.isSupported()) {
      const node = win.document.createElement('video')
      node.controls = true
      node.autoplay = true
      node.muted = true
      node.style.width = '100%'
      win.document.body.append(note, node)
      const player = new Hls({ enableWorker: false })
      popup = player
      player.loadSource(mediaSrc(cam.videoUrl))
      player.attachMedia(node)
      player.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal || !cam.imageUrl) return
        player.destroy()
        popup = null
        const still = win.document.createElement('img')
        still.src = bust(cam.imageUrl)
        still.style.width = '100%'
        node.replaceWith(still)
        note.textContent = `${cam.name} — FEED OFFLINE · SNAPSHOT`
      })
      return
    }
    if (cam.imageUrl) {
      const still = win.document.createElement('img')
      still.src = bust(cam.imageUrl)
      still.style.width = '100%'
      win.document.body.append(note, still)
    }
  }

  return {
    root,
    setView(cam) {
      current = cam
      if (!cam) {
        shown = ''
        stopMedia()
        popup?.destroy()
        popup = null
        root.hidden = true
        return
      }
      root.hidden = false
      paint(cam)
      if (shown === cam.id) return
      shown = cam.id
      popup?.destroy()
      popup = null
      start(cam)
    },
  }
}

function line(parent: HTMLElement, label: string): HTMLElement {
  const row = el('div', 'ae-cam-row')
  row.append(el('span', 'ae-k', label), el('span', 'ae-cam-v', '—'))
  parent.append(row)
  return row.lastElementChild as HTMLElement
}

function button(text: string): HTMLButtonElement {
  const node = document.createElement('button')
  node.type = 'button'
  node.className = 'ae-btn'
  node.textContent = text
  return node
}
