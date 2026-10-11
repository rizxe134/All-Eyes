/** Simulated vehicles on real OSM polylines. Positions are a pure function of the roads and the clock. */

import { bearingDeg } from '../core/geo'
import type { CityRoad, LatLon } from './overpass'

export type VehicleKind = 'car' | 'bus' | 'train'

export interface TrafficVehicle {
  id: string
  lat: number
  lon: number
  heading: number
  kind: VehicleKind
  /** Palette colour, or a congestion colour when a live speed ratio was supplied. */
  color: string
}

const CLASS_SPEED_MPS: Record<string, number> = {
  motorway: 26,
  motorway_link: 16,
  trunk: 20,
  primary: 14,
  secondary: 11,
  tertiary: 9,
  residential: 7,
  unclassified: 8,
  rail: 18,
  light_rail: 12,
  subway: 12,
  tram: 8,
}

function hash32(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function todFactor(unixMs: number): number {
  const hour = new Date(unixMs).getUTCHours() + new Date(unixMs).getUTCMinutes() / 60
  const rush = Math.exp(-((hour - 8) ** 2) / 8) + Math.exp(-((hour - 17.5) ** 2) / 8)
  const night = hour < 5 || hour > 22 ? 0.35 : 0.7
  return Math.min(1, night + rush * 0.55)
}

function lengthM(points: LatLon[]): number[] {
  const acc = [0]
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    const dy = (b.lat - a.lat) * 111_320
    const dx = (b.lon - a.lon) * 111_320 * Math.cos((a.lat * Math.PI) / 180)
    acc.push(acc[i - 1] + Math.hypot(dx, dy))
  }
  return acc
}

function sample(points: LatLon[], acc: number[], dist: number): { lat: number; lon: number; heading: number } {
  const total = acc[acc.length - 1] || 1
  let d = ((dist % total) + total) % total
  let i = 1
  while (i < acc.length - 1 && acc[i] < d) i += 1
  const span = acc[i] - acc[i - 1] || 1
  const t = (d - acc[i - 1]) / span
  const a = points[i - 1]
  const b = points[i]
  return {
    lat: a.lat + (b.lat - a.lat) * t,
    lon: a.lon + (b.lon - a.lon) * t,
    heading: bearingDeg(a.lat, a.lon, b.lat, b.lon),
  }
}

function congestion(ratio: number): string {
  if (ratio >= 0.75) return '#3dd68c'
  if (ratio >= 0.45) return '#ffb020'
  return '#ff4b4b'
}

function palette(kind: VehicleKind): string {
  if (kind === 'train') return '#7dffb3'
  if (kind === 'bus') return '#4da3ff'
  return '#ffb020'
}

function density(cls: string): number {
  if (cls === 'motorway' || cls === 'rail') return 1
  if (cls === 'trunk' || cls === 'primary' || cls === 'light_rail' || cls === 'subway') return 0.7
  if (cls === 'secondary' || cls === 'tertiary' || cls === 'tram') return 0.4
  return 0.22
}

/**
 * `flowRatio` is current speed / free-flow from a live feed. Null keeps the palette
 * and the caller must keep the HUD on SIMULATED. A number recolours every vehicle.
 */
export function simulateTraffic(roads: readonly CityRoad[], rails: readonly CityRoad[], unixMs: number, flowRatio: number | null): TrafficVehicle[] {
  const out: TrafficVehicle[] = []
  const factor = todFactor(unixMs)
  const push = (road: CityRoad, kind: VehicleKind) => {
    if (out.length >= 240) return
    const acc = lengthM(road.points)
    const total = acc[acc.length - 1]
    if (total < 40) return
    const speed = CLASS_SPEED_MPS[road.cls] ?? 9
    const count = Math.min(5, Math.max(1, Math.round((total / 700) * density(road.cls) * factor)))
    const seed = hash32(road.id)
    for (let n = 0; n < count; n++) {
      if (out.length >= 240) return
      const offset = ((seed >>> (n * 3)) % 1000) / 1000
      const dir = (seed & (1 << n)) !== 0 ? 1 : -1
      const traveled = offset * total + dir * (unixMs / 1000) * speed
      const at = sample(road.points, acc, traveled)
      const vehicleKind: VehicleKind = kind === 'car' && n === 0 && (road.cls === 'primary' || road.cls === 'secondary') ? 'bus' : kind
      out.push({
        id: `${road.id}:${n}`,
        lat: at.lat,
        lon: at.lon,
        heading: dir < 0 ? at.heading + 180 : at.heading,
        kind: vehicleKind,
        color: flowRatio == null ? palette(vehicleKind) : congestion(flowRatio),
      })
    }
  }
  for (const road of roads) push(road, 'car')
  for (const rail of rails) push(rail, 'train')
  return out
}
