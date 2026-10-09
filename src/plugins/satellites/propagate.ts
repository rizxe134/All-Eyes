import * as satellite from 'satellite.js'
import type { SatFix } from './parse'

export interface SatPoint {
  lat: number
  lon: number
  altKm: number
}

function isEci(position: satellite.EciVec3<number> | boolean): position is satellite.EciVec3<number> {
  return typeof position === 'object' && position !== null && 'x' in position
}

export function buildSatrec(fix: SatFix): satellite.SatRec | null {
  try {
    const rec = satellite.twoline2satrec(fix.line1, fix.line2)
    if (rec.error) return null
    return rec
  } catch {
    return null
  }
}

export function propagateGeodetic(satrec: satellite.SatRec, date: Date): SatPoint | null {
  const pv = satellite.propagate(satrec, date)
  if (!isEci(pv.position)) return null
  const geo = satellite.eciToGeodetic(pv.position, satellite.gstime(date))
  const lat = satellite.degreesLat(geo.latitude)
  const lon = satellite.degreesLong(geo.longitude)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  return { lat, lon, altKm: geo.height }
}

export function elevationDeg(satrec: satellite.SatRec, lat: number, lon: number, date: Date): number | null {
  const pv = satellite.propagate(satrec, date)
  if (!isEci(pv.position)) return null
  const gmst = satellite.gstime(date)
  const ecf = satellite.eciToEcf(pv.position, gmst)
  const look = satellite.ecfToLookAngles(
    {
      latitude: (lat * Math.PI) / 180,
      longitude: (lon * Math.PI) / 180,
      height: 0.05,
    },
    ecf,
  )
  return (look.elevation * 180) / Math.PI
}

export function periodMinutes(satrec: satellite.SatRec): number {
  if (!satrec.no) return 90
  return (2 * Math.PI) / satrec.no
}

export function orbitTrack(satrec: satellite.SatRec, startMs: number, minutes: number, steps: number): SatPoint[] {
  const out: SatPoint[] = []
  const span = minutes * 60_000
  for (let i = 0; i <= steps; i++) {
    const point = propagateGeodetic(satrec, new Date(startMs + (span * i) / steps))
    if (point) out.push(point)
  }
  return out
}
