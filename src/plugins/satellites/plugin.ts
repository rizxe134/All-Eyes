import { inView } from '../aircraft/feed'
import type { AllEyesPlugin, Contact, LayerContext, PluginContext } from '../../core/types'
import { getJson } from '../../net/http'
import { displayAltKm } from './alt'
import { catalogCount, catalogFault, catalogReady, catalogSat, ensureCatalog, ensurePlace, findCatalog, placeOf, satsIn, stepPropagation } from './catalog'
import { hoverTrack, readSatcat, satGraph, satTracks, shapeFor, storeSatPhoto } from './detail'

export { formatSat, onSatDetail } from './detail'
import type { SatGroup } from './elements'
import { formatPass, windowsAbove } from './passes'
import { elevationDeg } from './propagate'
import { nasaQuery, parseNasa } from './photo'
import { locateShip } from '../ships/plugin'

export function findSat(query: string) {
  const sat = findCatalog(query)
  if (!sat) return null
  return { fix: sat, satrec: sat.satrec }
}

const LAYER_OF: Record<SatGroup, string> = {
  stations: 'stations',
  gnss: 'gnss',
  weather: 'wxsat',
  science: 'science',
  geo: 'geo',
  active: 'satellites',
  starlink: 'starlink',
}

const enabled = new Set<SatGroup>()
let shared: PluginContext | null = null
let timer = 0
let users = 0
let orbitOn = true
let orbitOwned = false
let hoverNorad: number | null = null
const photoTried = new Set<number>()
const satcatTried = new Set<number>()

export function satTrackOn(): boolean {
  return orbitOn
}

export function toggleSatTrack(): boolean {
  orbitOn = !orbitOn
  return orbitOn
}

export function locateSat(query: string): { norad: number; name: string; lat: number; lon: number; layerId: string } | null {
  const sat = findCatalog(query)
  if (!sat) return null
  const place = ensurePlace(sat.norad)
  if (!place) return null
  return { norad: sat.norad, name: sat.name, lat: place.lat, lon: place.lon, layerId: LAYER_OF[sat.group] }
}

function focusNorad(): number | null {
  const id = shared?.getTrackId() ?? null
  if (!id) return hoverNorad
  const norad = Number(id.split(':')[1])
  if (!Number.isFinite(norad) || !catalogSat(norad)) return hoverNorad
  return norad
}

function toContact(group: SatGroup, layerId: string): Contact[] {
  const out: Contact[] = []
  for (const sat of satsIn(group)) {
    const place = placeOf(sat.norad)
    if (!place) continue
    const shape = shapeFor(sat.norad)
    out.push({
      id: `sat:${sat.norad}`,
      layerId,
      kind: 'sat',
      lat: place.lat,
      lon: place.lon,
      altKm: displayAltKm(place.altKm),
      heading: 0,
      label: sat.name,
      callsign: sat.name,
      detail: sat.name,
      brightness: group === 'stations' ? 1 : group === 'starlink' ? 0.32 : 0.58,
      shape,
      scale: group === 'stations' ? 1.05 : group === 'starlink' ? 0.5 : 0.7,
      card: [
        { k: 'NAME', v: sat.name },
        { k: 'ID', v: String(sat.norad) },
        { k: 'ALT', v: `${Math.round(place.altKm)} KM` },
      ],
    })
  }
  return out
}

function publishAll() {
  const ctx = shared
  if (!ctx) return
  for (const group of enabled) ctx.publish(LAYER_OF[group], toContact(group, LAYER_OF[group]))
  const view = ctx.globe.getView()
  let loaded = 0
  let visible = 0
  for (const group of enabled) {
    for (const sat of satsIn(group)) {
      const place = placeOf(sat.norad)
      if (!place) continue
      loaded += 1
      if (inView(place.lat, place.lon, view.lat, view.lon, view.rangeKm)) visible += 1
    }
  }
  const state = catalogFault() && catalogCount() === 0 ? 'OFFLINE' : catalogReady() ? 'OK' : 'PARTIAL'
  const gap = state !== 'OK' && visible === 0 ? ' · FEED COVERAGE LIMIT' : ''
  ctx.status?.('satellites', `SATS ${loaded} LOADED · ${visible} VIEW · CELESTRAK ${state}${gap}`)
  ctx.log('satellites', state === 'OFFLINE' ? 'TLE FEED OFFLINE' : '')
}

