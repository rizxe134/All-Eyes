import { CITIES, findCity } from '../../core/cities'
import { distanceKm } from '../../core/geo'
import type { AllEyesPlugin, Contact, LayerContext, PluginContext, ViewState } from '../../core/types'
import { getJson } from '../../net/http'
import { attachAddressSearch } from '../../search/city-ui'
import { parseBasemapMode } from '../../city/basemap'
import { OSM_DEBOUNCE_MS, createArmFlag, viewMoved } from '../../city/budget'
import { cityBand } from '../../city/mercator'
import { cityQuery, parseOverpass, type CityPoi } from '../../city/overpass'
import {
  localClock,
  parseAir,
  parseFiTrains,
  parseHereFlow,
  parseMbta,
  parseMeteo,
  parseNominatim,
  parseTomTomFlow,
  weatherWord,
  type AirNow,
  type MeteoNow,
  type PlaceHit,
} from '../../city/feeds'

type Flag = 'imagery' | 'roads' | 'buildings' | 'traffic' | 'transit' | 'poi'

const flags: Record<Flag, boolean> = {
  imagery: false,
  roads: false,
  buildings: false,
  traffic: false,
  transit: false,
  poi: false,
}

let host: PluginContext | null = null
let armed = false
const armFlag = createArmFlag()
let timer = 0
let osmTimer = 0
let unview: (() => void) | null = null
let unsettings: (() => void) | null = null
let abort = new AbortController()
let osmAbort = new AbortController()
let cam = { lat: 999, lon: 999, range: 0 }
let infoBusy = false
let transitBusy = false
let flowBusy = false
let lastOsm = 0
let lastInfo = 0
let lastTransit = 0
let lastFlow = 0
let anchor = { lat: 999, lon: 999, range: 0 }
let place: PlaceHit | null = null
let meteo: MeteoNow | null = null
let air: AirNow | null = null
let flow: number | null = null
let flowLabel = 'TRAFFIC SIMULATED'
let transitLabel = 'TRANSIT NONE IN VIEW'
let pois: CityPoi[] = []

function anyOn(): boolean {
  return flags.imagery || flags.roads || flags.buildings || flags.traffic || flags.transit || flags.poi
}

function pushBasemap(ctx: PluginContext): void {
  const current = ctx.settings.get()
  ctx.globe.setBasemap(current.basemap, current.basemapSource, {
    maptiler: current.maptilerKey,
    mapbox: current.mapboxKey,
  })
  ctx.globe.setCityDraw({
    imagery: flags.imagery,
    roads: flags.roads,
    buildings: flags.buildings,
    traffic: flags.traffic,
    flowRatio: flow,
  })
}

function arm(ctx: LayerContext): void {
  host = ctx
  if (!armFlag.arm()) return
  armed = true
  abort = new AbortController()
  osmAbort = new AbortController()
  pushBasemap(ctx)
  unsettings = ctx.settings.subscribe(() => {
    if (host) pushBasemap(host)
  })
  const view = ctx.globe.getView()
  cam = { lat: view.lat, lon: view.lon, range: view.rangeKm }
  unview = ctx.globe.onView((next) => {
    scheduleOsm(ctx, next)
    void tick(ctx)
  })
  timer = window.setInterval(() => {
    void tick(ctx)
    if (Date.now() - lastOsm >= 8 * 60_000) void pullOsm(ctx, ctx.globe.getView(), osmAbort.signal)
  }, 15000)
  void tick(ctx)
  void pullOsm(ctx, view, osmAbort.signal)
}

function scheduleOsm(ctx: LayerContext, view: ViewState): void {
  if (!viewMoved(cam, { lat: view.lat, lon: view.lon, range: view.rangeKm })) return
  cam = { lat: view.lat, lon: view.lon, range: view.rangeKm }
  window.clearTimeout(osmTimer)
  osmAbort.abort()
  osmAbort = new AbortController()
  const signal = osmAbort.signal
  osmTimer = window.setTimeout(() => {
    void pullOsm(ctx, ctx.globe.getView(), signal)
  }, OSM_DEBOUNCE_MS)
}

