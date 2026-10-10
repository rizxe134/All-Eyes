import { formatCard, formatSpeed } from '../../core/cards'
import type { AllEyesPlugin, Contact, PluginContext } from '../../core/types'
import { getJson } from '../../net/http'
import { formatShip, onShipDetail, shipDetailText, shipPhoto, storeShipPhoto } from './detail'
import { dueShipTiles, shipCoverageLimit, shipSourceState, shipStatusLine, shipsInView, shipTiles, type ShipBox, type ShipStamp } from './feed'
import { parseAis, parseAisStream, parseOpenWaters, parseVessels, type ShipMeta } from './parse'
import { parseCommons } from './photo'
import { mergeShips, projectAhead, SHIP_STALE_MS, type HeldShip } from './retain'
import { classifyShip, flagFromMmsi } from './sprites'

const LAYER = 'ships'
const meta = new Map<number, ShipMeta>()
const trails = new Map<number, { lat: number; lon: number; sog: number; cog: number; t: number }[]>()
let held: HeldShip[] = []
let trackOn = true
let trailOwned = false
let socket: WebSocket | null = null
let streamLive = false
let streamKey = ''
let republish = () => {}
const photoTried = new Set<number>()

export function shipTrackOn(): boolean {
  return trackOn
}

export function toggleShipTrack(): boolean {
  trackOn = !trackOn
  return trackOn
}

export function shipNow(mmsi: number): HeldShip | null {
  return held.find((ship) => ship.mmsi === mmsi) ?? null
}

export function shipMeta(mmsi: number): ShipMeta | undefined {
  return meta.get(mmsi)
}

export function shipTrail(mmsi: number) {
  return trails.get(mmsi) ?? []
}

export function locateShip(query: string): { mmsi: number; name: string; lat: number; lon: number } | null {
  const q = query.trim().toLowerCase()
  if (!q) return null
  const asNumber = Number(q)
  if (Number.isFinite(asNumber)) {
    const hit = held.find((ship) => ship.mmsi === asNumber)
    if (hit) return { mmsi: hit.mmsi, name: meta.get(hit.mmsi)?.name || String(hit.mmsi), lat: hit.lat, lon: hit.lon }
  }
  for (const ship of held) {
    const name = meta.get(ship.mmsi)?.name?.toLowerCase() ?? ''
    if (name && (name === q || name.includes(q))) {
      return { mmsi: ship.mmsi, name: meta.get(ship.mmsi)?.name || name, lat: ship.lat, lon: ship.lon }
    }
  }
  return null
}

export { formatShip, shipDetailText, onShipDetail }

function rememberMeta(rows: ShipMeta[]) {
  for (const row of rows) {
    const prev = meta.get(row.mmsi)
    meta.set(row.mmsi, {
      mmsi: row.mmsi,
      name: row.name || prev?.name || '',
      callSign: row.callSign || prev?.callSign || '',
      destination: row.destination || prev?.destination || '',
      shipType: row.shipType || prev?.shipType || 0,
      imo: row.imo || prev?.imo || '',
      draught: row.draught ?? prev?.draught ?? null,
      length: row.length ?? prev?.length ?? null,
      beam: row.beam ?? prev?.beam ?? null,
      eta: row.eta || prev?.eta || '',
      source: row.source || prev?.source || '',
    })
  }
}

function rememberTrail(ship: HeldShip) {
  const row = trails.get(ship.mmsi) ?? []
  const last = row[row.length - 1]
  if (!last || Math.hypot(last.lat - ship.lat, last.lon - ship.lon) > 0.002) {
    row.push({ lat: ship.lat, lon: ship.lon, sog: ship.sog, cog: ship.cog, t: ship.seen })
    if (row.length > 48) row.shift()
    trails.set(ship.mmsi, row)
  }
}

function toContact(ship: HeldShip, unit: 'kt' | 'mph' | 'kmh'): Contact {
  const info = meta.get(ship.mmsi)
  const kind = classifyShip(info?.shipType ?? 0)
  const name = info?.name || `MMSI ${ship.mmsi}`
  const moving = ship.sog > 0.5 && ship.navStat !== 5 && ship.navStat !== 1
  const card = [
    { k: 'NAME', v: name },
    { k: 'MMSI', v: String(ship.mmsi) },
    { k: 'TYPE', v: kind.name },
    { k: 'SPD', v: formatSpeed(ship.sog, unit) },
    { k: 'CSE', v: `${Math.round(ship.cog)}°` },
    { k: 'FLAG', v: flagFromMmsi(ship.mmsi) },
  ]
  return {
    id: `ship:${ship.mmsi}`,
    layerId: LAYER,
    kind: 'ship',
    lat: ship.lat,
    lon: ship.lon,
    altKm: 0,
    heading: ship.heading,
    label: name,
    callsign: info?.callSign || name,
    detail: formatCard(card),
    brightness: moving ? 0.72 : 0.4,
    shape: kind.sprite,
    scale: moving ? 0.85 : 0.7,
    time: ship.time,
    card,
    speedKt: ship.sog,
  }
}

