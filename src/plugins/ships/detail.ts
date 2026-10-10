import { formatSpeed, type SpeedUnit } from '../../core/cards'
import type { FlightView } from '../aircraft/detail'
import { NA } from '../aircraft/metrics'
import { flagFromMmsi } from './mmsi'
import { navLabel, type ShipMeta } from './parse'
import { classifyShip } from './sprites'
import type { HeldShip } from './retain'

export interface ShipPhoto {
  url: string
  link: string
  credit: string
}

const photos = new Map<number, ShipPhoto>()
const listeners = new Set<() => void>()

export function shipPhoto(mmsi: number): ShipPhoto | undefined {
  return photos.get(mmsi)
}

export function storeShipPhoto(mmsi: number, photo: ShipPhoto | null): void {
  if (!photo) return
  photos.set(mmsi, photo)
  for (const fn of listeners) fn()
}

export function onShipDetail(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function formatShip(ship: HeldShip, meta: ShipMeta | undefined, unit: SpeedUnit, now = Date.now()): FlightView {
  const kind = classifyShip(meta?.shipType ?? 0)
  const flag = flagFromMmsi(ship.mmsi) || NA
  const name = meta?.name || `MMSI ${ship.mmsi}`
  const ageSec = ship.seen ? Math.max(0, Math.round((now - ship.seen) / 1000)) : null
  const photo = photos.get(ship.mmsi)
  const dim = meta?.length != null && meta.beam != null ? `${Math.round(meta.length)} x ${Math.round(meta.beam)} M` : NA
  const rows = [
    { k: 'VESSEL TYPE', v: kind.name },
    { k: 'MMSI', v: String(ship.mmsi) },
    { k: 'IMO', v: meta?.imo || NA },
    { k: 'CALLSIGN', v: meta?.callSign || NA },
    { k: 'FLAG', v: flag },
    { k: 'CATEGORY', v: kind.name },
    { k: 'DIMENSIONS', v: dim },
    { k: 'DRAUGHT', v: meta?.draught != null ? `${meta.draught} M` : NA },
    { k: 'SPEED', v: formatSpeed(ship.sog, unit) },
    { k: 'COURSE', v: `${Math.round(ship.cog)}°` },
    { k: 'HEADING', v: `${Math.round(ship.heading)}°` },
    { k: 'NAV STATUS', v: navLabel(ship.navStat) },
    { k: 'DESTINATION', v: meta?.destination || NA },
    { k: 'ETA', v: meta?.eta || NA },
    { k: 'POSITION', v: `${ship.lat.toFixed(3)} ${ship.lon.toFixed(3)}` },
    { k: 'LAST POSITION', v: ageSec == null ? NA : `${ageSec}S` },
  ]
  return {
    callsign: name,
    typeCode: kind.name.slice(0, 8),
    typeName: kind.name,
    operator: flag === NA ? 'FLAG NOT AVAILABLE' : flag,
    originCode: 'AIS',
    originCity: meta?.source ? meta.source.toUpperCase() : 'LIVE',
    destCode: meta?.destination ? meta.destination.slice(0, 8) : '----',
    destCity: meta?.destination || NA,
    progress: null,
    rows,
    photoUrl: photo?.url || '',
    photoLink: photo?.link || '',
    photoCredit: photo?.credit || '',
    times: [
      { k: 'ETA', v: meta?.eta || NA },
      { k: 'AGE', v: ageSec == null ? NA : `${ageSec}S` },
      { k: 'NAV', v: navLabel(ship.navStat) },
    ],
    graphTitle: 'SPEED & COURSE GRAPH',
    routeLabel: 'TRACK',
  }
}

export function shipDetailText(view: FlightView): string {
  return [view.callsign, ...view.rows.map((row) => `${row.k}  ${row.v}`)].join('\n')
}