function disarm(): void {
  if (anyOn()) return
  armed = false
  armFlag.disarm()
  if (timer) window.clearInterval(timer)
  timer = 0
  window.clearTimeout(osmTimer)
  osmTimer = 0
  unview?.()
  unview = null
  unsettings?.()
  unsettings = null
  abort.abort()
  osmAbort.abort()
}

function bind(flag: Flag, ctx: LayerContext) {
  host = ctx
  return {
    setEnabled(on: boolean) {
      flags[flag] = on
      pushBasemap(ctx)
      if (on) arm(ctx)
      else {
        if (flag === 'poi') ctx.publish('poi', [])
        if (flag === 'transit') ctx.publish('transit', [])
        if (!flags.roads && !flags.buildings && !flags.traffic) ctx.globe.setCityVectors(null)
        disarm()
      }
    },
    dispose() {
      flags[flag] = false
      if (flag === 'poi') ctx.publish('poi', [])
      if (flag === 'transit') ctx.publish('transit', [])
      disarm()
    },
  }
}

function tick(ctx: LayerContext): void {
  if (!armed || !anyOn()) return
  pushBasemap(ctx)
  const view = ctx.globe.getView()
  const signal = abort.signal
  if (!infoBusy) {
    infoBusy = true
    void pullInfo(ctx, view, signal).finally(() => { infoBusy = false })
  }
  if (!transitBusy) {
    transitBusy = true
    void pullTransit(ctx, view, signal).finally(() => { transitBusy = false })
  }
  if (!flowBusy) {
    flowBusy = true
    void pullFlow(ctx, view, signal).finally(() => { flowBusy = false })
  }
}

async function pullOsm(ctx: LayerContext, view: ViewState, signal: AbortSignal): Promise<void> {
  if (!(flags.roads || flags.buildings || flags.traffic || flags.poi)) return
  if (cityBand(view.rangeKm) === 'world') return
  const moved = distanceKm(anchor.lat, anchor.lon, view.lat, view.lon)
  const bandChanged = cityBand(anchor.range) !== cityBand(view.rangeKm)
  if (!bandChanged && moved < Math.max(0.35, view.rangeKm * 0.3) && Date.now() - lastOsm < 8 * 60_000) return
  const query = cityQuery(view.lat, view.lon, view.rangeKm)
  if (!query || signal.aborted) return
  try {
    const parsed = parseOverpass(await getJson(`/api/overpass?data=${encodeURIComponent(query)}`, ctx.settings, signal))
    if (signal.aborted) return
    pois = parsed.pois
    ctx.globe.setCityVectors(parsed)
    anchor = { lat: view.lat, lon: view.lon, range: view.rangeKm }
    lastOsm = Date.now()
    publishPois(ctx)
    ctx.log('roads', '')
  } catch (err) {
    if (!signal.aborted) ctx.log('roads', err instanceof Error ? err.message : 'CITY FEED')
  }
}

async function pullInfo(ctx: LayerContext, view: ViewState, signal: AbortSignal): Promise<void> {
  if (view.rangeKm > 90) return
  const moved = place ? distanceKm(place.lat, place.lon, view.lat, view.lon) : 999
  const freshFor = place && meteo ? 10 * 60_000 : 20_000
  if (moved < 3 && Date.now() - lastInfo < freshFor) return
  const lat = view.lat.toFixed(3)
  const lon = view.lon.toFixed(3)
  try {
    place = parseNominatim(await getJson(`/api/nominatim?lat=${lat}&lon=${lon}`, ctx.settings, signal))
  } catch {
    /* keep the last place name */
  }
  try {
    meteo = parseMeteo(await getJson(`/api/meteo?lat=${lat}&lon=${lon}`, ctx.settings, signal))
  } catch {
    /* weather stays on the last good read */
  }
  try {
    air = parseAir(await getJson(`/api/air?lat=${lat}&lon=${lon}`, ctx.settings, signal))
  } catch {
    /* air quality stays on the last good read */
  }
  lastInfo = Date.now()
}