export const shipPlugin: AllEyesPlugin = {
  id: 'ships',
  name: 'Ships',
  version: '1.5.0',
  layers: [
    {
      id: LAYER,
      label: 'SHIPS',
      description: 'Keyless AIS for the view, plus Finnish waters. A global AISStream key is optional in CFG.',
      defaultOn: true,
      create(ctx) {
        let timer = 0
        let on = false
        let pumping = false
        const stamps = new Map<string, ShipStamp>()
        const stats = { openOk: 0, openFail: 0, openTrunc: false, finOk: 0, finFail: 0 }
        let finAt = 0

        const paintTrail = () => {
          const id = ctx.getTrackId()
          const mmsi = id?.startsWith('ship:') ? Number(id.slice(5)) : NaN
          if (!trackOn || !Number.isFinite(mmsi)) {
            if (trailOwned && !id?.startsWith('air:')) {
              ctx.globe.setHistory(null)
              ctx.globe.setRoute(null)
            }
            trailOwned = false
            return
          }
          const ship = shipNow(mmsi)
          const row = shipTrail(mmsi)
          if (!ship) return
          trailOwned = true
          ctx.globe.setHistory(row.length < 2 ? [{ lat: ship.lat, lon: ship.lon, altKm: 0 }, { lat: ship.lat, lon: ship.lon, altKm: 0 }] : row.map((point) => ({
            lat: point.lat,
            lon: point.lon,
            altKm: 0,
          })))
          if (ship.sog > 0.4) {
            const ahead = projectAhead(ship.lat, ship.lon, ship.cog, ship.sog, 20)
            ctx.globe.setRoute([{ lat: ship.lat, lon: ship.lon, altKm: 0 }, { ...ahead, altKm: 0 }])
          } else {
            ctx.globe.setRoute(null)
          }
        }

        const publish = () => {
          const unit = ctx.settings.get().speedUnit
          const view = ctx.globe.getView()
          ctx.publish(LAYER, held.map((ship) => toContact(ship, unit)))
          const visible = shipsInView(held, view.lat, view.lon, view.rangeKm)
          const center = shipTilesCenter(view.lat, view.lon, view.rangeKm, stamps)
          const gap = shipCoverageLimit(visible, center.tried, center.ok, center.count, streamLive)
          const sources = [
            { id: 'OPENWATERS', state: shipSourceState(stats.openOk, stats.openFail, stats.openTrunc) },
            { id: 'DIGITRAFFIC', state: shipSourceState(stats.finOk, stats.finFail, false) },
          ]
          if (ctx.settings.get().aisstreamKey) {
            sources.push({ id: 'AISSTREAM', state: streamLive ? 'OK' as const : 'OFFLINE' as const })
          }
          ctx.status?.(LAYER, shipStatusLine(held.length, visible, sources, gap))
          const quiet = held.length === 0 && sources.every((row) => row.state === 'OFFLINE')
          ctx.log(LAYER, quiet ? 'AIS FEED OFFLINE' : '')
          paintTrail()
        }
        republish = publish

        const take = (ships: HeldShip[]) => {
          held = mergeShips(held, ships, Date.now(), SHIP_STALE_MS)
          for (const ship of held) rememberTrail(ship)
          publish()
        }

        const fetchBox = async (box: ShipBox) => {
          const url = `/api/ais/box?south=${box.south.toFixed(3)}&west=${box.west.toFixed(3)}&north=${box.north.toFixed(3)}&east=${box.east.toFixed(3)}`
          try {
            const page = parseOpenWaters(await getJson(url, ctx.settings, ctx.signal))
            rememberMeta(page.meta)
            stats.openOk += 1
            stats.openTrunc = stats.openTrunc || page.truncated
            stamps.set(box.key, { at: Date.now(), ok: true, count: page.ships.length })
            const now = Date.now()
            take(page.ships.map((fix) => ({ ...fix, seen: fix.time || now })))
          } catch {
            stats.openFail += 1
            stamps.set(box.key, { at: Date.now(), ok: false, count: 0 })
          }
        }

        const fetchFinland = async () => {
          if (Date.now() - finAt < 40_000) return
          finAt = Date.now()
          try {
            const [locations, vessels] = await Promise.all([
              getJson('/api/ais/locations', ctx.settings, ctx.signal).then(parseAis),
              getJson('/api/ais/vessels', ctx.settings, ctx.signal).then(parseVessels).catch(() => [] as ShipMeta[]),
            ])
            rememberMeta(vessels.map((row) => ({ ...row, source: row.source || 'digitraffic' })))
            stats.finOk += 1
            const now = Date.now()
            take(locations.map((fix) => ({ ...fix, seen: fix.time > 1e12 ? fix.time : now })))
          } catch {
            stats.finFail += 1
          }
        }

        const pump = async () => {
          if (pumping || !on || ctx.signal.aborted) return
          pumping = true
          try {
            syncStream(ctx)
            const view = ctx.globe.getView()
            const due = dueShipTiles(Date.now(), view.lat, view.lon, view.rangeKm, stamps, 1)
            await Promise.all([fetchFinland(), ...due.map((box) => fetchBox(box))])
            if (due.length === 0) publish()
          } finally {
            pumping = false
          }
        }

        const offTrack = ctx.onTrack((id) => {
          const mmsi = id?.startsWith('ship:') ? Number(id.slice(5)) : NaN
          if (Number.isFinite(mmsi)) void loadPhoto(mmsi, ctx)
          paintTrail()
        })

        return {
          setEnabled(next) {
            if (next === on) return
            on = next
            window.clearInterval(timer)
            if (!next) {
              ctx.publish(LAYER, [])
              closeStream()
              if (trailOwned) {
                ctx.globe.setHistory(null)
                ctx.globe.setRoute(null)
                trailOwned = false
              }
              return
            }
            void pump()
            timer = window.setInterval(() => void pump(), 8_000)
          },
          dispose() {
            on = false
            window.clearInterval(timer)
            closeStream()
            offTrack()
            ctx.publish(LAYER, [])
          },
        }
      },
    },
  ],
  panels: [
    {
      id: 'ships-note',
      title: 'AIS',
      mount(host) {
        host.className = 'ae-note'
        host.textContent = 'VIEW TILES + FINNISH WATERS\nGLOBAL NEEDS AN AISSTREAM KEY IN CFG'
        return () => {}
      },
    },
  ],
}

