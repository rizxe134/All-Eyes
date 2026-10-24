import { AlertBoard } from './alerts'
import { execute, formatHelp } from './command'
import { SimClock } from './clock'
import { EntityIndex } from './entities'
import { formatCard, nextSpeedUnit, speedUnitLabel, withSpeed } from './cards'
import { clamp, distanceKm, formatLat, formatLon } from './geo'
import { Globe } from './globe'
import { PluginRegistry } from './registry'
import { decodeShare, encodeShare } from './share'
import { detectConfOf, MARKER_MAX, MARKER_MIN, SettingsStore } from './settings'
import { Sfx } from './audio'
import { layerHex } from './palette'
import { LEGEND_ROWS, spriteForLayer } from './legend'
import { toMarker, type CommandContext, type GlobeTheme, type LayerHandle, type MarkerStyle, type PluginContext, type WatchRule } from './types'
import { builtinPlugins } from '../plugins'
import { getJson } from '../net/http'
import { clampBox, placeTip } from '../ui/clamp'
import { cfgFrame } from '../ui/hud-frame'
import { buildShell } from '../ui/shell'
import { escapePanels, pointerPanels, togglePanel, toggleRadar, type PanelName } from '../ui/toggles'
import { startRadar } from '../ui/radar'
import { mountViewer } from '../ui/viewer'
import { mountFlightPanel } from '../ui/flight-panel'
import { mountCameraPanel } from '../ui/camera-panel'
import { mountCamerasDesk, type CamerasDesk } from '../ui/cameras-tab'
import { mountNewsDesk, type NewsDesk } from '../ui/news-tab'
import { mountStocksDesk, type StocksDesk } from '../ui/stocks-tab'
import { tabFromShortcut, type TabId } from '../desk/tabs'
import { camById, searchCams } from '../plugins/cameras/catalog'
import { registerCameraOpen } from '../plugins/cameras/focus'
import { flightText, formatFlight } from '../plugins/aircraft/detail'
import { callsignMatch, parseFlightQuery } from '../plugins/aircraft/callsign'
import { parseAdsbRoute } from '../plugins/aircraft/lookup'
import { airAheadOn, airFixNow, airMetaFor, airTrail, setAirAhead } from '../plugins/aircraft/plugin'
import { seekAircraft } from '../plugins/aircraft/seek'
import { pushContactRecent, readContactRecent } from '../search/cache'
import { collapseQuery } from '../search/address'
import { resolvePlaces } from '../search/geocode'
import { citySearch, registerPlaceFly } from '../search/focus'
import { matchContacts, recentHits, type FindHit } from '../search/suggest'
import { paintGlyph } from '../ui/glyph'
import { formatShip, onShipDetail, shipDetailText, shipMeta, shipNow, shipTrackOn, shipTrail, toggleShipTrack } from '../plugins/ships/plugin'
import { formatSat, onSatDetail, satSeries, satTrackOn, toggleSatTrack } from '../plugins/satellites/plugin'
import { heapAction } from '../city/budget'
import { clearTileCache } from '../city/cache'
import { crtForZoom } from './range'

const LAYER_KEY = 'alleyes.layers.v1'
const VIEWER_KEY = 'alleyes.viewer.v1'
const VIEW_KEY = 'alleyes.view.v1'