async function pullTransit(ctx: LayerContext, view: ViewState, signal: AbortSignal): Promise<void> {
  if (!flags.transit) {
    ctx.publish('transit', [])
    transitLabel = 'TRANSIT OFF'
    return
  }
  if (view.rangeKm > 220) {
    ctx.publish('transit', [])
    transitLabel = 'TRANSIT ZOOM IN'
    return
  }
  if (Date.now() - lastTransit < 20_000) return
  lastTransit = Date.now()
  const contacts: Contact[] = []
  const agencies: string[] = []
  if (distanceKm(view.lat, view.lon, 42.36, -71.06) < 90) {
    try {
      const rows = parseMbta(await getJson('/api/transit/mbta', ctx.settings, signal))
      agencies.push('MBTA')
      for (const row of rows) {
        if (distanceKm(view.lat, view.lon, row.lat, row.lon) > 45) continue
        contacts.push(transitContact(row))
      }
    } catch {
      agencies.push('MBTA OFFLINE')
    }
  }
  if (view.lat > 59 && view.lat < 71 && view.lon > 19 && view.lon < 32) {
    try {
      const rows = parseFiTrains(await getJson('/api/transit/fi', ctx.settings, signal))
      agencies.push('DIGITRAFFIC')
      for (const row of rows) {
        if (distanceKm(view.lat, view.lon, row.lat, row.lon) > Math.max(80, view.rangeKm)) continue
        contacts.push(transitContact(row))
      }
    } catch {
      agencies.push('DIGITRAFFIC OFFLINE')
    }
  }
  ctx.publish('transit', contacts)
  transitLabel = !agencies.length ? 'TRANSIT NONE KEYLESS HERE' : contacts.length ? `TRANSIT LIVE ${agencies.filter((name) => !name.includes('OFFLINE')).join(' ')} ${contacts.length}` : `TRANSIT ${agencies.join(' ')}`
}

function transitContact(row: { id: string; label: string; lat: number; lon: number; heading: number; detail: string }): Contact {
  return {
    id: row.id,
    layerId: 'transit',
    kind: 'beacon',
    lat: row.lat,
    lon: row.lon,
    altKm: 0.02,
    heading: row.heading,
    label: row.label,
    detail: row.detail,
    brightness: 0.95,
    shape: 'chevron',
    scale: 0.7,
  }
}

async function pullFlow(ctx: LayerContext, view: ViewState, signal: AbortSignal): Promise<void> {
  if (!flags.traffic || view.rangeKm > 40) return
  if (Date.now() - lastFlow < 60_000) return
  lastFlow = Date.now()
  const current = ctx.settings.get()
  const lat = view.lat.toFixed(4)
  const lon = view.lon.toFixed(4)
  if (current.tomtomKey) {
    try {
      const ratio = parseTomTomFlow(await getJson(`/api/traffic/tomtom?lat=${lat}&lon=${lon}`, ctx.settings, signal))
      if (ratio != null) {
        flow = ratio
        flowLabel = 'TOMTOM SPEED · VEHICLES SIMULATED ON OSM'
        pushBasemap(ctx)
        return
      }
    } catch {
      flowLabel = 'TOMTOM OFFLINE · TRAFFIC SIMULATED'
    }
  }
  if (current.hereKey) {
    try {
      const ratio = parseHereFlow(await getJson(`/api/traffic/here?lat=${lat}&lon=${lon}`, ctx.settings, signal))
      if (ratio != null) {
        flow = ratio
        flowLabel = 'HERE SPEED · VEHICLES SIMULATED ON OSM'
        pushBasemap(ctx)
        return
      }
    } catch {
      flowLabel = 'HERE OFFLINE · TRAFFIC SIMULATED'
    }
  }
  flow = null
  if (!current.tomtomKey && !current.hereKey) flowLabel = 'TRAFFIC SIMULATED'
  pushBasemap(ctx)
}

