export const EARTH_KM = 6371

export interface Vec3 {
  x: number
  y: number
  z: number
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function normalizeLon(lon: number): number {
  const wrapped = (((lon + 180) % 360) + 360) % 360 - 180
  return wrapped === -180 ? 180 : wrapped
}

export function latLonToVec(lat: number, lon: number, altKm = 0, radius = 1): Vec3 {
  const phi = ((90 - lat) * Math.PI) / 180
  const theta = ((lon + 180) * Math.PI) / 180
  const r = radius * (1 + altKm / EARTH_KM)
  const sinPhi = Math.sin(phi)
  return {
    x: -r * sinPhi * Math.cos(theta),
    y: r * Math.cos(phi),
    z: r * sinPhi * Math.sin(theta),
  }
}

export function vecToLatLon(v: Vec3): { lat: number; lon: number } {
  const r = Math.hypot(v.x, v.y, v.z) || 1
  const lat = 90 - (Math.acos(clamp(v.y / r, -1, 1)) * 180) / Math.PI
  const lon = normalizeLon((Math.atan2(v.z, -v.x) * 180) / Math.PI - 180)
  return { lat, lon }
}

export function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z
}

export function scale(v: Vec3, k: number): Vec3 {
  return { x: v.x * k, y: v.y * k, z: v.z * k }
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  }
}

export function normalize(v: Vec3): Vec3 {
  const len = Math.hypot(v.x, v.y, v.z) || 1
  return { x: v.x / len, y: v.y / len, z: v.z / len }
}

/** Local east/north/up at a point on the unit sphere. */
export function enuBasis(lat: number, lon: number): { east: Vec3; north: Vec3; up: Vec3 } {
  const up = normalize(latLonToVec(lat, lon, 0, 1))
  const ahead = latLonToVec(Math.min(89.7, lat + 0.05), lon, 0, 1)
  let north = normalize(sub(ahead, up))
  north = normalize(sub(north, scale(up, dot(north, up))))
  if (Math.hypot(north.x, north.y, north.z) < 1e-8) north = { x: 0, y: 0, z: 1 }
  const east = normalize(cross(north, up))
  north = normalize(cross(up, east))
  return { east, north, up }
}

export function headingVector(lat: number, lon: number, headingDeg: number): Vec3 {
  const { east, north } = enuBasis(lat, lon)
  const h = (headingDeg * Math.PI) / 180
  return normalize({
    x: north.x * Math.cos(h) + east.x * Math.sin(h),
    y: north.y * Math.cos(h) + east.y * Math.sin(h),
    z: north.z * Math.cos(h) + east.z * Math.sin(h),
  })
}

export function rightVector(lat: number, lon: number, headingDeg: number): Vec3 {
  const { east, north } = enuBasis(lat, lon)
  const h = (headingDeg * Math.PI) / 180
  return normalize({
    x: east.x * Math.cos(h) - north.x * Math.sin(h),
    y: east.y * Math.cos(h) - north.y * Math.sin(h),
    z: east.z * Math.cos(h) - north.z * Math.sin(h),
  })
}

export function lerpLon(from: number, to: number, t: number): number {
  return normalizeLon(from + normalizeLon(to - from) * t)
}

export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = EARTH_KM
  const p1 = (lat1 * Math.PI) / 180
  const p2 = (lat2 * Math.PI) / 180
  const dp = ((lat2 - lat1) * Math.PI) / 180
  const dl = ((lon2 - lon1) * Math.PI) / 180
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(a)))
}

/** Degrees clockwise from north. */
export function bearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const p1 = (lat1 * Math.PI) / 180
  const p2 = (lat2 * Math.PI) / 180
  const dl = ((lon2 - lon1) * Math.PI) / 180
  const y = Math.sin(dl) * Math.cos(p2)
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl)
  return (Math.atan2(y, x) * 180) / Math.PI
}

export function sunDirection(unixMs: number): Vec3 {
  const date = new Date(unixMs)
  const start = Date.UTC(date.getUTCFullYear(), 0, 0)
  const day = (unixMs - start) / 86_400_000
  const decl = 23.44 * Math.sin(((360 / 365) * (day - 81) * Math.PI) / 180)
  const hours = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600
  const subLon = (12 - hours) * 15
  return normalize(latLonToVec(decl, subLon, 0, 1))
}

export function formatLat(lat: number): string {
  return `${Math.abs(lat).toFixed(2)}${lat >= 0 ? 'N' : 'S'}`
}

export function formatLon(lon: number): string {
  return `${Math.abs(lon).toFixed(2)}${lon >= 0 ? 'E' : 'W'}`
}