function shipTilesCenter(lat: number, lon: number, rangeKm: number, stamps: Map<string, ShipStamp>) {
  const box = shipTiles(lat, lon, rangeKm)[0]
  if (!box) return { tried: false, ok: false, count: 0 }
  const stamp = stamps.get(box.key)
  if (!stamp) return { tried: false, ok: false, count: 0 }
  return { tried: true, ok: stamp.ok, count: stamp.count }
}

async function loadPhoto(mmsi: number, ctx: PluginContext) {
  if (photoTried.has(mmsi) || shipPhoto(mmsi)) return
  const info = meta.get(mmsi)
  const query = info?.imo ? `IMO ${info.imo}` : info?.name || ''
  if (query.trim().length < 3) return
  photoTried.add(mmsi)
  try {
    const body = await getJson(`/api/commons?q=${encodeURIComponent(query)}`, ctx.settings, undefined)
    storeShipPhoto(mmsi, parseCommons(body, { name: info?.name || '', imo: info?.imo || '' }))
  } catch {
    /* no photo */
  }
}

function closeStream() {
  streamLive = false
  if (socket) {
    socket.onclose = null
    socket.close()
    socket = null
  }
}

function syncStream(ctx: PluginContext) {
  const key = ctx.settings.get().aisstreamKey.trim()
  if (!key) {
    closeStream()
    streamKey = ''
    return
  }
  if (socket && streamKey === key && socket.readyState <= 1) return
  closeStream()
  streamKey = key
  let ws: WebSocket
  try {
    ws = new WebSocket('wss://stream.aisstream.io/v0/stream')
  } catch {
    return
  }
  socket = ws
  ws.onopen = () => {
    streamLive = true
    const view = ctx.globe.getView()
    const box = shipTiles(view.lat, view.lon, view.rangeKm)[0]
    if (!box) return
    ws.send(JSON.stringify({
      APIKey: key,
      BoundingBoxes: [[[box.north, box.west], [box.south, box.east]]],
      FilterMessageTypes: ['PositionReport', 'ShipStaticData', 'StandardClassBPositionReport'],
    }))
  }
  ws.onmessage = (event) => {
    void (async () => {
      try {
        const body = JSON.parse(String(event.data)) as unknown
        const update = parseAisStream(body)
        if (update.meta) rememberMeta([update.meta])
        if (!update.fix) return
        const now = Date.now()
        held = mergeShips(held, [{ ...update.fix, seen: now }], now, SHIP_STALE_MS)
        const ship = held.find((row) => row.mmsi === update.fix!.mmsi)
        if (ship) rememberTrail(ship)
        republish()
      } catch {
        /* ignore a bad frame */
      }
    })()
  }
  ws.onclose = () => {
    streamLive = false
    if (socket === ws) socket = null
  }
  ws.onerror = () => {
    streamLive = false
  }
}