function paintOrbit() {
  const ctx = shared
  if (!ctx) return
  const selected = ctx.getTrackId()
  const selectedNorad = selected ? Number(selected.split(':')[1]) : NaN
  const showSelected = orbitOn && Number.isFinite(selectedNorad) && catalogSat(selectedNorad)
  if (showSelected) {
    const tracks = satTracks(selectedNorad)
    orbitOwned = true
    ctx.globe.setOrbitTracks(tracks ? [
      { points: tracks.past, color: 0xb6ffd0, opacity: 0.95 },
      { points: tracks.future, dashed: true, color: 0xf4fff8, opacity: 1 },
      { points: tracks.ring, color: 0x3dff7a, opacity: 0.9 },
    ] : null)
    return
  }
  if (hoverNorad != null && hoverNorad !== selectedNorad) {
    const trail = hoverTrack(hoverNorad)
    orbitOwned = true
    ctx.globe.setOrbitTracks(trail.length > 1 ? [{ points: trail, dashed: true, color: 0x7dffb0, opacity: 0.7 }] : null)
    return
  }
  if (orbitOwned) ctx.globe.setOrbitTracks(null)
  orbitOwned = false
}

function arm(ctx: PluginContext) {
  shared = ctx
  bindHover(ctx)
  users += 1
  if (users !== 1) return
  void ensureCatalog(ctx.settings, undefined).then(() => publishAll()).catch(() => publishAll())
  let ticks = 0
  timer = window.setInterval(() => {
    ticks += 1
    if (!catalogReady() && ticks % 80 === 0) void ensureCatalog(ctx.settings).then(() => publishAll()).catch(() => publishAll())
    stepPropagation(new Date(ctx.clock.now()), focusNorad(), 350, (group) => enabled.has(group))
    publishAll()
    paintOrbit()
    if (ticks % 60 === 0) checkPasses(ctx)
  }, 450)
}

function disarm() {
  users = Math.max(0, users - 1)
  if (users > 0) return
  window.clearInterval(timer)
  timer = 0
  if (orbitOwned) shared?.globe.setOrbitTracks(null)
  orbitOwned = false
}

async function enrich(norad: number, ctx: PluginContext) {
  if (!satcatTried.has(norad)) {
    satcatTried.add(norad)
    try {
      readSatcat(await getJson(`/api/satcat?cat=${norad}`, ctx.settings, undefined), norad)
    } catch {
      /* the panel keeps NOT AVAILABLE */
    }
  }
  const sat = catalogSat(norad)
  const query = sat ? nasaQuery(sat.name) : null
  if (query && !photoTried.has(norad)) {
    photoTried.add(norad)
    try {
      const body = await getJson(`/api/nasa?q=${encodeURIComponent(query.q)}`, ctx.settings, undefined)
      storeSatPhoto(norad, parseNasa(body, query.required))
    } catch {
      storeSatPhoto(norad, null)
    }
  }
}

function makeLayer(group: SatGroup, id: string, label: string, description: string, defaultOn: boolean) {
  return {
    id,
    label,
    description,
    defaultOn,
    create(ctx: LayerContext) {
      let on = false
      return {
        setEnabled(next: boolean) {
          if (next === on) return
          on = next
          if (!next) {
            enabled.delete(group)
            ctx.publish(id, [])
            disarm()
            publishAll()
            return
          }
          enabled.add(group)
          arm(ctx)
          publishAll()
        },
        dispose() {
          if (on) {
            on = false
            enabled.delete(group)
            disarm()
          }
          ctx.publish(id, [])
        },
      }
    },
  }
}

let hoverBound = false

function bindHover(ctx: PluginContext) {
  if (hoverBound) return
  hoverBound = true
  ctx.globe.onHover((hit) => {
    const id = hit?.marker.id ?? ''
    const norad = id.startsWith('sat:') ? Number(id.slice(4)) : NaN
    const next = Number.isFinite(norad) ? norad : null
    if (next === hoverNorad) return
    hoverNorad = next
    paintOrbit()
  })
  ctx.onTrack((id) => {
    const norad = id?.startsWith('sat:') ? Number(id.slice(4)) : NaN
    if (Number.isFinite(norad)) void enrich(norad, ctx)
    paintOrbit()
  })
}

export function satSeries(norad: number) {
  return satGraph(norad)
}

