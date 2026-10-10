import { AlertBoard } from './alerts'
import { execute, formatHelp } from './command'
import { SimClock } from './clock'
import { EntityIndex } from './entities'
import { formatCard, nextSpeedUnit, speedUnitLabel, withSpeed } from './cards'
import { clamp, formatLat, formatLon } from './geo'
import { Globe } from './globe'
import { PluginRegistry } from './registry'
import { decodeShare, encodeShare } from './share'
import { MARKER_MAX, MARKER_MIN, SettingsStore } from './settings'
import { Sfx } from './audio'
import { toMarker, type CommandContext, type GlobeTheme, type LayerHandle, type PluginContext, type WatchRule } from './types'
import { builtinPlugins } from '../plugins'
import { getJson } from '../net/http'
import { buildShell } from '../ui/shell'
import { startRadar } from '../ui/radar'
import { mountViewer } from '../ui/viewer'
import { mountFlightPanel } from '../ui/flight-panel'
import { flightText, formatFlight } from '../plugins/aircraft/detail'
import { airAheadOn, airFixNow, airMetaFor, airTrail, setAirAhead } from '../plugins/aircraft/plugin'

const LAYER_KEY = 'alleyes.layers.v1'
const VIEWER_KEY = 'alleyes.viewer.v1'

function parseNominatim(payload: unknown): { lat: number; lon: number; label: string } | null {
  if (!Array.isArray(payload) || !payload[0] || typeof payload[0] !== 'object') return null
  const row = payload[0] as { lat?: string; lon?: string; display_name?: string }
  const lat = Number(row.lat)
  const lon = Number(row.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  return { lat, lon, label: row.display_name || `${lat.toFixed(2)},${lon.toFixed(2)}` }
}

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
    log(layerId, message) {
      if (message) state.faults.set(layerId, message)
      else state.faults.delete(layerId)
      renderLayers()
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
      const name = document.createElement('span')
      name.className = 'ae-layer-name'
      name.textContent = layer.label
      const count = document.createElement('span')
      count.className = 'ae-layer-count'
      count.textContent = on ? String(entities.of(layer.id).length) : '—'
      button.append(name, count)
      button.addEventListener('click', () => {
        audio.play('click')
        setLayer(layer.id, !on)
      })
      shell.layers.append(button)
    }
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
    shell.inspect.textContent = contact.label
  }

  function placeCard(x: number, y: number) {
    const width = shell.info.offsetWidth || 200
    const height = shell.info.offsetHeight || 160
    const left = clamp(x, 8, Math.max(8, window.innerWidth - width - 8))
    const top = clamp(y, 8, Math.max(8, window.innerHeight - height - 8))
    shell.info.style.left = `${left}px`
    shell.info.style.top = `${top}px`
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
    const airDock = Boolean(pinned && pinned.kind === 'air' && contact.id === pinned.id)
    if (viewer.isOpen() || airDock) {
      shell.info.hidden = true
      return
    }
    shell.info.hidden = false
    shell.info.classList.toggle('is-pin', locked)
    shell.infoTitle.textContent = viewer.title.textContent
    shell.infoBody.textContent = viewer.card.textContent
    if (!locked) placeCard(state.hoverX + 16, state.hoverY + 16)
  }

  function renderFlight() {
    const hud = shell.layers.parentElement
    const hex = state.trackId?.startsWith('air:') ? state.trackId.slice(4) : ''
    const fix = hex ? airFixNow(hex) : null
    if (!hex || !fix) {
      flight.setView(null)
      flight.setGraph([])
      hud?.classList.remove('is-flight')
      return
    }
    const view = formatFlight(fix, airMetaFor(hex), settings.get().speedUnit)
    flight.setView(view)
    flight.setRouteOn(airAheadOn())
    flight.setGraph(airTrail(hex).map((sample) => ({
      altFt: sample.altBaroFt ?? sample.altGpsFt ?? sample.altM * 3.28084,
      gsKt: sample.speedKt,
    })))
    hud?.classList.add('is-flight')
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
    shell.globeCrt.style.setProperty('--crt', current.crt.toFixed(2))
    shell.globeCrt.classList.toggle('is-off', current.crt <= 0.001)
    const form = shell.settingsForm
    const sizeInput = form.elements.namedItem('markerSize') as HTMLInputElement | null
    const crtInput = form.elements.namedItem('crt') as HTMLInputElement | null
    const themeInput = form.elements.namedItem('theme') as HTMLSelectElement | null
    if (sizeInput) sizeInput.value = String(current.markerSize)
    if (crtInput) crtInput.value = String(current.crt)
    if (themeInput) themeInput.value = current.theme
  }

  const commands: CommandContext = {
    flyTo: (lat, lon, range) => globe.flyTo(lat, lon, range),
    getView: () => globe.getView(),
    track: (id) => setTrack(id),
    setLayer,
    layers: () => registry.layers().map((layer) => ({ id: layer.id, label: layer.label, on: state.enabled.get(layer.id) === true })),
    async searchPlace(query) {
      try {
        return parseNominatim(await getJson(`/api/nominatim?q=${encodeURIComponent(query)}`, settings))
      } catch {
        return null
      }
    },
    findContact: (query) => entities.find(query),
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
      shell.mute.textContent = mute ? 'MUT' : 'SND'
      shell.mute.classList.toggle('is-on', !mute)
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
      shell.suggest.hidden = true
      shell.output.hidden = true
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
  shell.shot.addEventListener('click', () => screenshot())
  shell.link.addEventListener('click', () => {
    void copyLink().then((url) => showOutput(`LINK ${url}`))
  })
  shell.cfg.addEventListener('click', () => {
    audio.play('click')
    const current = settings.get()
    const form = shell.settingsForm
    ;(form.elements.namedItem('openskyId') as HTMLInputElement).value = current.openskyId
    ;(form.elements.namedItem('openskySecret') as HTMLInputElement).value = current.openskySecret
    ;(form.elements.namedItem('firmsKey') as HTMLInputElement).value = current.firmsKey
    ;(form.elements.namedItem('markerSize') as HTMLInputElement).value = String(current.markerSize)
    ;(form.elements.namedItem('crt') as HTMLInputElement).value = String(current.crt)
    ;(form.elements.namedItem('theme') as HTMLSelectElement).value = current.theme
    shell.settings.hidden = false
  })
  shell.settingsForm.addEventListener('submit', (event) => {
    event.preventDefault()
    const form = shell.settingsForm
    settings.update({
      openskyId: (form.elements.namedItem('openskyId') as HTMLInputElement).value.trim(),
      openskySecret: (form.elements.namedItem('openskySecret') as HTMLInputElement).value.trim(),
      firmsKey: (form.elements.namedItem('firmsKey') as HTMLInputElement).value.trim(),
    })
    shell.settings.hidden = true
    const size = Number((form.elements.namedItem('markerSize') as HTMLInputElement).value)
    if (Number.isFinite(size)) commands.setMarkerSize(size)
    const crt = Number((form.elements.namedItem('crt') as HTMLInputElement).value)
    if (Number.isFinite(crt)) commands.setCrt(crt)
    commands.setTheme((form.elements.namedItem('theme') as HTMLSelectElement).value === 'green' ? 'green' : 'color')
    showOutput('KEYS STORED LOCALLY')
    audio.play('click')
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
    const typing = document.activeElement === shell.prompt || (document.activeElement instanceof HTMLInputElement)
    if (event.key === '/' && !typing) {
      event.preventDefault()
      shell.prompt.focus()
    } else if (event.key === 'Escape') {
      shell.settings.hidden = true
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
    renderCard()
  })
  const cycleSpeed = () => {
    settings.update({ speedUnit: nextSpeedUnit(settings.get().speedUnit) })
    renderInspect()
    renderCard()
    renderFlight()
  }
  flight.onClose(() => setTrack(null))
  flight.onView3d(() => {
    commands.setViewer(true)
    audio.play('click')
  })
  flight.onRoute(() => {
    setAirAhead(!airAheadOn())
    flight.setRouteOn(airAheadOn())
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
    const hex = state.trackId?.startsWith('air:') ? state.trackId.slice(4) : ''
    const fix = hex ? airFixNow(hex) : null
    if (!fix) return
    const text = flightText(formatFlight(fix, airMetaFor(hex), settings.get().speedUnit))
    void navigator.clipboard.writeText(text).catch(() => undefined)
    showOutput('DETAILS COPIED')
    audio.play('click')
  })
  flight.onWatch(() => {
    const hex = state.trackId?.startsWith('air:') ? state.trackId.slice(4) : ''
    const fix = hex ? airFixNow(hex) : null
    const value = (fix?.callsign || fix?.registration || hex).toUpperCase()
    if (!value) return
    alerts.add({ id: `flight:${value}:${Date.now()}`, kind: 'flight', value })
    showOutput(`WATCH FLIGHT ${value}`)
    audio.play('click')
  })
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
  try {
    if (localStorage.getItem(VIEWER_KEY) === '0') viewer.setOpen(false)
  } catch {
    /* keep the viewer open */
  }
  window.addEventListener('pagehide', () => viewer.dispose())
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
  const followCard = () => {
    if (state.trackId && !state.cardDragged && !shell.info.hidden) {
      const contact = entities.get(state.trackId)
      if (contact) {
        const point = globe.project(contact.lat, contact.lon, contact.altKm)
        if (point.visible) placeCard(point.x + 18, point.y + 18)
      }
    }
    requestAnimationFrame(followCard)
  }
  requestAnimationFrame(followCard)

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

  shell.mute.textContent = settings.get().mute ? 'MUT' : 'SND'
  shell.mute.classList.toggle('is-on', !settings.get().mute)
  renderLayers()
  renderAlerts()
  paintClock()
  for (const layer of registry.layers()) {
    if (state.enabled.get(layer.id)) handles.get(layer.id)?.setEnabled(true)
  }

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
