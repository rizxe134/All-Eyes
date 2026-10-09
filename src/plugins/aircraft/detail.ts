import { formatSpeed, type SpeedUnit } from '../../core/cards'
import { greatCircle } from '../../core/geo'
import type { AirMeta } from './lookup'
import {
  NA,
  categoryLabel,
  countryFromHex,
  countryFromReg,
  estimateAirspeeds,
  flightLevel,
  routeProgress,
  trackCompass,
} from './metrics'
import type { AirFix } from './parse'
import { classifyAir } from './types'

export interface FlightRow {
  k: string
  v: string
}

export interface FlightView {
  callsign: string
  typeCode: string
  typeName: string
  operator: string
  originCode: string
  originCity: string
  destCode: string
  destCity: string
  progress: number | null
  rows: FlightRow[]
  photoUrl: string
  photoLink: string
  photoCredit: string
}

const AIRPORTS: Record<string, { city: string; lat: number; lon: number }> = {
  JFK: { city: 'New York', lat: 40.64, lon: -73.78 },
  EWR: { city: 'Newark', lat: 40.69, lon: -74.17 },
  LGA: { city: 'New York', lat: 40.77, lon: -73.87 },
  BOS: { city: 'Boston', lat: 42.36, lon: -71.01 },
  DCA: { city: 'Washington', lat: 38.85, lon: -77.04 },
  IAD: { city: 'Washington', lat: 38.95, lon: -77.46 },
  ATL: { city: 'Atlanta', lat: 33.64, lon: -84.43 },
  MIA: { city: 'Miami', lat: 25.8, lon: -80.29 },
  MCO: { city: 'Orlando', lat: 28.43, lon: -81.31 },
  ORD: { city: 'Chicago', lat: 41.97, lon: -87.91 },
  DFW: { city: 'Dallas', lat: 32.9, lon: -97.04 },
  DEN: { city: 'Denver', lat: 39.86, lon: -104.67 },
  LAX: { city: 'Los Angeles', lat: 33.94, lon: -118.41 },
  SFO: { city: 'San Francisco', lat: 37.62, lon: -122.38 },
  SEA: { city: 'Seattle', lat: 47.45, lon: -122.31 },
  LHR: { city: 'London', lat: 51.47, lon: -0.45 },
  LGW: { city: 'London', lat: 51.15, lon: -0.19 },
  CDG: { city: 'Paris', lat: 49.01, lon: 2.55 },
  AMS: { city: 'Amsterdam', lat: 52.31, lon: 4.76 },
  FRA: { city: 'Frankfurt', lat: 50.04, lon: 8.56 },
  IST: { city: 'Istanbul', lat: 41.28, lon: 28.74 },
  DXB: { city: 'Dubai', lat: 25.25, lon: 55.36 },
  SIN: { city: 'Singapore', lat: 1.36, lon: 103.99 },
  HND: { city: 'Tokyo', lat: 35.55, lon: 139.78 },
  NRT: { city: 'Tokyo', lat: 35.76, lon: 140.39 },
  SYD: { city: 'Sydney', lat: -33.95, lon: 151.18 },
  GRU: { city: 'Sao Paulo', lat: -23.44, lon: -46.47 },
}

function airport(code: string, city?: string, lat?: number, lon?: number) {
  const known = AIRPORTS[code]
  return {
    code,
    city: city || known?.city || '',
    lat: lat ?? known?.lat,
    lon: lon ?? known?.lon,
  }
}

function speedText(knots: number | null, unit: SpeedUnit, est: boolean): string {
  if (knots == null || !Number.isFinite(knots)) return NA
  const text = formatSpeed(knots, unit)
  return est ? `${text} EST` : text
}