export const satellitePlugin: AllEyesPlugin = {
  id: 'satellites',
  name: 'Satellites',
  version: '1.5.0',
  layers: [
    makeLayer('stations', 'stations', 'STN', 'Crewed stations from the public CelesTrak catalog.', true),
    makeLayer('gnss', 'gnss', 'GNSS', 'GPS, Galileo, GLONASS, and BeiDou.', true),
    makeLayer('weather', 'wxsat', 'WXS', 'Weather satellites.', true),
    makeLayer('science', 'science', 'SCI', 'Science missions, including Hubble when it is in the catalog.', true),
    makeLayer('geo', 'geo', 'GEO', 'Geostationary satellites, drawn in a halo above the earth.', true),
    makeLayer('active', 'satellites', 'SATS', 'The rest of the public active catalog. No stride cap.', true),
    makeLayer('starlink', 'starlink', 'STAR', 'The full Starlink shell. Off until you arm it.', false),
  ],
  panels: [
    {
      id: 'passes',
      title: 'PASSES',
      mount(host, ctx) {
        bindHover(ctx)
        const paint = () => {
          const id = ctx.getTrackId()
          const query = id?.startsWith('sat:') ? id.slice(4) : 'iss'
          const sat = findSat(query)
          if (!sat) {
            host.textContent = catalogReady() ? 'NO TLE' : 'LOADING CATALOG'
            return
          }
          const pin = ctx.getPin()
          host.textContent = predict(sat.satrec, sat.fix.name, pin.lat, pin.lon, ctx.clock.now())
        }
        const off = ctx.onTrack(paint)
        const timer = window.setInterval(paint, 30_000)
        paint()
        return () => {
          window.clearInterval(timer)
          off()
        }
      },
    },
  ],
  commands: [
    {
      name: 'sat',
      usage: 'sat <name or norad>',
      summary: 'Find a satellite and lock it',
      run(args, ctx) {
        const hit = locateSat(args.join(' '))
        if (!hit) return catalogReady() ? 'NO SATELLITE' : 'CATALOG STILL LOADING'
        ctx.setLayer(hit.layerId, true)
        ctx.flyTo(hit.lat, hit.lon, 900)
        ctx.track(`sat:${hit.norad}`)
        return `SAT ${hit.name}`
      },
    },
    {
      name: 'find',
      usage: 'find <name, norad, or mmsi>',
      summary: 'Lock a satellite or a ship',
      run(args, ctx) {
        const query = args.join(' ').trim()
        const sat = locateSat(query)
        if (sat) {
          ctx.setLayer(sat.layerId, true)
          ctx.flyTo(sat.lat, sat.lon, 900)
          ctx.track(`sat:${sat.norad}`)
          return `SAT ${sat.name}`
        }
        const ship = locateShip(query)
        if (ship) {
          ctx.setLayer('ships', true)
          ctx.flyTo(ship.lat, ship.lon, 80)
          ctx.track(`ship:${ship.mmsi}`)
          return `SHIP ${ship.name}`
        }
        const contact = ctx.findContact(query)
        if (!contact) return 'NOT FOUND'
        ctx.flyTo(contact.lat, contact.lon, 400)
        ctx.track(contact.id)
        return contact.label
      },
    },
    {
      name: 'pass',
      usage: 'pass [name]',
      summary: 'Predict satellite passes over the pin',
      run(args, ctx) {
        const query = args.join(' ').trim()
        const sat = query ? findSat(query) : findSat(String(focusNorad() ?? '')) ?? findSat('iss')
        if (!sat) return catalogReady() ? 'NO SATELLITE' : 'CATALOG STILL LOADING'
        const pin = ctx.getPin()
        return predict(sat.satrec, sat.fix.name, pin.lat, pin.lon, Date.now() + ctx.getTimeMinutes() * 60_000)
      },
    },
  ],
}

function checkPasses(ctx: PluginContext) {
  const pin = ctx.getPin()
  const now = new Date(ctx.clock.now())
  for (const rule of ctx.alerts.rules) {
    if (rule.kind !== 'pass') continue
    const sat = findCatalog(rule.value)
    if (!sat) continue
    const el = elevationDeg(sat.satrec, pin.lat, pin.lon, now)
    if (el != null && el >= 10) ctx.alerts.raise(`pass:${rule.id}:${sat.norad}`, `PASS ${sat.name}`, `ELEV ${el.toFixed(0)}° OVER PIN`)
  }
}

function predict(satrec: import('satellite.js').SatRec, name: string, lat: number, lon: number, start: number): string {
  const samples: { t: number; el: number }[] = []
  const end = start + 12 * 60 * 60 * 1000
  for (let t = start; t <= end; t += 60_000) {
    const el = elevationDeg(satrec, lat, lon, new Date(t))
    if (el != null) samples.push({ t, el })
  }
  const windows = windowsAbove(samples, 10).slice(0, 4)
  if (!windows.length) return `${name}\nNO PASS ABOVE 10° IN 12H`
  return [name, ...windows.map(formatPass)].join('\n')
}
