import Hls from 'hls.js'
import type { TrafficCam } from '../plugins/cameras/parse'
import { camsNear } from '../plugins/cameras/catalog'
import {
  lastGoodLabel,
  offlineLabel,
  playbackPlan,
  stepLabel,
  type PlaybackKind,
  type PlaybackStep,
} from '../plugins/cameras/feed'
import { countClasses, DETECT_CLASSES, DETECT_CREDIT, filterDetections, mapBox, type DetBox } from '../plugins/cameras/detect-math'
import { disposeDetector, loadDetector } from '../plugins/cameras/detect'
import { CLIP_WAIT_SEC, clipCountdownLabel, HLS_LIVE_CONFIG, MAX_STALL_RELOADS, needsResync, StallWatch } from '../plugins/cameras/live'

export interface CameraPanel {
  root: HTMLElement
  setView(cam: TrafficCam | null): void
}

export interface CameraActions {
  follow(cam: TrafficCam): void
  open(id: string): void
  close(): void
  conf(): number
  setConf(value: number): void
  detectOn(id: string): boolean
  setDetect(id: string, on: boolean): void
  subscribe(cb: () => void): () => void
}

function el(tag: string, className: string, text = ''): HTMLElement {
  const node = document.createElement(tag)
  node.className = className
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

function bust(url: string): string {
  const join = url.includes('?') ? '&' : '?'
  return `${url}${join}t=${Date.now()}`
}

function mediaSrc(url: string): string {
  return `/api/cams/media?u=${encodeURIComponent(url)}`
}

function absolute(path: string): string {
  return new URL(path, window.location.href).href
}

function streamReason(data: { details?: string; response?: { code?: number } }): string {
  const code = data.response?.code
  if (code) return `STREAM ${code}`
  const detail = (data.details || '').toLowerCase()
  if (detail.includes('timeout')) return 'STREAM TIMEOUT'
  return 'STREAM FAILED'
}

export function mountCameraPanel(actions: CameraActions): CameraPanel {
  const root = el('section', 'ae-cam')
  root.hidden = true
  const head = el('header', 'ae-cam-head')
  const title = el('div', 'ae-cam-title', 'CAMERA')
  const badge = el('div', 'ae-cam-badge', '')
  const close = button('X')
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
  video.autoplay = true
  video.hidden = true
  const boxCanvas = document.createElement('canvas')
  boxCanvas.className = 'ae-cam-boxes'
  const overlay = el('div', 'ae-cam-overlay')
  const overlayName = el('div', 'ae-cam-name', '')
  const overlayRoad = el('div', 'ae-cam-road', '')
  const overlayBadge = el('div', 'ae-cam-badge', '')
  const prev = button('PREV')
  const next = button('NEXT')
  const detectBtn = button('DETECT')
  detectBtn.title = 'On-device object detection for this camera'
  const fullBtn = button('FULL')
  fullBtn.title = 'Full screen'
  const confLabel = el('label', 'ae-cam-conf', 'CONF')
  const confInput = document.createElement('input')
  confInput.type = 'range'
  confInput.min = '0.2'
  confInput.max = '0.9'
  confInput.step = '0.05'
  confInput.value = String(actions.conf())
  confLabel.append(confInput)
  const counts = el('div', 'ae-cam-counts', '')
  const fpsEl = el('div', 'ae-cam-counts', '')
  const detectNote = el('div', 'ae-cam-detect-note', '')
  overlay.append(overlayName, overlayRoad, overlayBadge, prev, next, detectBtn, fullBtn, confLabel, counts, fpsEl, detectNote)
  stage.append(img, video, boxCanvas, overlay)

  const name = line(body, 'NAME')
  const road = line(body, 'ROAD')
  const agency = line(body, 'AGENCY')
  const updated = line(body, 'UPDATED')
  body.prepend(stage)
  const actionsRow = el('div', 'ae-cam-actions')
  const follow = button('FOLLOW')
  const source = button('SOURCE')
  const pop = button('POP')
  actionsRow.append(follow, source, pop, buttonClone(prev, 'PREV'), buttonClone(next, 'NEXT'), buttonClone(fullBtn, 'FULL'))
  body.append(actionsRow)
  body.append(el('p', 'ae-cam-credit', DETECT_CREDIT))
  root.append(head, body)

  const scratch = document.createElement('canvas')
  const lastGood = new Map<string, number>()
  let hls: Hls | null = null
  let popup: Hls | null = null
  let timer = 0
  let detectTimer = 0
  let token = 0
  let detectRun = 0
  let busy = false
  let running = false
  let shown = ''
  let current: TrafficCam | null = null
  let shownKind: PlaybackKind | null = null
  let shownStep: PlaybackStep | null = null
  let popWin: Window | null = null
  let popStage: HTMLElement | null = null
  let popCanvas: HTMLCanvasElement | null = null
  let popVideo: HTMLVideoElement | null = null
  let popImg: HTMLImageElement | null = null
  let popBadge: HTMLElement | null = null
  let popDetect: HTMLButtonElement | null = null
  let popFull: HTMLButtonElement | null = null
  const fpsSamples: number[] = []

  actions.subscribe(() => {
    if (document.activeElement !== confInput) confInput.value = String(actions.conf())
  })

  function setBadge(text: string) {
    badge.textContent = text
    overlayBadge.textContent = text
    if (popBadge) popBadge.textContent = text
  }

  function noteGood(id: string) {
    lastGood.set(id, Date.now())
  }

  function stopMedia() {
    window.clearInterval(timer)
    timer = 0
    hls?.destroy()
    hls = null
    video.onerror = null
    video.onloadeddata = null
    video.ontimeupdate = null
    video.onended = null
    video.pause()
    video.removeAttribute('src')
    video.load()
    video.hidden = true
    img.onload = null
    img.onerror = null
    img.removeAttribute('src')
    img.hidden = true
  }

  function clearBoxes() {
    const ctx = boxCanvas.getContext('2d')
    if (ctx) ctx.clearRect(0, 0, boxCanvas.width, boxCanvas.height)
    if (popCanvas) {
      const popCtx = popCanvas.getContext('2d')
      if (popCtx) popCtx.clearRect(0, 0, popCanvas.width, popCanvas.height)
    }
  }

  function stopLoop() {
    detectRun += 1
    window.clearTimeout(detectTimer)
    detectTimer = 0
    running = false
    busy = false
    clearBoxes()
    counts.textContent = ''
    fpsEl.textContent = ''
    fpsEl.removeAttribute('data-fps')
    detectNote.textContent = ''
    fpsSamples.length = 0
  }

  function fullOn(): boolean {
    return document.fullscreenElement === stage || stage.classList.contains('is-full')
  }

  async function setFull(on: boolean) {
    if (on) {
      stage.classList.add('is-full')
      try {
        await stage.requestFullscreen()
      } catch {
        /* The stage class still fills the window when the browser refuses the Fullscreen API. */
      }
    } else {
      stage.classList.remove('is-full')
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined)
    }
    fullBtn.textContent = fullOn() ? 'EXIT' : 'FULL'
  }

  function syncDetectButton() {
    const on = current ? actions.detectOn(current.id) : false
    detectBtn.textContent = on ? 'DETECT ON' : 'DETECT'
    detectBtn.classList.toggle('is-on', on)
    detectBtn.setAttribute('aria-pressed', on ? 'true' : 'false')
    if (popDetect) {
      popDetect.textContent = on ? 'DETECT ON' : 'DETECT'
      popDetect.setAttribute('aria-pressed', on ? 'true' : 'false')
    }
  }

  function activeMedia(): HTMLVideoElement | HTMLImageElement | null {
    if (!video.hidden && video.videoWidth > 0) return video
    if (!img.hidden && img.naturalWidth > 0) return img
    if (popVideo && popWin && !popWin.closed && popVideo.videoWidth > 0) return popVideo
    if (popImg && popWin && !popWin.closed && popImg.naturalWidth > 0) return popImg
    return null
  }

  function grab(media: HTMLVideoElement | HTMLImageElement): { w: number; h: number } | 'tainted' | 'empty' {
    const srcW = media instanceof HTMLVideoElement ? media.videoWidth : media.naturalWidth
    const srcH = media instanceof HTMLVideoElement ? media.videoHeight : media.naturalHeight
    if (!srcW || !srcH) return 'empty'
    const scale = Math.min(1, 480 / Math.max(srcW, srcH))
    const dw = Math.max(1, Math.round(srcW * scale))
    const dh = Math.max(1, Math.round(srcH * scale))
    // Assigning width resets the bitmap. Doing it every frame makes the next video read stall.
    if (scratch.width !== dw || scratch.height !== dh) {
      scratch.width = dw
      scratch.height = dh
    }
    const ctx = scratch.getContext('2d', { willReadFrequently: true })
    if (!ctx) return 'empty'
    try {
      ctx.drawImage(media, 0, 0, dw, dh)
      ctx.getImageData(0, 0, 1, 1)
    } catch {
      return 'tainted'
    }
    return { w: dw, h: dh }
  }

  function drawOne(canvas: HTMLCanvasElement, host: HTMLElement, srcW: number, srcH: number, boxes: readonly DetBox[]) {
    const w = host.clientWidth
    const h = host.clientHeight
    if (!w || !h) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = Math.max(1, Math.round(w * dpr))
    canvas.height = Math.max(1, Math.round(h * dpr))
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)
    const font = Math.max(12, Math.round(h / 42))
    ctx.lineWidth = Math.max(2, h / 280)
    ctx.font = `${font}px monospace`
    for (const box of boxes) {
      const mapped = mapBox(box, srcW, srcH, w, h)
      ctx.strokeStyle = '#ff4d6d'
      ctx.strokeRect(mapped.x, mapped.y, mapped.w, mapped.h)
      const label = `${box.class} ${Math.round(box.score * 100)}%`
      const labelH = font + 4
      const width = ctx.measureText(label).width + 8
      const top = Math.max(0, mapped.y - labelH)
      ctx.fillStyle = '#ff4d6d'
      ctx.fillRect(mapped.x, top, width, labelH)
      ctx.fillStyle = '#04140a'
      ctx.fillText(label, mapped.x + 4, top + font - 1)
    }
  }

  function drawAll(srcW: number, srcH: number, boxes: readonly DetBox[]) {
    drawOne(boxCanvas, stage, srcW, srcH, boxes)
    if (popCanvas && popStage && popWin && !popWin.closed) drawOne(popCanvas, popStage, srcW, srcH, boxes)
  }

  function noteFps(): number {
    const now = performance.now()
    fpsSamples.push(now)
    while (fpsSamples.length && now - fpsSamples[0]! > 2000) fpsSamples.shift()
    if (fpsSamples.length < 2) return 0
    const span = (fpsSamples[fpsSamples.length - 1]! - fpsSamples[0]!) / 1000
    return span > 0 ? (fpsSamples.length - 1) / span : 0
  }

  async function runOnce() {
    if (!current || !actions.detectOn(current.id)) return
    const my = detectRun
    const media = activeMedia()
    if (!media) return
    const frame = grab(media)
    if (my !== detectRun) return
    if (frame === 'empty') return
    if (frame === 'tainted') {
      detectNote.textContent = 'DETECTION UNAVAILABLE · CROSS-ORIGIN FRAME'
      counts.textContent = ''
      clearBoxes()
      return
    }
    let loaded
    try {
      loaded = await loadDetector()
    } catch (err) {
      if (my !== detectRun) return
      const message = err instanceof Error ? err.message : 'MODEL FAILED TO LOAD'
      detectNote.textContent = `DETECTION UNAVAILABLE · ${message}`.slice(0, 160)
      return
    }
    if (my !== detectRun) return
    let preds
    try {
      preds = await loaded.model.detect(scratch, 20, actions.conf())
    } catch (err) {
      if (my !== detectRun) return
      const message = err instanceof Error ? err.message : 'FRAME UNREADABLE'
      detectNote.textContent = `DETECTION UNAVAILABLE · ${message}`.slice(0, 160)
      return
    }
    if (my !== detectRun) return
    const boxes = filterDetections(preds, actions.conf())
    drawAll(frame.w, frame.h, boxes)
    const tally = countClasses(boxes)
    counts.textContent = DETECT_CLASSES.map((name) => `${name.toUpperCase()} ${tally[name]}`).join('  ')
    const fps = noteFps()
    fpsEl.textContent = fps ? `${fps.toFixed(1)} FPS · ${loaded.backend.toUpperCase()}` : loaded.backend.toUpperCase()
    fpsEl.dataset.fps = fps.toFixed(2)
    fpsEl.dataset.backend = loaded.backend
    detectNote.textContent = ''
  }

  function startLoop(kind: PlaybackKind) {
    const my = ++detectRun
    running = kind === 'hls' || kind === 'mp4' || kind === 'mjpeg'
    const tick = async () => {
      if (my !== detectRun) return
      if (busy) {
        detectTimer = window.setTimeout(() => void tick(), 40)
        return
      }
      busy = true
      const started = performance.now()
      try {
        await runOnce()
      } finally {
        busy = false
      }
      if (my !== detectRun || !running) return
      const elapsed = performance.now() - started
      const period = elapsed > 150 ? 200 : 110
      detectTimer = window.setTimeout(() => void tick(), Math.max(0, period - elapsed))
    }
    if (running) void tick()
    else void runOnce()
  }

  function armDetect(kind: PlaybackKind) {
    if (!current || !actions.detectOn(current.id)) {
      stopLoop()
      return
    }
    detectNote.textContent = 'DETECTION LOADING'
    startLoop(kind)
  }

  function playStep(cam: TrafficCam, step: PlaybackStep, prior: string, hooks: { ready(): void; fail(reason: string): void }) {
    const my = token
    let closed = false
    let announced = false
    setBadge(prior ? stepLabel(step.kind, cam.refreshSec, prior) : 'OPENING')
    const fail = (reason: string) => {
      if (closed || my !== token) return
      closed = true
      hooks.fail(reason)
    }
    const ready = () => {
      if (closed || my !== token || announced) return
      announced = true
      noteGood(cam.id)
      shownKind = step.kind
      shownStep = step
      hooks.ready()
    }

    if (step.kind === 'hls') {
      img.hidden = true
      video.hidden = false
      video.loop = false
      const src = mediaSrc(step.url)
      let recovered = false
      if (Hls.isSupported()) {
        const player = new Hls({ ...HLS_LIVE_CONFIG })
        hls = player
        player.loadSource(src)
        player.attachMedia(video)
        player.on(Hls.Events.MANIFEST_PARSED, () => {
          ready()
          void video.play().catch(() => undefined)
        })
        player.on(Hls.Events.ERROR, (_event, data) => {
          if (!data.fatal || closed || my !== token) return
          const code = data.response?.code
          if (!recovered && !code && data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            recovered = true
            player.startLoad()
            return
          }
          fail(streamReason(data))
        })
        // Stay at the live edge: jump forward when far behind, reload when playback stops moving.
        const watch = new StallWatch()
        watch.reset(Date.now())
        let reloads = 0
        timer = window.setInterval(() => {
          if (closed || my !== token || hls !== player) return
          if (needsResync(video.currentTime, player.liveSyncPosition)) {
            video.currentTime = player.liveSyncPosition as number
          }
          if (!announced) return
          if (watch.feed(video.currentTime, Date.now(), video.paused && video.readyState >= 3)) {
            if (reloads >= MAX_STALL_RELOADS) {
              fail('STREAM STALLED')
              return
            }
            reloads += 1
            setBadge(`LIVE · STALLED · RELOADING (${reloads}/${MAX_STALL_RELOADS})`)
            watch.reset(Date.now())
            player.stopLoad()
            player.startLoad(-1)
            void video.play().catch(() => undefined)
          } else if (reloads && video.currentTime > 0) {
            reloads = 0
            setBadge(stepLabel('hls', cam.refreshSec, prior))
          }
        }, 2000)
        video.ontimeupdate = () => {
          if (video.currentTime > 0.2) noteGood(cam.id)
        }
        return
      }
      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = src
        video.onloadedmetadata = () => {
          ready()
          void video.play().catch(() => undefined)
        }
        video.onerror = () => fail('STREAM FAILED')
        return
      }
      fail('HLS UNSUPPORTED')
      return
    }

    if (step.kind === 'mp4') {
      img.hidden = true
      video.hidden = false
      video.loop = false
      let via: 'proxy' | 'direct' = 'proxy'
      let fresh = false
      const play = (src: string) => {
        video.src = src
        void video.play().catch(() => undefined)
      }
      video.onloadeddata = () => {
        ready()
        if (fresh) setBadge(stepLabel('mp4', cam.refreshSec, prior))
      }
      // A clip plays once. Then a countdown, then a fresh clip from the source, never the old one again.
      video.onended = () => {
        if (closed || my !== token) return
        window.clearInterval(timer)
        const due = Date.now() + CLIP_WAIT_SEC * 1000
        setBadge(clipCountdownLabel(CLIP_WAIT_SEC))
        timer = window.setInterval(() => {
          if (closed || my !== token) return
          const left = (due - Date.now()) / 1000
          setBadge(clipCountdownLabel(left))
          if (left <= 0) {
            window.clearInterval(timer)
            timer = 0
            fresh = true
            play(via === 'proxy' ? mediaSrc(bust(step.url)) : bust(step.url))
          }
        }, 500)
      }
      video.onerror = () => {
        if (via === 'proxy') {
          via = 'direct'
          play(step.url)
          return
        }
        fail('CLIP FAILED')
      }
      video.ontimeupdate = () => {
        if (video.currentTime > 0.2) noteGood(cam.id)
      }
      play(mediaSrc(step.url))
      return
    }

    if (step.kind === 'mjpeg') {
      video.hidden = true
      img.hidden = false
      img.alt = cam.name
      img.onload = () => ready()
      img.onerror = () => fail('STREAM FAILED')
      img.src = step.url
      return
    }

    video.hidden = true
    img.hidden = false
    img.alt = cam.name
    let via: 'proxy' | 'direct' = 'proxy'
    const sec = Math.max(3, cam.refreshSec || 30)
    const paint = () => {
      img.src = via === 'proxy' ? mediaSrc(bust(step.url)) : bust(step.url)
    }
    img.onload = () => {
      noteGood(cam.id)
      if (!announced) ready()
      else if (actions.detectOn(cam.id)) void runOnce()
    }
    img.onerror = () => {
      if (via === 'proxy') {
        via = 'direct'
        paint()
        return
      }
      fail('SNAPSHOT FAILED')
    }
    paint()
    timer = window.setInterval(paint, sec * 1000)
  }

  function begin(cam: TrafficCam) {
    token += 1
    stopMedia()
    stopLoop()
    shownKind = null
    shownStep = null
    const plan = playbackPlan(cam)
    root.classList.toggle('is-disabled', plan.hidden)
    if (plan.hidden) {
      setBadge('CATALOG DISABLED')
      return
    }
    let index = 0
    let prior = ''
    const next = () => {
      if (!current || current.id !== cam.id) return
      const step = plan.steps[index]
      if (!step) {
        shownKind = null
        shownStep = null
        setBadge(offlineLabel(prior || plan.reason, lastGoodLabel(lastGood.get(cam.id) ?? null)))
        stopLoop()
        return
      }
      stopMedia()
      playStep(cam, step, prior, {
        ready() {
          setBadge(stepLabel(step.kind, cam.refreshSec, prior))
          armDetect(step.kind)
          if (popWin && !popWin.closed) fillPop(cam)
        },
        fail(reason) {
          prior = reason || prior || 'STREAM FAILED'
          index += 1
          next()
        },
      })
    }
    next()
  }

  function paint(cam: TrafficCam) {
    title.textContent = cam.name
    overlayName.textContent = cam.name
    name.textContent = cam.name
    const roadText = [cam.road, cam.direction].filter(Boolean).join(' · ') || 'NOT AVAILABLE'
    road.textContent = roadText
    overlayRoad.textContent = roadText
    agency.textContent = cam.attribution || cam.agency
    updated.textContent = cam.updated || 'NOT AVAILABLE'
    img.alt = cam.name
    syncDetectButton()
    confInput.value = String(actions.conf())
  }

  function step(dir: number) {
    if (!current) return
    const near = camsNear(current.lat, current.lon, 40, 24).filter((cam) => cam.online)
    if (near.length < 2) return
    const index = Math.max(0, near.findIndex((cam) => cam.id === current?.id))
    const pick = near[(index + dir + near.length) % near.length]
    if (pick && pick.id !== current.id) actions.open(pick.id)
  }

  function closePop() {
    popup?.destroy()
    popup = null
    popStage = null
    popCanvas = null
    popVideo = null
    popImg = null
    popBadge = null
    popDetect = null
    popFull = null
    if (popWin && !popWin.closed) popWin.close()
    popWin = null
  }

  function fillPop(cam: TrafficCam) {
    const win = popWin
    if (!win || win.closed) return
    popup?.destroy()
    popup = null
    const doc = win.document
    doc.title = cam.name
    doc.body.style.margin = '0'
    doc.body.style.background = '#010804'
    doc.body.replaceChildren()
    const popStageEl = doc.createElement('div')
    popStageEl.style.cssText = 'position:relative;width:100vw;height:100vh;background:#010804;overflow:hidden'
    const note = doc.createElement('div')
    note.textContent = badge.textContent || ''
    note.style.cssText = 'position:absolute;left:8px;top:8px;z-index:2;font:12px monospace;color:#ff4d6d;background:rgba(1,8,4,.8);padding:4px 6px'
    const nameEl = doc.createElement('div')
    nameEl.textContent = cam.name
    nameEl.style.cssText = 'position:absolute;left:8px;right:8px;bottom:72px;z-index:2;font:14px monospace;color:#d8ffe6'
    const roadEl = doc.createElement('div')
    roadEl.textContent = [cam.road, cam.direction].filter(Boolean).join(' · ')
    roadEl.style.cssText = 'position:absolute;left:8px;right:8px;bottom:52px;z-index:2;font:12px monospace;color:#b6ff9a'
    const bar = doc.createElement('div')
    bar.style.cssText = 'position:absolute;left:0;right:0;bottom:0;z-index:2;display:flex;gap:6px;padding:8px;background:linear-gradient(transparent,rgba(1,8,4,.92))'
    const mk = (label: string) => {
      const node = doc.createElement('button')
      node.type = 'button'
      node.textContent = label
      node.style.cssText = 'font:12px monospace;background:#0c3a1c;color:#d8ffe6;border:2px solid #1f8a4c;padding:4px 8px'
      return node
    }
    const prevBtn = mk('PREV')
    const nextBtn = mk('NEXT')
    const detect = mk(actions.detectOn(cam.id) ? 'DETECT ON' : 'DETECT')
    const full = mk('FULL')
    prevBtn.addEventListener('click', () => step(-1))
    nextBtn.addEventListener('click', () => step(1))
    detect.addEventListener('click', () => detectBtn.click())
    full.addEventListener('click', () => {
      const node = doc.fullscreenElement ? null : popStageEl
      if (node) void popStageEl.requestFullscreen().catch(() => undefined)
      else void doc.exitFullscreen().catch(() => undefined)
    })
    bar.append(prevBtn, nextBtn, detect, full)
    const canvas = doc.createElement('canvas')
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none'
    popStage = popStageEl
    popCanvas = canvas
    popBadge = note
    popDetect = detect
    popFull = full
    popVideo = null
    popImg = null
    const stepNow = shownStep
    if (stepNow && (stepNow.kind === 'hls' || stepNow.kind === 'mp4')) {
      const node = doc.createElement('video')
      node.muted = true
      node.autoplay = true
      node.playsInline = true
      node.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#010804'
      if (stepNow.kind === 'mp4') {
        node.loop = false
        node.onended = () => {
          window.setTimeout(() => {
            if (popVideo === node) node.src = absolute(mediaSrc(bust(stepNow.url)))
          }, CLIP_WAIT_SEC * 1000)
        }
      }
      popStageEl.append(node, canvas, note, nameEl, roadEl, bar)
      doc.body.append(popStageEl)
      popVideo = node
      if (stepNow.kind === 'hls' && Hls.isSupported()) {
        const player = new Hls({ ...HLS_LIVE_CONFIG })
        popup = player
        player.loadSource(absolute(mediaSrc(stepNow.url)))
        player.attachMedia(node)
        player.on(Hls.Events.ERROR, (_event, data) => {
          if (!data.fatal) return
          player.destroy()
          popup = null
        })
      } else {
        node.src = absolute(stepNow.kind === 'mp4' ? mediaSrc(stepNow.url) : mediaSrc(stepNow.url))
      }
    } else if (stepNow?.kind === 'snapshot' || cam.imageUrl) {
      const still = doc.createElement('img')
      still.alt = cam.name
      still.src = absolute(mediaSrc(bust(stepNow?.url || cam.imageUrl)))
      still.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#010804'
      popImg = still
      popStageEl.append(still, canvas, note, nameEl, roadEl, bar)
      doc.body.append(popStageEl)
    } else {
      popStageEl.append(note, nameEl, roadEl, bar)
      doc.body.append(popStageEl)
    }
    popStageEl.addEventListener('dblclick', (event) => {
      const target = event.target
      if (target instanceof HTMLElement && target.closest('button')) return
      full.click()
    })
  }

  function openPop(cam: TrafficCam) {
    closePop()
    const win = window.open('', 'alleyes-cam', 'width=960,height=640')
    if (!win) return
    popWin = win
    win.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && win.document.fullscreenElement) {
        event.preventDefault()
        void win.document.exitFullscreen()
        return
      }
      if (event.key.toLowerCase() === 'f' && !event.metaKey && !event.ctrlKey && !event.altKey) {
        const typing = win.document.activeElement instanceof HTMLInputElement
        if (typing) return
        event.preventDefault()
        popFull?.click()
      }
    })
    fillPop(cam)
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
  fullBtn.addEventListener('click', () => void setFull(!fullOn()))
  detectBtn.addEventListener('click', () => {
    if (!current) return
    const on = !actions.detectOn(current.id)
    actions.setDetect(current.id, on)
    syncDetectButton()
    if (on && shownKind) armDetect(shownKind)
    else stopLoop()
  })
  confInput.addEventListener('input', () => actions.setConf(Number(confInput.value)))
  stage.addEventListener('dblclick', (event) => {
    const target = event.target
    if (target instanceof HTMLElement && target.closest('button, input, label')) return
    void setFull(!fullOn())
  })
  document.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement !== stage) stage.classList.remove('is-full')
    fullBtn.textContent = fullOn() ? 'EXIT' : 'FULL'
  })
  window.addEventListener('keydown', (event) => {
    const typing = document.activeElement instanceof HTMLInputElement
      || document.activeElement instanceof HTMLTextAreaElement
      || document.activeElement instanceof HTMLSelectElement
    if (event.key === 'Escape' && fullOn()) {
      event.preventDefault()
      event.stopImmediatePropagation()
      void setFull(false)
      return
    }
    if (event.key.toLowerCase() !== 'f' || event.metaKey || event.ctrlKey || event.altKey || typing || !current) return
    event.preventDefault()
    event.stopImmediatePropagation()
    void setFull(!fullOn())
  }, true)

  return {
    root,
    setView(cam) {
      current = cam
      if (!cam) {
        shown = ''
        token += 1
        stopMedia()
        stopLoop()
        closePop()
        void disposeDetector()
        root.hidden = true
        root.classList.remove('is-disabled')
        if (fullOn()) void setFull(false)
        return
      }
      root.hidden = false
      paint(cam)
      if (shown === cam.id) return
      shown = cam.id
      begin(cam)
    },
  }
}

function line(parent: HTMLElement, label: string): HTMLElement {
  const row = el('div', 'ae-cam-row')
  row.append(el('span', 'ae-k', label), el('span', 'ae-cam-v', '—'))
  parent.append(row)
  return row.lastElementChild as HTMLElement
}

function buttonClone(source: HTMLButtonElement, text: string): HTMLButtonElement {
  const node = button(text)
  node.title = source.title
  node.addEventListener('click', () => source.click())
  return node
}