function loadLayerPrefs(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(LAYER_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, boolean>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function stamp(canvas: HTMLCanvasElement, lines: string[]) {
  const out = document.createElement('canvas')
  out.width = canvas.width
  out.height = canvas.height
  const ctx = out.getContext('2d')
  if (!ctx) return
  ctx.drawImage(canvas, 0, 0)
  const width = Math.min(out.width - 24, 640)
  const height = 28 + lines.length * 26
  ctx.fillStyle = 'rgba(2, 16, 8, 0.82)'
  ctx.fillRect(16, 16, width, height)
  ctx.strokeStyle = '#5dff8f'
  ctx.lineWidth = 4
  ctx.strokeRect(16, 16, width, height)
  ctx.fillStyle = '#e9fff1'
  ctx.font = '22px "Ae Term", monospace'
  lines.forEach((line, index) => ctx.fillText(line, 28, 46 + index * 26))
  const link = document.createElement('a')
  link.href = out.toDataURL('image/png')
  link.download = `all-eyes-${new Date().toISOString().replace(/[:.]/g, '-')}.png`
  link.click()
}

export function boot(root: HTMLElement): void {
  const settings = new SettingsStore()
  const clock = new SimClock()
  const entities = new EntityIndex()
  const alerts = new AlertBoard()
  const audio = new Sfx()
  audio.setMuted(settings.get().mute)
  const shell = buildShell(root)
  const viewer = mountViewer()
  shell.right.prepend(viewer.root)
  const flight = mountFlightPanel()
  shell.layers.parentElement?.append(flight.root)
  const globe = new Globe(shell.canvas, () => clock.now())
  let camerasDesk: CamerasDesk
  let newsDesk: NewsDesk
  let stocksDesk: StocksDesk
  const camPanel = mountCameraPanel({
    follow(cam) {
      if (state.enabled.get('cameras') !== true) setLayer('cameras', true)
      globe.flyTo(cam.lat, cam.lon, 1.6)
      state.following = true
      globe.setFollow({ lat: cam.lat, lon: cam.lon, altKm: 0 })
    },
    open(id) {
      camerasDesk.open(id)
    },
    close() {
      camerasDesk.close()
    },
    conf: () => settings.get().detectConf,
    setConf(value) {
      settings.update({ detectConf: detectConfOf(value) })
    },
    detectOn: (id) => settings.get().detectCams.includes(id),
    setDetect(id, on) {
      const cur = settings.get().detectCams.filter((item) => item !== id)
      settings.update({ detectCams: on ? [id, ...cur].slice(0, 40) : cur })
    },
    subscribe: (cb) => settings.subscribe(cb),
  })
  const registry = new PluginRegistry()
  for (const plugin of builtinPlugins) registry.register(plugin)

  const state = {
    trackId: null as string | null,
    pin: { lat: 14, lon: 12 },
    enabled: new Map<string, boolean>(),
    faults: new Map<string, string>(),
    pendingTrack: null as string | null,
    hoverId: null as string | null,
    hoverX: 24,
    hoverY: 24,
    cardDragged: false,
    following: false,
    history: [] as string[],
    historyAt: -1,
    suggestAt: 0,
  }
  camerasDesk = mountCamerasDesk(shell.cameras, { panel: camPanel, view: () => globe.getView() })
  newsDesk = mountNewsDesk(shell.news, {
    settings,
    newsOn: () => state.enabled.get('news') === true,
    setNewsLayer(on) {
      setLayer('news', on)
    },
  })
  stocksDesk = mountStocksDesk(shell.stocks, settings)
  showTab('globe')
  const trackListeners = new Set<(id: string | null) => void>()
  const pinListeners = new Set<(pin: { lat: number; lon: number }) => void>()
  const handles = new Map<string, LayerHandle>()

  const pluginCtx: PluginContext = {
    globe,
    clock,
    settings,
    alerts,
    publish(layerId, contacts) {
      entities.set(layerId, contacts)
      globe.setMarkers(layerId, contacts.map(toMarker))
    },
    patch(id, partial) {
      const next = entities.patch(id, partial)
      if (next && (state.trackId === id || state.hoverId === id)) {
        renderCard()
        if (state.trackId === id) renderFlight()
      }
      return
    },
    getPin: () => state.pin,
    onPin(cb) {
      pinListeners.add(cb)
      return () => pinListeners.delete(cb)
    },
    getTrackId: () => state.trackId,
    onTrack(cb) {
      trackListeners.add(cb)
      return () => trackListeners.delete(cb)
    },
    nearby(lat, lon, radiusKm) {
      const out = []
      for (const contact of entities.all()) {
        if (distanceKm(lat, lon, contact.lat, contact.lon) <= radiusKm) out.push(contact)
      }
      return out
    },
    log(layerId, message) {
      if (message) state.faults.set(layerId, message)
      else state.faults.delete(layerId)
      renderLayers()
    },
    status(layerId, message) {
      const node = layerId === 'ships' ? shell.ships : layerId === 'satellites' ? shell.sats : layerId === 'aircraft' ? shell.feed : null
      if (!node) return
      node.textContent = message
      node.title = message
      node.classList.toggle('is-off', message.includes('OFFLINE') || message.includes('COVERAGE LIMIT') || message.includes('—'))
      node.classList.toggle('is-rate', message.includes('RATE-LIMITED') || message.includes('PARTIAL'))
    },
  }

  for (const layer of registry.layers()) {
    const controller = new AbortController()
    handles.set(layer.id, layer.create({ ...pluginCtx, signal: controller.signal }))
  }

  const shared = decodeShare(location.hash)
  if (shared?.lat != null && shared.lon != null) {
    globe.setView(shared.lat, shared.lon, shared.range ?? 9800)
    state.pin = { lat: shared.lat, lon: shared.lon }
  }
  const stored = loadLayerPrefs()
  for (const layer of registry.layers()) {
    const on = shared?.layers?.length ? shared.layers.includes(layer.id) : (stored[layer.id] ?? layer.defaultOn)
    state.enabled.set(layer.id, on)
  }
  if (shared?.track) state.pendingTrack = shared.track

  function setPin(lat: number, lon: number) {
    state.pin = { lat, lon }
    for (const fn of pinListeners) fn(state.pin)
  }

  function setTrack(id: string | null) {
    state.trackId = id
    state.cardDragged = false
    state.following = false
    globe.setHighlight(id)
    globe.setFollow(null)
    const contact = id ? entities.get(id) : null
    if (contact) {
      state.following = true
      globe.setFollow({ lat: contact.lat, lon: contact.lon, altKm: contact.altKm })
    }
    shell.track.hidden = !contact
    shell.track.textContent = contact ? `LOCK ${contact.label}` : ''
    if (!id) {
      cardPinned = false
      flight.setPinned(false)
      shell.info.hidden = true
      shell.info.classList.remove('is-moved')
      shell.info.style.left = ''
      shell.info.style.top = ''
    }
    for (const fn of trackListeners) fn(id)
    renderInspect()
    renderCard()
    renderFlight()
  }

  function setLayer(id: string, on: boolean) {
    state.enabled.set(id, on)
    handles.get(id)?.setEnabled(on)
    const prefs: Record<string, boolean> = {}
    for (const [key, value] of state.enabled) prefs[key] = value
    localStorage.setItem(LAYER_KEY, JSON.stringify(prefs))
    renderLayers()
  }

  function renderLayers() {
    shell.layers.replaceChildren()
    for (const layer of registry.layers()) {
      const button = document.createElement('button')
      const on = state.enabled.get(layer.id) === true
      button.type = 'button'
      button.className = `ae-layer${on ? ' is-on' : ''}${state.faults.has(layer.id) ? ' is-fault' : ''}`
      button.title = state.faults.get(layer.id) || layer.description
      const swatch = document.createElement('canvas')
      swatch.className = 'ae-swatch'
      paintGlyph(swatch, spriteForLayer(layer.id), layerHex(layer.id))
      const name = document.createElement('span')
      name.className = 'ae-layer-name'
      name.textContent = layer.label
      const count = document.createElement('span')
      count.className = 'ae-layer-count'
      count.textContent = on ? String(entities.of(layer.id).length) : '—'
      button.append(swatch, name, count)
      button.addEventListener('click', () => {
        audio.play('click')
        setLayer(layer.id, !on)
      })
      shell.layers.append(button)
    }
  }

  function renderLegend() {
    shell.legend.replaceChildren()
    for (const row of LEGEND_ROWS) {
      const line = document.createElement('div')
      line.className = 'ae-legend-row'
      if (row.kind === 'icon') {
        const swatch = document.createElement('canvas')
        swatch.className = 'ae-swatch'
        paintGlyph(swatch, row.sprite, layerHex(row.id))
        line.append(swatch)
      } else if (row.id === 'select') {
        line.append(Object.assign(document.createElement('i'), { className: 'ae-legend-ring' }))
      } else {
        const mark = document.createElement('i')
        mark.className = row.dashed ? 'ae-legend-dash' : 'ae-legend-solid'
        line.append(mark)
      }
      const copy = document.createElement('div')
      copy.className = 'ae-legend-copy'
      const name = document.createElement('div')
      name.className = 'ae-legend-name'
      name.textContent = row.name
      const meaning = document.createElement('div')
      meaning.className = 'ae-legend-mean'
      meaning.textContent = row.meaning
      copy.append(name, meaning)
      line.append(copy)
      shell.legend.append(line)
    }
  }

  function applyRadar(on: boolean) {
    shell.radarWrap.hidden = !on
    shell.radarToggle.textContent = on ? 'HIDE' : 'SHOW'
    shell.radarToggle.title = on ? 'Hide the radar' : 'Show the radar'
    shell.radarBtn.classList.toggle('is-on', on)
    shell.radarBtn.setAttribute('aria-pressed', on ? 'true' : 'false')
  }

  let panel: PanelName | null = null
  let painting = false

  function placeCfg() {
    const box = cfgFrame(window.innerWidth, window.innerHeight)
    const dialog = shell.settingsForm
    dialog.style.top = `${box.y}px`
    dialog.style.left = `${box.x}px`
    dialog.style.width = `${box.w}px`
    dialog.style.height = `${box.h}px`
  }

  function paintMute(muted: boolean) {
    const label = muted ? 'MUT' : 'SND'
    for (const node of shell.mute.querySelectorAll('.ae-full, .ae-short')) node.textContent = label
    shell.mute.classList.toggle('is-on', !muted)
    shell.mute.setAttribute('aria-pressed', muted ? 'false' : 'true')
    shell.mute.title = muted ? 'Sound is off' : 'Sound is on'
  }

  function paintPanel() {
    const name = panel
    shell.settings.hidden = name !== 'cfg'
    shell.cfg.classList.toggle('is-on', name === 'cfg')
    shell.cfg.setAttribute('aria-pressed', name === 'cfg' ? 'true' : 'false')
    shell.link.classList.toggle('is-on', name === 'link')
    shell.link.setAttribute('aria-pressed', name === 'link' ? 'true' : 'false')
    shell.shot.classList.toggle('is-on', name === 'shot')
    shell.shot.setAttribute('aria-pressed', name === 'shot' ? 'true' : 'false')
    if (name !== 'link' && name !== 'shot') shell.output.hidden = true
    shell.legendRoot.classList.toggle('is-on', name === 'legend')
    if (shell.legendRoot.open !== (name === 'legend')) {
      painting = true
      shell.legendRoot.open = name === 'legend'
      painting = false
    }
    if (flight.moreOpen() !== (name === 'more')) flight.setMore(name === 'more')
    if (name === 'cfg') placeCfg()
  }

  function openPanel(next: PanelName | null) {
    panel = next
    paintPanel()
  }

  function fillCfg() {
    const current = settings.get()
    const form = shell.settingsForm
    ;(form.elements.namedItem('openskyId') as HTMLInputElement).value = current.openskyId
    ;(form.elements.namedItem('openskySecret') as HTMLInputElement).value = current.openskySecret
    ;(form.elements.namedItem('firmsKey') as HTMLInputElement).value = current.firmsKey
    ;(form.elements.namedItem('aisstreamKey') as HTMLInputElement).value = current.aisstreamKey
    ;(form.elements.namedItem('maptilerKey') as HTMLInputElement).value = current.maptilerKey
    ;(form.elements.namedItem('mapboxKey') as HTMLInputElement).value = current.mapboxKey
    ;(form.elements.namedItem('tomtomKey') as HTMLInputElement).value = current.tomtomKey
    ;(form.elements.namedItem('hereKey') as HTMLInputElement).value = current.hereKey
    ;(form.elements.namedItem('windyKey') as HTMLInputElement).value = current.windyKey
    ;(form.elements.namedItem('wsdotKey') as HTMLInputElement).value = current.wsdotKey
    ;(form.elements.namedItem('ohgoKey') as HTMLInputElement).value = current.ohgoKey
    ;(form.elements.namedItem('newsApiKey') as HTMLInputElement).value = current.newsApiKey
    ;(form.elements.namedItem('gnewsKey') as HTMLInputElement).value = current.gnewsKey
    ;(form.elements.namedItem('finnhubKey') as HTMLInputElement).value = current.finnhubKey
    ;(form.elements.namedItem('twelveKey') as HTMLInputElement).value = current.twelveKey
    ;(form.elements.namedItem('alphaKey') as HTMLInputElement).value = current.alphaKey
    ;(form.elements.namedItem('polygonKey') as HTMLInputElement).value = current.polygonKey
    ;(form.elements.namedItem('fmpKey') as HTMLInputElement).value = current.fmpKey
    ;(form.elements.namedItem('detectConf') as HTMLInputElement).value = String(current.detectConf)
    ;(form.elements.namedItem('basemapSource') as HTMLSelectElement).value = current.basemapSource
    ;(form.elements.namedItem('markerSize') as HTMLInputElement).value = String(current.markerSize)
    ;(form.elements.namedItem('crt') as HTMLInputElement).value = String(current.crt)
    ;(form.elements.namedItem('theme') as HTMLSelectElement).value = current.theme
    ;(form.elements.namedItem('markerStyle') as HTMLSelectElement).value = current.markerStyle
  }

  let cardPinned = false

  function setCardPinned(on: boolean) {
    cardPinned = on
    state.cardDragged = false
    shell.info.classList.remove('is-moved')
    shell.info.style.left = ''
    shell.info.style.top = ''
    flight.setPinned(on)
    renderCard()
  }

  function accentFor(id: string | null): string {
    const contact = id ? entities.get(id) : null
    if (!contact) return layerHex('aircraft')
    if (contact.shape === 'air-gnd') return layerHex('airground')
    return layerHex(contact.layerId)
  }

  function cardBody(contact: { detail: string; card?: { k: string; v: string }[]; speedKt?: number }): string {
    const unit = settings.get().speedUnit
    if (contact.card?.length) return formatCard(withSpeed(contact.card, contact.speedKt, unit))
    return contact.detail
  }

  function renderInspect() {
    const contact = state.trackId ? entities.get(state.trackId) : null
    if (!contact) {
      shell.inspect.textContent = 'HOVER OR CLICK A MARKER'
      return
    }
    shell.inspect.textContent = `${contact.label}\n${cardBody(contact)}`
  }

  function placeCard(x: number, y: number) {
    const width = shell.info.offsetWidth || 240
    const height = shell.info.offsetHeight || 180
    const box = clampBox(x, y, width, height, window.innerWidth, window.innerHeight)
    shell.info.classList.add('is-moved')
    shell.info.style.left = `${box.left}px`
    shell.info.style.top = `${box.top}px`
  }

  function focusContact() {
    const hovered = state.hoverId ? entities.get(state.hoverId) : null
    const pinned = state.trackId ? entities.get(state.trackId) : null
    return hovered ?? pinned ?? null
  }

  function renderCard() {
    const pinned = state.trackId ? entities.get(state.trackId) : null
    const contact = focusContact()
    const unit = speedUnitLabel(settings.get().speedUnit)
    viewer.speed.textContent = unit
    shell.infoSpeed.textContent = unit
    if (!contact) {
      const preview = new URLSearchParams(window.location.search).get('model')
      if (preview) {
        viewer.show(preview, 6)
        viewer.title.textContent = 'MODEL VIEWER'
        viewer.card.textContent = preview.toUpperCase()
        shell.info.hidden = true
        return
      }
      viewer.idle()
      viewer.title.textContent = 'MODEL VIEWER'
      viewer.card.textContent = 'NO CONTACT SELECTED'
      shell.info.hidden = true
      return
    }
    viewer.show(contact.shape || 'dot', contact.pitch ?? 0)
    const locked = Boolean(pinned && contact.id === pinned.id)
    viewer.title.textContent = locked ? `LOCK ${contact.label}` : contact.label
    viewer.card.textContent = cardBody(contact)
    if (!cardPinned) {
      shell.info.hidden = true
      return
    }
    shell.info.hidden = false
    shell.info.classList.add('is-pin')
    shell.infoTitle.textContent = viewer.title.textContent
    shell.infoBody.textContent = viewer.card.textContent
  }

  function renderFlight() {
    const hud = shell.hud
    const id = state.trackId
    flight.root.style.setProperty('--accent', accentFor(id))
    const unit = settings.get().speedUnit
    if (id?.startsWith('air:')) {
      const hex = id.slice(4)
      const fix = airFixNow(hex)
      if (!fix) {
        flight.setView(null)
        flight.setGraph([])
        hud?.classList.remove('is-flight')
        renderCamera()
        return
      }
      flight.setView(formatFlight(fix, airMetaFor(hex), unit))
      flight.setRouteOn(airAheadOn())
      flight.setGraph(airTrail(hex).map((sample) => ({
        altFt: sample.altBaroFt ?? sample.altGpsFt ?? sample.altM * 3.28084,
        gsKt: sample.speedKt,
      })))
      hud?.classList.add('is-flight')
      renderCamera()
      return
    }
    if (id?.startsWith('ship:')) {
      const ship = shipNow(Number(id.slice(5)))
      if (!ship) {
        flight.setView(null)
        flight.setGraph([])
        hud?.classList.remove('is-flight')
        renderCamera()
        return
      }
      flight.setView(formatShip(ship, shipMeta(ship.mmsi), unit))
      flight.setRouteOn(shipTrackOn())
      flight.setGraph(shipTrail(ship.mmsi).map((sample) => ({ altFt: sample.cog, gsKt: sample.sog })), 'CSE  BRIGHT    SPD  DIM')
      hud?.classList.add('is-flight')
      renderCamera()
      return
    }
    if (id?.startsWith('sat:')) {
      const view = formatSat(Number(id.slice(4)), state.pin)
      if (!view) {
        flight.setView(null)
        flight.setGraph([])
        hud?.classList.remove('is-flight')
        renderCamera()
        return
      }
      flight.setView(view)
      flight.setRouteOn(satTrackOn())
      flight.setGraph(satSeries(Number(id.slice(4))), 'ALT  BRIGHT    SPD  DIM  PROPAGATED')
      hud?.classList.add('is-flight')
      renderCamera()
      return
    }
    flight.setView(null)
    flight.setGraph([])
    hud?.classList.remove('is-flight')
    renderCamera()
  }

  function renderCamera() {
    shell.hud.classList.remove('is-cam')
  }

  function showTab(tab: TabId) {
    for (const id of ['globe', 'cameras', 'news', 'stocks'] as const) {
      const button = shell.tabs[id]
      button.classList.toggle('is-on', id === tab)
      button.setAttribute('aria-selected', id === tab ? 'true' : 'false')
    }
    const desk = tab !== 'globe'
    root.classList.toggle('is-desk', desk)
    shell.cameras.classList.toggle('is-on', tab === 'cameras')
    shell.news.classList.toggle('is-on', tab === 'news')
    shell.stocks.classList.toggle('is-on', tab === 'stocks')
    globe.setRunning(!desk)
    camerasDesk.setActive(tab === 'cameras')
    newsDesk.setActive(tab === 'news')
    stocksDesk.setActive(tab === 'stocks')
    if (desk) shell.tip.hidden = true
  }

  function renderAlerts() {
    shell.alerts.replaceChildren()
    for (const item of alerts.items.slice(0, 3)) {
      const card = document.createElement('div')
      card.className = 'ae-alert' + (Date.now() - item.at < 8000 ? ' is-new' : '')
      const title = document.createElement('strong')
      title.textContent = item.title
      const detail = document.createElement('span')
      detail.textContent = item.detail
      card.append(title, detail)
      shell.alerts.append(card)
    }
    shell.chips.replaceChildren()
    for (const rule of alerts.rules) {
      const chip = document.createElement('button')
      chip.type = 'button'
      chip.className = 'ae-chip'
      chip.textContent = `${rule.kind.toUpperCase()} ${rule.value} ×`
      chip.addEventListener('click', () => alerts.remove(rule.id))
      shell.chips.append(chip)
    }
  }

  function updateCounts() {
    const buttons = shell.layers.querySelectorAll<HTMLButtonElement>('.ae-layer')
    registry.layers().forEach((layer, index) => {
      const count = buttons[index]?.querySelector('.ae-layer-count')
      if (!count) return
      const on = state.enabled.get(layer.id) === true
      count.textContent = on ? String(entities.of(layer.id).length || (layer.id === 'weather' ? 'RAD' : 0)) : '—'
      buttons[index]?.classList.toggle('is-fault', state.faults.has(layer.id))
    })
  }

  function scanWatches() {
    if (!alerts.rules.some((rule) => rule.kind !== 'pass')) return
    let ping = false
    for (const rule of alerts.rules) {
      if (rule.kind === 'pass') continue
      for (const contact of entities.all()) {
        if (rule.kind === 'quake' && contact.kind === 'quake' && (contact.mag ?? 0) >= Number(rule.value)) {
          if (alerts.raise(`quake:${rule.id}:${contact.id}`, `QUAKE M${(contact.mag ?? 0).toFixed(1)}`, contact.label)) ping = true
        }
        if (rule.kind === 'flight' && contact.kind === 'air') {
          const hay = `${contact.callsign ?? ''} ${contact.label}`.toUpperCase()
          if (hay.includes(rule.value.toUpperCase())) {
            if (alerts.raise(`flight:${rule.id}:${contact.id}`, `FLIGHT ${contact.callsign || contact.label}`, contact.detail.split('\n')[0] ?? '')) ping = true
          }
        }
      }
    }
    if (ping) audio.play('alert')
  }

  function helpText(): string {
    return formatHelp(registry)
  }

  async function copyLink(): Promise<string> {
    const view = globe.getView()
    const layers = registry.layers().filter((layer) => state.enabled.get(layer.id)).map((layer) => layer.id)
    const hash = encodeShare({ lat: view.lat, lon: view.lon, range: view.rangeKm, layers, track: state.trackId })
    const url = `${location.origin}${location.pathname}#${hash}`
    location.hash = hash
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      /* hash is still updated */
    }
    return url
  }

  function screenshot() {
    const view = globe.getView()
    stamp(globe.canvas, [
      'ALL EYES',
      new Date(clock.now()).toISOString().slice(0, 19) + 'Z',
      `${formatLat(view.lat)}  ${formatLon(view.lon)}  RNG ${Math.round(view.rangeKm)}KM`,
      state.trackId ? `LOCK ${entities.get(state.trackId)?.label ?? state.trackId}` : 'WIDE VIEW',
    ])
    audio.play('shot')
  }

  function applyLook() {
    const current = settings.get()
    globe.setTheme(current.theme)
    globe.setMarkerSize(current.markerSize)
    shell.canvas.classList.toggle('is-color', current.theme === 'color')
    const crtNow = crtForZoom(current.crt, globe.getView().rangeKm)
    shell.globeCrt.style.setProperty('--crt', crtNow.toFixed(3))
    shell.globeCrt.classList.toggle('is-off', crtNow <= 0.001)
    applyRadar(current.radar)
    renderLegend()
    renderLayers()
    const form = shell.settingsForm
    const sizeInput = form.elements.namedItem('markerSize') as HTMLInputElement | null
    const crtInput = form.elements.namedItem('crt') as HTMLInputElement | null
    const themeInput = form.elements.namedItem('theme') as HTMLSelectElement | null
    if (sizeInput) sizeInput.value = String(current.markerSize)
    if (crtInput) crtInput.value = String(current.crt)
    if (themeInput) themeInput.value = current.theme
  }

  let findHits: FindHit[] = []
  let findAt = 0
  let findQuery = ''

  function showFindCard(text: string) {
    shell.findCard.hidden = !text
    shell.findCard.textContent = text
  }

  function paintFind(hits: FindHit[], keep = false) {
    findHits = hits
    findQuery = shell.find.value.trim()
    if (!keep) findAt = 0
    if (findAt >= hits.length) findAt = 0
    shell.findList.replaceChildren()
    if (!hits.length) {
      shell.findList.hidden = true
      return
    }
    shell.findList.hidden = false
    let group = ''
    hits.forEach((hit, index) => {
      if (hit.group !== group) {
        group = hit.group
        const label = document.createElement('div')
        label.className = 'ae-find-group'
        label.textContent = group.toUpperCase()
        shell.findList.append(label)
      }
      const button = document.createElement('button')
      button.type = 'button'
      button.className = `ae-find-hit${index === findAt ? ' is-on' : ''}`
      const icon = document.createElement('canvas')
      icon.className = 'ae-swatch'
      paintGlyph(icon, hit.sprite, layerHex(hit.layerId))
      const title = document.createElement('span')
      title.textContent = hit.title
      const detail = document.createElement('small')
      detail.textContent = hit.detail
      button.append(icon, title, detail)
      button.addEventListener('mousedown', (event) => event.preventDefault())
      button.addEventListener('click', () => {
        void pickFind(hit).then((line) => showOutput(line))
      })
      shell.findList.append(button)
    })
  }

  function dropSearchPin(lat: number, lon: number) {
    setPin(lat, lon)
    globe.setMarkers('searchpin', [{
      id: 'search:pin',
      lat,
      lon,
      altKm: 0,
      heading: 0,
      pitch: 0,
      brightness: 1,
      shape: 'drop',
      scale: 1.35,
    }])
  }

  function armStreet(rangeKm: number) {
    if (rangeKm <= 12 && state.enabled.get('imagery') !== true) setLayer('imagery', true)
    if (rangeKm <= 2) {
      if (state.enabled.get('roads') !== true) setLayer('roads', true)
      if (state.enabled.get('buildings') !== true) setLayer('buildings', true)
    }
  }

  function lockContact(id: string, lat?: number, lon?: number): string {
    if (id.startsWith('cam:') && !id.startsWith('camc:')) {
      if (state.enabled.get('cameras') !== true) setLayer('cameras', true)
      showTab('cameras')
      camerasDesk.open(id)
      const cam = camById(id)
      const atLat = cam?.lat ?? lat
      const atLon = cam?.lon ?? lon
      if (atLat != null && atLon != null) globe.flyTo(atLat, atLon, 1.6)
      const label = cam?.name || id
      showFindCard(label)
      return `OPEN ${label}`
    }
    if (id.startsWith('air:')) {
      if (state.enabled.get('aircraft') !== true) setLayer('aircraft', true)
      if (state.enabled.get('airground') !== true) setLayer('airground', true)
    }
    if (id.startsWith('cam:') && state.enabled.get('cameras') !== true) setLayer('cameras', true)
    setTrack(id)
    const contact = entities.get(id)
    const atLat = contact?.lat ?? lat
    const atLon = contact?.lon ?? lon
    if (atLat != null && atLon != null) {
      const range = id.startsWith('sat:') ? 1800 : id.startsWith('ship:') ? 40 : id.startsWith('cam:') ? 1.6 : 420
      globe.flyTo(atLat, atLon, range)
    }
    const label = contact?.label || id
    showFindCard(label)
    return `LOCK ${label}`
  }

  async function seekAndLock(query: string): Promise<string> {
    const parsed = parseFlightQuery(query)
    const local = entities.all().find((contact) => {
      if (contact.kind !== 'air') return false
      const reg = contact.card?.find((row) => row.k === 'REG')?.v ?? ''
      const hex = contact.id.startsWith('air:') ? contact.id.slice(4) : ''
      return callsignMatch(contact.callsign ?? '', reg, hex, parsed)
    })
    if (local) return lockContact(local.id)
    if (state.enabled.get('aircraft') !== true) setLayer('aircraft', true)
    const fix = await seekAircraft(parsed, settings)
    if (fix) return lockContact(`air:${fix.icao}`, fix.lat, fix.lon)
    const cs = (parsed.candidates.find((item) => /^[A-Z]{3}/.test(item)) || parsed.raw).toUpperCase()
    let routeText = ''
    if (/^[A-Z0-9]{3,8}$/.test(cs)) {
      try {
        const route = parseAdsbRoute(await getJson(`/api/adsbdb/callsign?cs=${encodeURIComponent(cs)}`, settings))
        if (route?.origin || route?.destination) {
          routeText = `\n${route.origin || '----'} ${route.originCity || ''} -> ${route.destination || '----'} ${route.destCity || ''}`.trimEnd()
        }
      } catch {
        /* route stays blank when adsbdb has nothing */
      }
    }
    const text = `NOT CURRENTLY TRACKED\n${cs}${routeText}`
    showFindCard(text)
    return 'NOT CURRENTLY TRACKED'
  }

  async function pickFind(hit: FindHit): Promise<string> {
    shell.findList.hidden = true
    if (hit.group === 'Recent' && hit.query) {
      shell.find.value = hit.query
      refreshFind(hit.query)
      return hit.query.toUpperCase()
    }
    pushContactRecent(hit.title)
    if (hit.seek && hit.query) return seekAndLock(hit.query)
    if (hit.contactId) return lockContact(hit.contactId, hit.lat, hit.lon)
    showFindCard('NO RESULTS')
    return 'NO RESULTS'
  }

  function cameraHits(query: string): FindHit[] {
    return searchCams(query, 8).map((cam) => ({
      group: 'Cameras' as const,
      key: cam.id,
      title: cam.name,
      detail: [cam.road, cam.direction, cam.agency].filter(Boolean).join(' · '),
      sprite: 'cam',
      layerId: 'cameras',
      lat: cam.lat,
      lon: cam.lon,
      contactId: cam.id,
    }))
  }

  function refreshFind(query: string) {
    const text = query.trim()
    const hits = text ? [...matchContacts(text, entities.all()), ...cameraHits(text)] : recentHits(readContactRecent())
    paintFind(hits)
    if (text && !hits.length) {
      shell.findList.hidden = false
      const empty = document.createElement('div')
      empty.className = 'ae-find-group'
      empty.textContent = 'NO RESULTS'
      shell.findList.replaceChildren(empty)
    }
  }

  async function goContact(query: string): Promise<string> {
    const text = query.trim()
    if (!text) return 'USAGE: SEARCH A FLIGHT, SHIP, SATELLITE, OR CAMERA'
    const contacts = matchContacts(text, entities.all())
    const known = contacts.find((hit) => hit.contactId)
    if (known?.contactId) {
      pushContactRecent(text)
      return lockContact(known.contactId, known.lat, known.lon)
    }
    const flight = parseFlightQuery(text)
    if (flight.kind === 'iata' || flight.kind === 'icao' || flight.kind === 'hex' || flight.kind === 'reg') {
      pushContactRecent(text)
      return seekAndLock(text)
    }
    const cam = cameraHits(text)[0]
    if (cam?.contactId) {
      pushContactRecent(text)
      return lockContact(cam.contactId, cam.lat, cam.lon)
    }
    const seek = contacts.find((hit) => hit.seek)
    if (seek?.query) {
      pushContactRecent(text)
      return seekAndLock(seek.query)
    }
    showFindCard('NO RESULTS')
    return 'NO RESULTS'
  }

  async function goQuery(query: string): Promise<string> {
    const text = query.trim()
    if (!text) return 'USAGE: GO <PLACE>'
    const api = citySearch()
    if (api) return api.run(text)
    const collapsed = collapseQuery(text)
    if (!collapsed) return 'NO RESULTS'
    const places = await resolvePlaces(collapsed, settings)
    const place = places[0]
    if (!place) return `NO RESULTS "${collapsed.toUpperCase()}"`
    armStreet(place.rangeKm)
    dropSearchPin(place.lat, place.lon)
    globe.flyTo(place.lat, place.lon, place.rangeKm)
    const miss = Boolean(place.quality) && place.quality !== 'EXACT' && place.quality !== 'INTERPOLATED'
    return miss ? `NO EXACT MATCH ${place.label.toUpperCase()}` : `FLY ${place.label.toUpperCase()}`
  }

  const commands: CommandContext = {
    flyTo: (lat, lon, range) => globe.flyTo(lat, lon, range),
    getView: () => globe.getView(),
    track: (id) => setTrack(id),
    setLayer,
    layers: () => registry.layers().map((layer) => ({ id: layer.id, label: layer.label, on: state.enabled.get(layer.id) === true })),
    async searchPlace(query) {
      try {
        const hit = (await resolvePlaces(query, settings))[0]
        return hit ? { lat: hit.lat, lon: hit.lon, label: hit.label } : null
      } catch {
        return null
      }
    },
    findContact: (query) => entities.find(query),
    go: (query) => goQuery(query),
    contacts: () => entities.all(),
    setTimeMinutes(mins) {
      if (mins === 'live') clock.setOffsetMs(0)
      else clock.setOffsetMs(mins * 60_000)
      shell.scrub.value = String(Math.round(clock.offsetMs / 60_000))
    },
    getTimeMinutes: () => Math.round(clock.offsetMs / 60_000),
    toggleMute() {
      const mute = !settings.get().mute
      settings.update({ mute })
      audio.setMuted(mute)
      paintMute(mute)
      return mute
    },
    setMarkerSize(scale) {
      settings.update({ markerSize: clamp(scale, MARKER_MIN, MARKER_MAX) })
      applyLook()
    },
    getMarkerSize: () => settings.get().markerSize,
    setTheme(theme: GlobeTheme) {
      settings.update({ theme: theme === 'green' ? 'green' : 'color' })
      applyLook()
    },
    getTheme: () => settings.get().theme,
    setCrt(amount) {
      settings.update({ crt: clamp(amount, 0, 1) })
      applyLook()
    },
    getCrt: () => settings.get().crt,
    setMarkerStyle(style: MarkerStyle) {
      settings.update({ markerStyle: style === 'mono' ? 'mono' : 'color' })
      applyLook()
      renderFlight()
    },
    getMarkerStyle: () => settings.get().markerStyle,
    setColorOverride(layerId, hex) {
      const next = { ...settings.get().colorOverrides }
      if (!hex) delete next[layerId]
      else next[layerId] = hex
      settings.update({ colorOverrides: next, markerStyle: 'color' })
      applyLook()
      renderFlight()
    },
    clearColorOverrides() {
      settings.update({ colorOverrides: {}, markerStyle: 'color' })
      applyLook()
      renderFlight()
    },
    setRadar(on) {
      settings.update({ radar: on })
      applyRadar(on)
      return on
    },
    radarOn: () => settings.get().radar,
    setViewer(open) {
      viewer.setOpen(open)
      try {
        localStorage.setItem(VIEWER_KEY, open ? '1' : '0')
      } catch {
        /* private mode */
      }
      renderCard()
    },
    viewerOpen: () => viewer.isOpen(),
    screenshot,
    copyLink,
    alerts,
    getPin: () => state.pin,
    setPin,
    getTrackId: () => state.trackId,
    help: helpText,
  }

  function showOutput(text: string) {
    shell.output.hidden = !text
    shell.output.textContent = text
    if (panel === 'link' || panel === 'shot') openPanel(null)
  }

  async function runPrompt(line: string) {
    const trimmed = line.trim()
    if (!trimmed) return
    state.history.unshift(trimmed)
    state.history = state.history.slice(0, 40)
    state.historyAt = -1
    shell.prompt.value = ''
    shell.suggest.hidden = true
    const result = await execute(trimmed, registry, commands)
    showOutput(result)
    if (result.startsWith('NO SUCH') || result.startsWith('FAULT') || result.startsWith('NO ')) audio.play('error')
    else audio.play('click')
  }

  function suggestions(text: string): { name: string; summary: string }[] {
    const token = text.trim().toLowerCase().split(/\s+/)[0] ?? ''
    if (!token) return []
    return registry.commands()
      .filter((command) => command.name.startsWith(token))
      .slice(0, 6)
      .map((command) => ({ name: command.name, summary: command.summary }))
  }

  function paintSuggest() {
    const items = suggestions(shell.prompt.value)
    shell.suggest.hidden = items.length === 0 || document.activeElement !== shell.prompt
    shell.suggest.replaceChildren()
    items.forEach((item, index) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = index === state.suggestAt ? 'is-hot' : ''
      button.textContent = `${item.name.toUpperCase()}  ${item.summary}`
      button.addEventListener('mousedown', (event) => {
        event.preventDefault()
        shell.prompt.value = item.name + ' '
        shell.prompt.focus()
      })
      shell.suggest.append(button)
    })
  }

  shell.find.form?.addEventListener('submit', (event) => {
    event.preventDefault()
    const text = shell.find.value.trim()
    const current = !shell.findList.hidden && findQuery === text
    const picked = current ? findHits[findAt] : undefined
    const job = picked && (picked.contactId || picked.seek || picked.group === 'Recent')
      ? pickFind(picked)
      : goContact(text)
    void job.then((line) => showOutput(line))
  })
  shell.find.addEventListener('input', () => {
    void refreshFind(shell.find.value)
  })
  shell.find.addEventListener('focus', () => {
    void refreshFind(shell.find.value)
  })
  shell.find.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!findHits.length || shell.findList.hidden) return
      event.preventDefault()
      findAt = event.key === 'ArrowDown'
        ? (findAt + 1) % findHits.length
        : (findAt - 1 + findHits.length) % findHits.length
      paintFind(findHits, true)
    } else if (event.key === 'Escape') {
      shell.findList.hidden = true
      shell.find.blur()
    }
  })
  shell.prompt.form?.addEventListener('submit', (event) => {
    event.preventDefault()
    void runPrompt(shell.prompt.value)
  })
  shell.prompt.addEventListener('input', () => {
    state.suggestAt = 0
    paintSuggest()
  })
  shell.prompt.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      state.historyAt = Math.min(state.history.length - 1, state.historyAt + 1)
      shell.prompt.value = state.history[state.historyAt] ?? ''
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      state.historyAt = Math.max(-1, state.historyAt - 1)
      shell.prompt.value = state.historyAt < 0 ? '' : (state.history[state.historyAt] ?? '')
    } else if (event.key === 'Tab') {
      const items = suggestions(shell.prompt.value)
      const pick = items[state.suggestAt]
      if (pick) {
        event.preventDefault()
        shell.prompt.value = pick.name + ' '
      }
    } else if (event.key === 'Escape') {
      event.stopPropagation()
      shell.suggest.hidden = true
      shell.output.hidden = true
      if (panel === 'link' || panel === 'shot') openPanel(null)
      shell.prompt.blur()
    }
  })

  shell.scrub.addEventListener('input', () => {
    clock.setOffsetMs(Number(shell.scrub.value) * 60_000)
  })
  shell.liveBtn.addEventListener('click', () => {
    audio.play('click')
    clock.setOffsetMs(0)
    shell.scrub.value = '0'
  })
  shell.mute.addEventListener('click', () => commands.toggleMute())
  shell.shot.addEventListener('click', () => {
    if (panel === 'shot') {
      openPanel(null)
      return
    }
    screenshot()
    shell.output.hidden = false
    shell.output.textContent = 'SHOT SAVED'
    openPanel('shot')
  })
  shell.link.addEventListener('click', () => {
    if (panel === 'link') {
      openPanel(null)
      return
    }
    void copyLink().then((url) => {
      shell.output.hidden = false
      shell.output.textContent = `LINK ${url}`
      openPanel('link')
    })
  })
  shell.radarBtn.addEventListener('click', () => {
    audio.play('click')
    const next = toggleRadar({ panel, radar: settings.get().radar, sound: !settings.get().mute, viewer: viewer.isOpen() })
    const on = commands.setRadar(next.radar)
    if (panel === 'link' || panel === 'shot') openPanel(null)
    shell.output.hidden = false
    shell.output.textContent = on ? 'RADAR ON' : 'RADAR OFF'
  })
  for (const id of ['globe', 'cameras', 'news', 'stocks'] as const) {
    shell.tabs[id].addEventListener('click', () => {
      audio.play('click')
      showTab(id)
    })
  }
  shell.tabCfg.addEventListener('click', () => shell.cfg.click())
  shell.cfg.addEventListener('click', () => {
    audio.play('click')
    const next = togglePanel({ panel, radar: settings.get().radar, sound: !settings.get().mute, viewer: viewer.isOpen() }, 'cfg')
    if (next.panel === 'cfg') fillCfg()
    openPanel(next.panel)
  })
  shell.cfgClose.addEventListener('click', () => {
    audio.play('click')
    openPanel(null)
  })
  shell.settingsForm.addEventListener('submit', (event) => {
    event.preventDefault()
    const form = shell.settingsForm
    settings.update({
      openskyId: (form.elements.namedItem('openskyId') as HTMLInputElement).value.trim(),
      openskySecret: (form.elements.namedItem('openskySecret') as HTMLInputElement).value.trim(),
      firmsKey: (form.elements.namedItem('firmsKey') as HTMLInputElement).value.trim(),
      aisstreamKey: (form.elements.namedItem('aisstreamKey') as HTMLInputElement).value.trim(),
      maptilerKey: (form.elements.namedItem('maptilerKey') as HTMLInputElement).value.trim(),
      mapboxKey: (form.elements.namedItem('mapboxKey') as HTMLInputElement).value.trim(),
      tomtomKey: (form.elements.namedItem('tomtomKey') as HTMLInputElement).value.trim(),
      hereKey: (form.elements.namedItem('hereKey') as HTMLInputElement).value.trim(),
      windyKey: (form.elements.namedItem('windyKey') as HTMLInputElement).value.trim(),
      wsdotKey: (form.elements.namedItem('wsdotKey') as HTMLInputElement).value.trim(),
      ohgoKey: (form.elements.namedItem('ohgoKey') as HTMLInputElement).value.trim(),
      newsApiKey: (form.elements.namedItem('newsApiKey') as HTMLInputElement).value.trim(),
      gnewsKey: (form.elements.namedItem('gnewsKey') as HTMLInputElement).value.trim(),
      finnhubKey: (form.elements.namedItem('finnhubKey') as HTMLInputElement).value.trim(),
      twelveKey: (form.elements.namedItem('twelveKey') as HTMLInputElement).value.trim(),
      alphaKey: (form.elements.namedItem('alphaKey') as HTMLInputElement).value.trim(),
      polygonKey: (form.elements.namedItem('polygonKey') as HTMLInputElement).value.trim(),
      fmpKey: (form.elements.namedItem('fmpKey') as HTMLInputElement).value.trim(),
      detectConf: detectConfOf((form.elements.namedItem('detectConf') as HTMLInputElement).value),
      basemapSource: (form.elements.namedItem('basemapSource') as HTMLSelectElement).value === 'mapbox'
        ? 'mapbox'
        : (form.elements.namedItem('basemapSource') as HTMLSelectElement).value === 'maptiler'
          ? 'maptiler'
          : 'free',
      markerStyle: (form.elements.namedItem('markerStyle') as HTMLSelectElement).value === 'mono' ? 'mono' : 'color',
    })
    openPanel(null)
    const size = Number((form.elements.namedItem('markerSize') as HTMLInputElement).value)
    if (Number.isFinite(size)) commands.setMarkerSize(size)
    const crt = Number((form.elements.namedItem('crt') as HTMLInputElement).value)
    if (Number.isFinite(crt)) commands.setCrt(crt)
    commands.setTheme((form.elements.namedItem('theme') as HTMLSelectElement).value === 'green' ? 'green' : 'color')
    showOutput('KEYS STORED LOCALLY')
    audio.play('click')
  })
  const clearCache = shell.settingsForm.elements.namedItem('clearCache') as HTMLButtonElement | null
  clearCache?.addEventListener('click', () => {
    audio.play('click')
    globe.clearCityCache()
    void clearTileCache().then(() => showOutput('MAP CACHE CLEARED'))
  })
  shell.watchForm.addEventListener('submit', (event) => {
    event.preventDefault()
    const data = new FormData(shell.watchForm)
    const kind = String(data.get('kind') || 'quake') as WatchRule['kind']
    const value = String(data.get('value') || '').trim()
    void runPrompt(`watch ${kind} ${value || (kind === 'quake' ? '5' : kind === 'pass' ? 'ISS' : '')}`)
    shell.watchForm.reset()
  })

  window.addEventListener('keydown', (event) => {
    const tabKey = tabFromShortcut(event.key)
    if ((event.metaKey || event.ctrlKey) && tabKey) {
      event.preventDefault()
      showTab(tabKey)
      return
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
      event.preventDefault()
      shell.find.focus()
      shell.find.select()
      return
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault()
      citySearch()?.focus()
      return
    }
    if (event.key !== 'Escape') return
    if (!shell.findList.hidden) {
      shell.findList.hidden = true
      event.stopPropagation()
      return
    }
    const open = panel !== null || !shell.output.hidden || !shell.suggest.hidden || flight.moreOpen()
    if (!open) return
    shell.suggest.hidden = true
    openPanel(escapePanels({ panel, radar: settings.get().radar, sound: !settings.get().mute, viewer: viewer.isOpen() }).panel)
    event.stopPropagation()
  }, true)
  window.addEventListener('keydown', (event) => {
    const typing = document.activeElement === shell.prompt || (document.activeElement instanceof HTMLInputElement)
    if (event.key === '/' && !typing) {
      event.preventDefault()
      shell.prompt.focus()
    } else if (event.key === 'Escape') {
      if (!typing) setTrack(null)
    } else if (!typing && (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      const view = globe.getView()
      const step = 4 * (view.rangeKm / 10000)
      if (event.key === 'ArrowLeft') globe.setView(view.lat, view.lon - step, view.rangeKm)
      if (event.key === 'ArrowRight') globe.setView(view.lat, view.lon + step, view.rangeKm)
      if (event.key === 'ArrowUp') globe.setView(Math.min(85, view.lat + step), view.lon, view.rangeKm)
      if (event.key === 'ArrowDown') globe.setView(Math.max(-85, view.lat - step), view.lon, view.rangeKm)
    }
  })

  globe.onClick((hit) => {
    audio.unlock()
    if (hit.marker) {
      if (hit.marker.id === 'search:pin') return
      if (hit.marker.id.startsWith('camc:')) {
        const contact = entities.get(hit.marker.id)
        const view = globe.getView()
        if (contact) globe.flyTo(contact.lat, contact.lon, Math.max(40, view.rangeKm * 0.28))
        audio.play('click')
        return
      }
      if (hit.marker.id.startsWith('cam:')) {
        lockContact(hit.marker.id)
        audio.play('lock')
        return
      }
      setTrack(hit.marker.id)
      audio.play('lock')
      return
    }
    setTrack(null)
    setPin(hit.lat, hit.lon)
    audio.play('click')
  })
  globe.onRelease(() => {
    state.following = false
    globe.setFollow(null)
  })
  globe.onMove((hit) => {
    if (!hit) return
    shell.coords.textContent = `${formatLat(hit.lat)} ${formatLon(hit.lon)}`
  })
  globe.onHover((hit) => {
    state.hoverId = hit?.marker.id ?? null
    if (hit) {
      state.hoverX = hit.x
      state.hoverY = hit.y
    }
    const contact = state.hoverId ? entities.get(state.hoverId) : null
    if (hit && contact) {
      shell.tip.hidden = false
      shell.tip.textContent = contact.callsign || contact.label
      shell.tip.style.setProperty('--tip', layerHex(contact.shape === 'air-gnd' ? 'airground' : contact.layerId))
      const box = placeTip(hit.x, hit.y, shell.tip.offsetWidth || 96, shell.tip.offsetHeight || 24, window.innerWidth, window.innerHeight)
      shell.tip.style.left = `${box.left}px`
      shell.tip.style.top = `${box.top}px`
    } else {
      shell.tip.hidden = true
    }
    renderCard()
  })
  const cycleSpeed = () => {
    settings.update({ speedUnit: nextSpeedUnit(settings.get().speedUnit) })
    renderInspect()
    renderCard()
    renderFlight()
  }
  flight.onClose(() => setTrack(null))
  flight.onPin(() => setCardPinned(!cardPinned))
  shell.infoUnpin.addEventListener('click', (event) => {
    event.stopPropagation()
    setCardPinned(false)
  })
  flight.onView3d(() => {
    commands.setViewer(true)
    audio.play('click')
  })
  flight.onRoute(() => {
    const id = state.trackId
    if (id?.startsWith('ship:')) flight.setRouteOn(toggleShipTrack())
    else if (id?.startsWith('sat:')) flight.setRouteOn(toggleSatTrack())
    else {
      setAirAhead(!airAheadOn())
      flight.setRouteOn(airAheadOn())
    }
    renderFlight()
    audio.play('click')
  })
  flight.onFollow(() => {
    const contact = state.trackId ? entities.get(state.trackId) : null
    if (!contact) return
    state.following = true
    globe.setFollow({ lat: contact.lat, lon: contact.lon, altKm: contact.altKm })
    audio.play('lock')
  })
  flight.onShare(() => {
    void copyLink().then((url) => showOutput(`LINK ${url}`))
  })
  flight.onCopy(() => {
    const id = state.trackId
    let text = ''
    if (id?.startsWith('air:')) {
      const hex = id.slice(4)
      const fix = airFixNow(hex)
      if (!fix) return
      text = flightText(formatFlight(fix, airMetaFor(hex), settings.get().speedUnit))
    } else if (id?.startsWith('ship:')) {
      const ship = shipNow(Number(id.slice(5)))
      if (!ship) return
      text = shipDetailText(formatShip(ship, shipMeta(ship.mmsi), settings.get().speedUnit))
    } else if (id?.startsWith('sat:')) {
      const view = formatSat(Number(id.slice(4)), state.pin)
      if (!view) return
      text = [view.callsign, ...view.rows.map((row: { k: string; v: string }) => `${row.k}  ${row.v}`)].join('\n')
    }
    if (!text) return
    void navigator.clipboard.writeText(text).catch(() => undefined)
    showOutput('DETAILS COPIED')
    audio.play('click')
  })
  flight.onWatch(() => {
    const id = state.trackId
    if (id?.startsWith('sat:')) {
      const view = formatSat(Number(id.slice(4)), state.pin)
      const value = view?.callsign || id.slice(4)
      alerts.add({ id: `pass:${value}:${Date.now()}`, kind: 'pass', value })
      showOutput(`WATCH PASS ${value}`)
      audio.play('click')
      return
    }
    if (id?.startsWith('ship:')) {
      showOutput('SHIP WATCH NOT AVAILABLE')
      return
    }
    const hex = id?.startsWith('air:') ? id.slice(4) : ''
    const fix = hex ? airFixNow(hex) : null
    const value = (fix?.callsign || fix?.registration || hex).toUpperCase()
    if (!value) return
    alerts.add({ id: `flight:${value}:${Date.now()}`, kind: 'flight', value })
    showOutput(`WATCH FLIGHT ${value}`)
    audio.play('click')
  })
  shell.track.addEventListener('click', () => setTrack(null))
  onShipDetail(() => renderFlight())
  onSatDetail(() => renderFlight())
  flight.onSpeed(cycleSpeed)
  shell.infoSpeed.addEventListener('click', (event) => {
    event.stopPropagation()
    cycleSpeed()
  })
  viewer.speed.addEventListener('click', (event) => {
    event.stopPropagation()
    cycleSpeed()
  })
  viewer.toggle.addEventListener('click', () => {
    audio.play('click')
    commands.setViewer(!viewer.isOpen())
  })
  shell.legendRoot.addEventListener('toggle', () => {
    if (painting) return
    const next = togglePanel({ panel, radar: settings.get().radar, sound: !settings.get().mute, viewer: viewer.isOpen() }, 'legend')
    if (shell.legendRoot.open) openPanel(next.panel === 'legend' ? 'legend' : next.panel)
    else if (panel === 'legend') openPanel(null)
  })
  flight.onMore((open) => {
    if (painting) return
    if (open) openPanel('more')
    else if (panel === 'more') openPanel(null)
  })
  window.addEventListener('pointerdown', (event) => {
    const target = event.target
    if (!(target instanceof Element)) return
    const hit = target.closest('.ae-globe')
      ? 'globe'
      : target.closest('.ae-dialog, .ae-output, .ae-suggest, .ae-legend, .ae-flight-actions')
        ? 'panel'
        : target.closest('.ae-top-actions')
          ? 'button'
          : 'away'
    const next = pointerPanels({ panel, radar: settings.get().radar, sound: !settings.get().mute, viewer: viewer.isOpen() }, hit)
    if (hit === 'away' && !shell.suggest.hidden) shell.suggest.hidden = true
    if (!target.closest('.ae-find')) shell.findList.hidden = true
    if (hit === 'away' && panel !== 'cfg' && !shell.output.hidden && next.panel === null) shell.output.hidden = true
    if (next.panel !== panel) openPanel(next.panel)
  })
  try {
    if (localStorage.getItem(VIEWER_KEY) === '0') viewer.setOpen(false)
  } catch {
    /* keep the viewer open */
  }
  window.addEventListener('resize', () => {
    if (!shell.settings.hidden) placeCfg()
    if (shell.info.hidden || !shell.info.classList.contains('is-moved')) return
    placeCard(shell.info.offsetLeft, shell.info.offsetTop)
  })
  let draggingCard = false
  let dragOx = 0
  let dragOy = 0
  shell.infoHead.addEventListener('pointerdown', (event) => {
    if ((event.target as HTMLElement).closest('button')) return
    draggingCard = true
    state.cardDragged = true
    dragOx = event.clientX - shell.info.offsetLeft
    dragOy = event.clientY - shell.info.offsetTop
    shell.infoHead.setPointerCapture(event.pointerId)
  })
  shell.infoHead.addEventListener('pointermove', (event) => {
    if (!draggingCard) return
    placeCard(event.clientX - dragOx, event.clientY - dragOy)
  })
  shell.infoHead.addEventListener('pointerup', () => { draggingCard = false })
  const sizeInput = shell.settingsForm.elements.namedItem('markerSize') as HTMLInputElement
  const crtInput = shell.settingsForm.elements.namedItem('crt') as HTMLInputElement
  const themeInput = shell.settingsForm.elements.namedItem('theme') as HTMLSelectElement
  sizeInput.addEventListener('input', () => commands.setMarkerSize(Number(sizeInput.value)))
  crtInput.addEventListener('input', () => commands.setCrt(Number(crtInput.value)))
  themeInput.addEventListener('change', () => commands.setTheme(themeInput.value === 'green' ? 'green' : 'color'))
  const styleInput = shell.settingsForm.elements.namedItem('markerStyle') as HTMLSelectElement
  styleInput.addEventListener('change', () => commands.setMarkerStyle(styleInput.value === 'mono' ? 'mono' : 'color'))
  shell.radarToggle.addEventListener('click', () => {
    audio.play('click')
    const on = commands.setRadar(!settings.get().radar)
    showOutput(on ? 'RADAR ON' : 'RADAR OFF')
  })
  globe.onView(() => {
    const faded = crtForZoom(settings.get().crt, globe.getView().rangeKm)
    shell.globeCrt.style.setProperty('--crt', faded.toFixed(3))
    shell.globeCrt.classList.toggle('is-off', faded <= 0.001)
  })
  applyLook()

  entities.subscribe(() => {
    shell.count.textContent = `${entities.count().toLocaleString()} CONTACTS`
    updateCounts()
    if (state.trackId) {
      const contact = entities.get(state.trackId)
      if (contact) {
        if (state.following) globe.setFollow({ lat: contact.lat, lon: contact.lon, altKm: contact.altKm })
        shell.track.textContent = `LOCK ${contact.label}`
      }
    } else if (state.pendingTrack) {
      const contact = entities.get(state.pendingTrack)
      if (contact) {
        state.pendingTrack = null
        setTrack(contact.id)
      }
    }
    renderInspect()
    renderCard()
    renderFlight()
    scanWatches()
  })

  let alertCount = alerts.items.length
  alerts.subscribe(() => {
    if (alerts.items.length > alertCount) audio.play('alert')
    alertCount = alerts.items.length
    renderAlerts()
  })

  const paintClock = () => {
    const when = new Date(clock.now())
    const view = globe.getView()
    shell.clock.textContent = when.toISOString().slice(11, 19) + 'Z'
    const live = Math.abs(clock.offsetMs) < 1500
    shell.live.classList.toggle('is-replay', !live)
    const label = shell.live.querySelector('.ae-live-label')
    if (label) label.textContent = live ? 'LIVE' : 'REPLAY'
    const mins = Math.round(clock.offsetMs / 60_000)
    shell.scrubLabel.textContent = live ? `RNG ${Math.round(view.rangeKm)}KM` : `${mins > 0 ? '+' : ''}${mins} MIN`
    shell.liveBtn.classList.toggle('is-on', live)
  }
  clock.subscribe(() => paintClock())

  registerPlaceFly((hit) => {
    armStreet(hit.rangeKm)
    dropSearchPin(hit.lat, hit.lon)
    globe.flyTo(hit.lat, hit.lon, hit.rangeKm)
  })
  registerCameraOpen((id) => {
    const cam = camById(id)
    lockContact(id, cam?.lat, cam?.lon)
  })

  for (const panel of registry.panels()) {
    const card = document.createElement('section')
    card.className = 'ae-card'
    const title = document.createElement('h2')
    title.textContent = panel.title
    const body = document.createElement('div')
    body.className = 'ae-note'
    card.append(title, body)
    shell.panels.append(card)
    panel.mount(body, pluginCtx)
  }

  paintMute(settings.get().mute)
  renderLayers()
  renderAlerts()
  paintClock()
  for (const layer of registry.layers()) {
    if (state.enabled.get(layer.id)) handles.get(layer.id)?.setEnabled(true)
  }

  let shed = false
  function shedDetail(notice: string) {
    if (!shed) {
      shed = true
      setLayer('buildings', false)
      setLayer('traffic', false)
      globe.setCityDetail('low')
    }
    shell.recover.hidden = false
    shell.recover.textContent = notice
    shell.recover.classList.add('is-on')
  }
  function rememberView() {
    const view = globe.getView()
    try {
      localStorage.setItem(VIEW_KEY, JSON.stringify({ lat: view.lat, lon: view.lon, rangeKm: view.rangeKm }))
    } catch {
      /* storage can be blocked; the main process keeps its own sample */
    }
    return view
  }
  const bootParams = new URLSearchParams(location.search)
  if (bootParams.get('recovered') === '1') {
    const lat = Number(bootParams.get('lat'))
    const lon = Number(bootParams.get('lon'))
    const range = Number(bootParams.get('range'))
    if (Number.isFinite(lat) && Number.isFinite(lon)) globe.setView(lat, lon, Number.isFinite(range) && range > 0 ? range : 12)
    else {
      try {
        const saved = JSON.parse(localStorage.getItem(VIEW_KEY) || 'null') as { lat?: number; lon?: number; rangeKm?: number } | null
        if (saved && Number.isFinite(saved.lat) && Number.isFinite(saved.lon)) globe.setView(Number(saved.lat), Number(saved.lon), Number(saved.rangeKm) || 12)
      } catch {
        /* stay on the default view */
      }
    }
    shedDetail('RECOVERED FROM CRASH')
  }
  const readHealth = () => {
    const view = rememberView()
    const mem = (performance as Performance & { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory
    const action = mem ? heapAction(mem.usedJSHeapSize, mem.jsHeapSizeLimit) : 'ok'
    return {
      lat: view.lat,
      lon: view.lon,
      rangeKm: view.rangeKm,
      heap: mem?.usedJSHeapSize ?? 0,
      limit: mem?.jsHeapSizeLimit ?? 0,
      action,
      stats: globe.cityStats(),
    }
  }
  const page = window as unknown as { __aeHealth?: () => unknown; __aeShed?: () => void }
  page.__aeHealth = readHealth
  page.__aeShed = () => shedDetail('DETAIL REDUCED · MEMORY')
  ;(window as unknown as { __aeGo?: (lat: number, lon: number, range: number, fly?: boolean) => void }).__aeGo = (lat, lon, range, fly) => {
    if (fly) globe.flyTo(lat, lon, range)
    else globe.setView(lat, lon, range)
  }
  window.setInterval(() => {
    const snap = readHealth()
    if (snap.action === 'ok') return
    shedDetail(snap.action === 'reload' ? 'RECOVERED FROM CRASH' : 'DETAIL REDUCED · MEMORY')
  }, 2000)

  startRadar(shell.radar, shell.radarLabel, () => ({
    view: globe.getView(),
    contacts: entities.all(),
  }))

  const bootLines = ['ALL EYES', 'WORLD LINK', 'KEYLESS FEEDS', 'ARMING GLOBE']
  let shown = 0
  let booted = false
  shell.bootText.textContent = ''
  const typer = window.setInterval(() => {
    shown += 1
    shell.bootText.textContent = bootLines.slice(0, shown).join('\n')
    if (shown >= bootLines.length) window.clearInterval(typer)
  }, 180)
  const dismiss = () => {
    if (booted) return
    booted = true
    shell.boot.hidden = true
    audio.unlock()
    audio.play('boot')
    window.clearInterval(typer)
  }
  shell.boot.addEventListener('pointerdown', dismiss)
  window.setTimeout(dismiss, 1700)
  const view = globe.getView()
  shell.coords.textContent = `${formatLat(view.lat)} ${formatLon(view.lon)}`
}
