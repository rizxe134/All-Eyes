import type { FlightView } from '../aircraft/detail'
import { NA } from '../aircraft/metrics'
import { displayAltKm } from './alt'
import { catalogSat, placeOf, type CatalogSat } from './catalog'
import { keplerKm, orbitClass, tleMotion, viewerShape } from './elements'
import { formatPass, windowsAbove } from './passes'
import { elevationDeg, orbitTrack, speedKmS } from './propagate'
import { parseSatcat, type SatcatRecord } from './satcat'
import type { CreditPhoto } from './photo'

const photos = new Map<number, CreditPhoto>()
const satcat = new Map<number, SatcatRecord>()
const listeners = new Set<() => void>()
const passMemo = new Map<number, { at: number; lat: number; lon: number; text: string }>()

export function onSatDetail(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function storeSatPhoto(norad: number, photo: CreditPhoto | null): void {
  if (!photo) return
  photos.set(norad, photo)
  for (const fn of listeners) fn()
}

export function storeSatcat(norad: number, record: SatcatRecord | null): void {
  if (!record) return
  satcat.set(norad, record)
  for (const fn of listeners) fn()
}

export function readSatcat(payload: unknown, norad: number): void {
  storeSatcat(norad, parseSatcat(payload))
}

function nextPass(sat: CatalogSat, lat: number, lon: number, start: number): string {
  const hit = passMemo.get(sat.norad)
  if (hit && start - hit.at < 60_000 && Math.abs(hit.lat - lat) < 0.4 && Math.abs(hit.lon - lon) < 0.4) return hit.text
  const samples: { t: number; el: number }[] = []
  const end = start + 12 * 60 * 60 * 1000
  for (let t = start; t <= end; t += 120_000) {
    const el = elevationDeg(sat.satrec, lat, lon, new Date(t))
    if (el != null) samples.push({ t, el })
  }
  const window = windowsAbove(samples, 10)[0]
  const text = window ? formatPass(window) : 'NONE IN 12H'
  passMemo.set(sat.norad, { at: start, lat, lon, text })
  return text
}

export function formatSat(norad: number, pin: { lat: number; lon: number }, now = Date.now()): FlightView | null {
  const sat = catalogSat(norad)
  if (!sat) return null
  const motion = tleMotion(sat.line2)
  const place = placeOf(norad)
  const klass = motion ? orbitClass(motion.meanMotion, motion.eccentricity) : 'LEO'
  const kepler = motion ? keplerKm(motion.meanMotion, motion.eccentricity) : null
  const record = satcat.get(norad)
  const photo = photos.get(norad)
  const speed = place?.speed ?? speedKmS(sat.satrec, new Date(now))
  const pass = nextPass(sat, pin.lat, pin.lon, now)
  const rows = [
    { k: 'NORAD', v: String(sat.norad) },
    { k: 'INTL DES', v: record?.objectId || sat.designator || NA },
    { k: 'OBJECT', v: record?.objectType || NA },
    { k: 'CLASS', v: klass },
    { k: 'OWNER', v: record?.owner || NA },
    { k: 'LAUNCH', v: record?.launch || NA },
    { k: 'ORBIT', v: klass },
    { k: 'ALTITUDE', v: place ? `${Math.round(place.altKm)} KM` : NA },
    { k: 'VELOCITY', v: speed == null ? NA : `${speed.toFixed(2)} KM/S` },
    { k: 'PERIOD', v: kepler ? `${kepler.periodMin.toFixed(1)} MIN` : NA },
    { k: 'INCLINATION', v: motion ? `${motion.inclination.toFixed(2)}°` : NA },
    { k: 'ECCENTRICITY', v: motion ? motion.eccentricity.toFixed(6) : NA },
    { k: 'APOGEE', v: kepler ? `${Math.round(kepler.apogeeKm)} KM` : NA },
    { k: 'PERIGEE', v: kepler ? `${Math.round(kepler.perigeeKm)} KM` : NA },
    { k: 'LAT LON', v: place ? `${place.lat.toFixed(2)} ${place.lon.toFixed(2)}` : NA },
    { k: 'SUBSAT', v: place ? `${place.lat.toFixed(2)} ${place.lon.toFixed(2)}` : NA },
    { k: 'NEXT PASS', v: pass },
  ]
  return {
    callsign: sat.name,
    typeCode: klass,
    typeName: record?.objectType || klass,
    operator: record?.owner || NA,
    originCode: klass,
    originCity: 'ORBIT',
    destCode: place ? place.lat.toFixed(1) : '----',
    destCity: place ? `${place.lon.toFixed(1)} SUBSAT` : NA,
    progress: null,
    rows,
    photoUrl: photo?.url || '',
    photoLink: photo?.link || '',
    photoCredit: photo?.credit || '',
    times: [
      { k: 'LAUNCH', v: record?.launch || NA },
      { k: 'PASS', v: pass },
      { k: 'PERIOD', v: kepler ? `${Math.round(kepler.periodMin)}M` : NA },
    ],
    graphTitle: 'ALTITUDE & VELOCITY GRAPH',
    routeLabel: 'TRACK',
  }
}

export function satGraph(norad: number, now = Date.now()): { altFt: number; gsKt: number }[] {
  const sat = catalogSat(norad)
  const motion = sat ? tleMotion(sat.line2) : null
  if (!sat || !motion) return []
  const minutes = Math.min(keplerKm(motion.meanMotion, motion.eccentricity).periodMin, 180)
  const points = orbitTrack(sat.satrec, now, minutes, 24)
  return points.map((point, index) => ({
    altFt: point.altKm,
    gsKt: speedKmS(sat.satrec, new Date(now + (minutes * 60_000 * index) / 24)) ?? 0,
  }))
}

export function satTracks(norad: number, now = Date.now()): { past: { lat: number; lon: number; altKm: number }[]; future: { lat: number; lon: number; altKm: number }[]; ring: { lat: number; lon: number; altKm: number }[] } | null {
  const sat = catalogSat(norad)
  const motion = sat ? tleMotion(sat.line2) : null
  if (!sat || !motion) return null
  const minutes = Math.min(keplerKm(motion.meanMotion, motion.eccentricity).periodMin, 200)
  const past = orbitTrack(sat.satrec, now - minutes * 60_000, minutes, 72).map((point) => ({ ...point, altKm: 0 }))
  const future = orbitTrack(sat.satrec, now, minutes, 72).map((point) => ({ ...point, altKm: 0 }))
  const ring = orbitTrack(sat.satrec, now, minutes, 96).map((point) => ({ ...point, altKm: displayAltKm(point.altKm) }))
  return { past, future, ring }
}

export function hoverTrack(norad: number, now = Date.now()): { lat: number; lon: number; altKm: number }[] {
  const sat = catalogSat(norad)
  if (!sat) return []
  return orbitTrack(sat.satrec, now, 12, 24).map((point) => ({ ...point, altKm: 0 }))
}

export function shapeFor(norad: number): string {
  const sat = catalogSat(norad)
  if (!sat) return 'sat-comms'
  return viewerShape(sat.name, sat.group)
}