export function formatFlight(fix: AirFix, meta: AirMeta | undefined, unit: SpeedUnit, now = Date.now()): FlightView {
  const code = (meta?.type || fix.typeCode || '').toUpperCase()
  const glyph = classifyAir(code)
  const typeName = meta?.typeName || fix.desc || glyph.name
  const origin = airport(meta?.origin || '', meta?.originCity, meta?.originLat, meta?.originLon)
  const dest = airport(meta?.destination || '', meta?.destCity, meta?.destLat, meta?.destLon)
  const progress = origin.lat != null && origin.lon != null && dest.lat != null && dest.lon != null
    ? routeProgress(origin.lat, origin.lon, fix.lat, fix.lon, dest.lat, dest.lon)
    : null
  const baro = fix.altBaroFt
  const gps = fix.altGpsFt
  const est = estimateAirspeeds(fix.speedKt, baro ?? gps ?? 0)
  const country = meta?.country || countryFromHex(fix.icao) || countryFromReg(meta?.registration || fix.registration) || NA
  const seen = fix.seenMs ? `${Math.max(0, Math.round((now - fix.seenMs) / 1000))}S` : NA
  const rows: FlightRow[] = [
    { k: 'AIRCRAFT TYPE', v: code ? `${typeName} (${code})` : typeName || NA },
    { k: 'REGISTRATION', v: meta?.registration || fix.registration || NA },
    { k: 'COUNTRY OF REG.', v: country },
    { k: 'SERIAL NUMBER', v: NA },
    { k: 'AGE', v: NA },
    { k: 'AIRCRAFT CATEGORY', v: categoryLabel(glyph.family) },
    { k: 'BAROMETRIC ALT.', v: baro == null ? NA : `${Math.round(baro)} FT  ${flightLevel(baro)}` },
    { k: 'GPS ALTITUDE', v: gps == null ? NA : `${Math.round(gps)} FT` },
    { k: 'VERTICAL SPEED', v: `${Math.round(fix.vertFpm)} FPM` },
    { k: 'TRACK', v: `${Math.round(fix.track)}° ${trackCompass(fix.track)}` },
    { k: 'GROUND SPEED', v: speedText(fix.speedKt, unit, false) },
    { k: 'TRUE AIRSPEED', v: speedText(fix.tasKt ?? est.tasKt, unit, fix.tasKt == null) },
    { k: 'INDICATED AIRSPEED', v: speedText(fix.iasKt ?? est.iasKt, unit, fix.iasKt == null) },
    { k: 'MACH', v: fix.mach != null ? fix.mach.toFixed(2) : `${est.mach.toFixed(2)} EST` },
    { k: 'SQUAWK', v: fix.squawk || NA },
    { k: 'POSITION', v: `${fix.lat.toFixed(3)} ${fix.lon.toFixed(3)}` },
    { k: 'LAST SEEN', v: seen },
  ]
  return {
    callsign: fix.callsign || meta?.registration || fix.icao.toUpperCase(),
    typeCode: code || '----',
    typeName,
    operator: meta?.operator || NA,
    originCode: origin.code || NA,
    originCity: origin.city || NA,
    destCode: dest.code || NA,
    destCity: dest.city || NA,
    progress,
    rows,
    photoUrl: meta?.photoUrl || '',
    photoLink: meta?.photoLink || '',
    photoCredit: meta?.photoCredit || '',
  }
}

export function routeAhead(
  lat: number,
  lon: number,
  meta: AirMeta | undefined,
): { lat: number; lon: number }[] | null {
  if (!meta?.destination) return null
  const dest = airport(meta.destination, meta.destCity, meta.destLat, meta.destLon)
  if (dest.lat == null || dest.lon == null) return null
  return greatCircle(lat, lon, dest.lat, dest.lon, 28)
}

export function flightText(view: FlightView): string {
  const lines = [
    view.callsign,
    view.typeCode,
    view.operator,
    `${view.originCode} ${view.originCity} -> ${view.destCode} ${view.destCity}`,
    ...view.rows.map((row) => `${row.k}: ${row.v}`),
  ]
  return lines.join('\n')
}