function publishPois(ctx: PluginContext): void {
  if (!flags.poi) {
    ctx.publish('poi', [])
    return
  }
  ctx.publish('poi', pois.map((poi) => ({
    id: poi.id,
    layerId: 'poi',
    kind: 'beacon' as const,
    lat: poi.lat,
    lon: poi.lon,
    altKm: 0.02,
    heading: 0,
    label: poi.name,
    detail: `${poi.name}\n${poi.kind.toUpperCase()}\nOPENSTREETMAP`,
    brightness: 0.9,
    shape: 'drop',
    scale: 0.85,
  })))
}

function text(value: string): string {
  return value || 'NOT AVAILABLE'
}

function mountPanel(parent: HTMLElement, ctx: PluginContext): () => void {
  const card = parent.parentElement
  card?.classList.add('ae-city-card')
  const right = card?.closest('.ae-right')
  const side = right?.querySelector('.ae-side')
  if (card && right && side) right.insertBefore(card, side)
  const form = document.createElement('form')
  form.className = 'ae-city-find'
  const input = document.createElement('input')
  input.name = 'q'
  input.placeholder = 'PLACE OR ADDRESS'
  input.autocomplete = 'off'
  input.setAttribute('aria-label', 'Search place')
  const go = document.createElement('button')
  go.type = 'submit'
  go.className = 'ae-btn'
  go.textContent = 'GO'
  form.append(input, go)
  const pick = document.createElement('select')
  pick.className = 'ae-city-pick'
  pick.setAttribute('aria-label', 'Fly to city')
  const blank = document.createElement('option')
  blank.value = ''
  blank.textContent = 'FLY TO CITY'
  pick.append(blank)
  for (const city of CITIES) {
    if (city.name === 'NULL ISLAND') continue
    const option = document.createElement('option')
    option.value = city.name
    option.textContent = city.name
    pick.append(option)
  }
  const rows = document.createElement('div')
  rows.className = 'ae-city-lines'
  const name = line(rows, 'NAME')
  const pop = line(rows, 'POP')
  const zone = line(rows, 'ZONE')
  const local = line(rows, 'LOCAL')
  const wx = line(rows, 'WX')
  const cast = line(rows, 'CAST')
  const aq = line(rows, 'AIR')
  const flowNode = line(rows, 'FLOW')
  const transit = line(rows, 'TRANSIT')
  const deps = line(rows, 'DEPS')
  const places = document.createElement('div')
  places.className = 'ae-city-list'
  const airports = document.createElement('div')
  airports.className = 'ae-city-list'
  const overhead = document.createElement('div')
  overhead.className = 'ae-city-list'
  const ships = document.createElement('div')
  ships.className = 'ae-city-list'
  const quakes = document.createElement('div')
  quakes.className = 'ae-city-list'
  const attr = document.createElement('div')
  attr.className = 'ae-city-attr'
  parent.append(form, pick, rows, label('PLACES'), places, label('AIRPORTS'), airports, label('OVERHEAD'), overhead, label('SHIPS'), ships, label('QUAKES'), quakes, attr)

  const fly = (lat: number, lon: number, range: number) => {
    ctx.globe.flyTo(lat, lon, range)
  }
  const detachSearch = attachAddressSearch(form, input, ctx)
  pick.addEventListener('change', () => {
    const city = findCity(pick.value)
    if (!city) return
    fly(city.lat, city.lon, 12)
  })

  const paint = () => {
    const view = ctx.globe.getView()
    const zoomed = view.rangeKm < 90
    name.textContent = zoomed ? text(place?.label.split(',')[0] ?? '') : 'ZOOM IN'
    name.title = place?.label ?? ''
    pop.textContent = zoomed ? text(place?.population ?? '') : '—'
    zone.textContent = zoomed ? text(meteo?.timezone ?? '') : '—'
    local.textContent = zoomed && meteo ? localClock(ctx.clock.now(), meteo.offsetSec) : '—'
    const temp = meteo?.tempC == null ? 'NOT AVAILABLE' : `${meteo.tempC.toFixed(0)}C ${weatherWord(meteo.code)}`
    const wind = meteo?.windKmh == null ? '' : ` ${Math.round(meteo.windKmh)} KM/H`
    wx.textContent = zoomed ? temp + wind : '—'
    cast.textContent = zoomed && meteo?.daily.length
      ? meteo.daily.slice(0, 3).map((day) => `${day.date.slice(5)} ${day.maxC == null ? '?' : Math.round(day.maxC)}/${day.minC == null ? '?' : Math.round(day.minC)}`).join('  ')
      : 'NOT AVAILABLE'
    aq.textContent = zoomed ? (air?.aqi == null ? 'NOT AVAILABLE' : `AQI ${Math.round(air.aqi)} PM2.5 ${air.pm25 == null ? '—' : air.pm25.toFixed(0)}`) : '—'
    flowNode.textContent = flags.traffic ? flowLabel : 'TRAFFIC OFF'
    transit.textContent = transitLabel
    deps.textContent = 'NOT AVAILABLE'
    const note = ctx.globe.cityNote()
    attr.textContent = note
    attr.title = note
    const flyPlace = (lat: number, lon: number) => fly(lat, lon, 1.4)
    const poiKey = pois.map((poi) => poi.id).join(',')
    if (poiKey !== places.dataset.key) {
      places.dataset.key = poiKey
      listButtons(places, pois.filter((poi) => poi.kind !== 'aerodrome').map((poi) => ({ name: poi.name, lat: poi.lat, lon: poi.lon })), flyPlace)
      listButtons(airports, pois.filter((poi) => poi.kind === 'aerodrome').map((poi) => ({ name: poi.name, lat: poi.lat, lon: poi.lon })), flyPlace)
    }
    const nearby = ctx.nearby?.(view.lat, view.lon, 40) ?? []
    overhead.textContent = nearby.filter((contact) => contact.kind === 'air').slice(0, 5).map((contact) => contact.label).join('  ') || 'NONE'
    ships.textContent = (ctx.nearby?.(view.lat, view.lon, 15) ?? []).filter((contact) => contact.kind === 'ship').slice(0, 4).map((contact) => contact.label).join('  ') || 'NONE'
    quakes.textContent = (ctx.nearby?.(view.lat, view.lon, 280) ?? []).filter((contact) => contact.kind === 'quake').slice(0, 3).map((contact) => contact.label).join('  ') || 'NONE'
  }
  const clock = window.setInterval(paint, 1000)
  paint()
  return () => {
    window.clearInterval(clock)
    detachSearch()
  }
}

