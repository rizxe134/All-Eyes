/** Orbit shape from a TLE, without inventing a catalog field the lines do not carry. */

export type OrbitClass = 'LEO' | 'MEO' | 'GEO' | 'HEO'

const MU = 398600.4418
const RE = 6378.137

export interface Motion {
  inclination: number
  eccentricity: number
  meanMotion: number
}

export function tleMotion(line2: string): Motion | null {
  if (!line2.startsWith('2 ') || line2.length < 63) return null
  const inclination = Number(line2.slice(8, 16))
  const rawEcc = line2.slice(26, 33).trim()
  const eccentricity = Number(`0.${rawEcc}`)
  const meanMotion = Number(line2.slice(52, 63))
  if (!Number.isFinite(inclination) || !Number.isFinite(eccentricity) || !Number.isFinite(meanMotion) || meanMotion <= 0) {
    return null
  }
  return { inclination, eccentricity, meanMotion }
}

export function orbitClass(meanMotionRevPerDay: number, eccentricity: number): OrbitClass {
  if (eccentricity >= 0.25) return 'HEO'
  if (meanMotionRevPerDay >= 0.9 && meanMotionRevPerDay <= 1.12 && eccentricity < 0.08) return 'GEO'
  if (meanMotionRevPerDay < 6) return 'MEO'
  return 'LEO'
}

export function keplerKm(meanMotionRevPerDay: number, eccentricity: number): { periodMin: number; perigeeKm: number; apogeeKm: number } {
  const periodMin = 1440 / meanMotionRevPerDay
  const n = (meanMotionRevPerDay * 2 * Math.PI) / 86400
  const axis = Math.cbrt(MU / (n * n))
  return {
    periodMin,
    perigeeKm: axis * (1 - eccentricity) - RE,
    apogeeKm: axis * (1 + eccentricity) - RE,
  }
}

/** International designator from TLE line 1, e.g. 98067A -> 1998-067A. */
export function designator(line1: string): string {
  const raw = line1.slice(9, 17).trim()
  if (!/^\d{5}[A-Z]{0,3}$/i.test(raw)) return ''
  const year = Number(raw.slice(0, 2))
  const full = year >= 57 ? 1900 + year : 2000 + year
  return `${full}-${raw.slice(2)}`
}

export type SatGroup = 'stations' | 'gnss' | 'weather' | 'science' | 'geo' | 'starlink' | 'active'

export function classifySat(name: string, line2: string): SatGroup {
  const text = name.toUpperCase()
  if (text.startsWith('STARLINK')) return 'starlink'
  if (/ISS|ZARYA|TIANHE|TIANGONG/.test(text)) return 'stations'
  if (/GPS|NAVSTAR|GALILEO|GLONASS|BEIDOU|QZSS|IRNSS/.test(text)) return 'gnss'
  if (/NOAA|GOES|METOP|HIMAWARI|FENGYUN|METEOR-M|SUOMI|JPSS|DMSP/.test(text)) return 'weather'
  if (/HST|HUBBLE|CHANDRA|FERMI|SWIFT|XMM|LANDSAT|SENTINEL|TESS|SWOT/.test(text)) return 'science'
  const motion = tleMotion(line2)
  if (motion && orbitClass(motion.meanMotion, motion.eccentricity) === 'GEO') return 'geo'
  return 'active'
}

/** Every member of the group. There is no stride cap. */
export function membersOf<T extends { group: SatGroup }>(rows: readonly T[], group: SatGroup): T[] {
  return rows.filter((row) => row.group === group)
}

export function viewerShape(name: string, group: SatGroup): string {
  const text = name.toUpperCase()
  if (/ISS|ZARYA|TIANHE|TIANGONG/.test(text)) return 'sat-station'
  if (/HST|HUBBLE/.test(text)) return 'sat-scope'
  if (group === 'starlink' || text.startsWith('STARLINK')) return 'sat-starlink'
  if (group === 'gnss') return 'sat-nav'
  if (group === 'weather') return 'sat-wx'
  if (group === 'science') return 'sat-science'
  if (/DEB|\bR\/B\b|ROCKET BODY/.test(text)) return 'sat-debris'
  if (group === 'geo') return 'sat-comms'
  return 'sat-comms'
}