function label(textValue: string): HTMLElement {
  const node = document.createElement('div')
  node.className = 'ae-city-h'
  node.textContent = textValue
  return node
}

function line(parent: HTMLElement, labelText: string): HTMLElement {
  const row = document.createElement('div')
  row.className = 'ae-city-row'
  const k = document.createElement('span')
  k.className = 'ae-k'
  k.textContent = labelText
  const v = document.createElement('span')
  v.className = 'ae-city-v'
  row.append(k, v)
  parent.append(row)
  return v
}

function listButtons(hostNode: HTMLElement, rows: { name: string; lat: number; lon: number }[], fly: (lat: number, lon: number) => void): void {
  hostNode.replaceChildren()
  if (!rows.length) {
    hostNode.textContent = 'NONE'
    return
  }
  for (const row of rows.slice(0, 6)) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'ae-city-jump'
    button.textContent = row.name
    button.addEventListener('click', () => fly(row.lat, row.lon))
    hostNode.append(button)
  }
}

function def(id: string, labelText: string, description: string, flag: Flag) {
  return {
    id,
    label: labelText,
    description,
    defaultOn: true,
    create(ctx: LayerContext) {
      return bind(flag, ctx)
    },
  }
}

export const cityPlugin: AllEyesPlugin = {
  id: 'city',
  name: 'City',
  version: '2.1.0',
  layers: [
    def('imagery', 'CITY MAP', 'Satellite or street tiles once the view is inside a region.', 'imagery'),
    def('buildings', 'BUILDINGS', 'OSM footprints extruded by height or level count.', 'buildings'),
    def('roads', 'ROADS', 'OSM road and rail lines for the city view.', 'roads'),
    def('traffic', 'TRAFFIC', 'Simulated vehicles on those roads. Live speed only with a TomTom or HERE key.', 'traffic'),
    def('transit', 'TRANSIT', 'Keyless live vehicles: MBTA near Boston, Finnish trains near Finland.', 'transit'),
    def('poi', 'PLACES', 'Hospitals, stations, museums, and airports from OpenStreetMap.', 'poi'),
  ],
  panels: [
    {
      id: 'city-info',
      title: 'CITY',
      mount(el, ctx) {
        return mountPanel(el, ctx)
      },
    },
  ],
  commands: [
    {
      name: 'city',
      usage: 'city <name>|list',
      summary: 'Fly to a city at block scale',
      async run(args, ctx) {
        const query = args.join(' ').trim()
        if (!query || query.toLowerCase() === 'list') return CITIES.filter((city) => city.name !== 'NULL ISLAND').map((city) => city.name).join('\n')
        const known = findCity(query)
        if (known) {
          ctx.setLayer('imagery', true)
          ctx.setLayer('roads', true)
          ctx.setLayer('buildings', true)
          ctx.setLayer('traffic', true)
          ctx.flyTo(known.lat, known.lon, 12)
          ctx.setPin(known.lat, known.lon)
          return `CITY ${known.name}`
        }
        const hit = await ctx.searchPlace(query)
        if (!hit) return `NO CITY "${query.toUpperCase()}"`
        ctx.flyTo(hit.lat, hit.lon, 12)
        ctx.setPin(hit.lat, hit.lon)
        return `CITY ${hit.label.split(',')[0].toUpperCase()}`
      },
    },
    {
      name: 'place',
      usage: 'place <address>',
      summary: 'Geocode a place and fly to street scale',
      async run(args, ctx) {
        const query = args.join(' ').trim()
        if (!query) return 'USAGE: PLACE <ADDRESS>'
        const hit = await ctx.searchPlace(query)
        if (!hit) return `NO PLACE "${query.toUpperCase()}"`
        ctx.flyTo(hit.lat, hit.lon, 1.6)
        ctx.setPin(hit.lat, hit.lon)
        return `PLACE ${hit.label.split(',')[0].toUpperCase()}`
      },
    },
    {
      name: 'map',
      usage: 'map <sat|streets|hybrid|dark>',
      summary: 'City basemap: imagery, streets, hybrid, or dark',
      run(args) {
        if (!host) return 'MAP IDLE'
        const mode = parseBasemapMode(args[0] ?? '')
        if (!mode) return `MAP ${host.settings.get().basemap.toUpperCase()}`
        host.settings.update({ basemap: mode })
        pushBasemap(host)
        return `MAP ${mode.toUpperCase()}`
      },
    },
    {
      name: 'poi',
      usage: 'poi <name>',
      summary: 'Search a place near the view and fly to it',
      async run(args, ctx) {
        const query = args.join(' ').trim()
        if (!query) return 'USAGE: POI <NAME>'
        const view = ctx.getView()
        const pad = Math.max(0.02, view.rangeKm / 80)
        const west = view.lon - pad
        const east = view.lon + pad
        const south = view.lat - pad
        const north = view.lat + pad
        if (!host) return 'POI IDLE'
        try {
          const hit = parseNominatim(await getJson(
            `/api/nominatim?q=${encodeURIComponent(query)}&viewbox=${west.toFixed(3)},${north.toFixed(3)},${east.toFixed(3)},${south.toFixed(3)}`,
            host.settings,
          ))
          if (!hit) return `NO POI "${query.toUpperCase()}"`
          ctx.flyTo(hit.lat, hit.lon, 1.2)
          ctx.setPin(hit.lat, hit.lon)
          return `POI ${hit.label.split(',')[0].toUpperCase()}`
        } catch {
          return `NO POI "${query.toUpperCase()}"`
        }
      },
    },
  ],
}
