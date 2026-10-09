import { describe, expect, it } from 'vitest'
import { formatFlight, routeAhead } from '../src/plugins/aircraft/detail'
import { mergeAirMeta, parseAdsbRoute, parseSpotters } from '../src/plugins/aircraft/lookup'
import {
  categoryLabel,
  countryFromHex,
  countryFromReg,
  estimateAirspeeds,
  flightLevel,
  routeProgress,
  trackCompass,
} from '../src/plugins/aircraft/metrics'
import type { AirFix } from '../src/plugins/aircraft/parse'

function fix(partial: Partial<AirFix> = {}): AirFix {
  return {
    icao: '4bb2ad',
    callsign: 'THY123',
    country: '',
    lat: 41,
    lon: 29,
    altM: 10668,
    track: 223,
    speedKt: 450,
    onGround: false,
    typeCode: 'A321',
    registration: 'TC-LUM',
    squawk: '1234',
    vertFpm: 0,
    seenMs: 1_000,
    desc: '',
    altBaroFt: 35000,
    altGpsFt: 35120,
    tasKt: null,
    iasKt: null,
    mach: null,
    ...partial,
  }
}

describe('flight panel formatters', () => {
  it('pads flight level and names a 16-point track', () => {
    expect(flightLevel(35000)).toBe('FL350')
    expect(flightLevel(500)).toBe('FL005')
    expect(trackCompass(223)).toBe('SW')
    expect(trackCompass(0)).toBe('N')
    expect(trackCompass(359)).toBe('N')
  })

  it('reads country from the ICAO24 block and the registration prefix', () => {
    expect(countryFromHex('4bb2ad')).toBe('Turkey')
    expect(countryFromHex('a1b2c3')).toBe('United States')
    expect(countryFromHex('400abc')).toBe('United Kingdom')
    expect(countryFromHex('zzzzzz')).toBe('')
    expect(countryFromReg('TC-LUM')).toBe('Turkey')
    expect(countryFromReg('N12345')).toBe('United States')
    expect(countryFromReg('G-EZWA')).toBe('United Kingdom')
  })

  it('estimates mach from ground speed and labels the gap', () => {
    const sea = estimateAirspeeds(450, 0)
    const high = estimateAirspeeds(450, 35000)
    expect(sea.tasKt).toBe(450)
    expect(sea.mach).toBeGreaterThan(0.65)
    expect(sea.mach).toBeLessThan(0.72)
    expect(high.mach).toBeGreaterThan(sea.mach)
    expect(high.iasKt).toBeLessThan(450)
    expect(categoryLabel('Business jet')).toBe('Business jet')
    expect(categoryLabel('four-engine wide')).toBe('Widebody')
    expect(categoryLabel('narrowbody')).toBe('Narrowbody')
  })

  it('places progress between origin and destination', () => {
    const mid = routeProgress(40.64, -73.78, 37.62, -97, 33.94, -118.41)
    expect(mid).not.toBeNull()
    expect(mid!).toBeGreaterThan(0.35)
    expect(mid!).toBeLessThan(0.7)
  })

  it('keeps serial and age unavailable and marks estimated airspeed', () => {
    const view = formatFlight(fix(), { type: 'C700', typeName: 'Cessna Citation Longitude', registration: 'N1CE', operator: 'Example Air', origin: 'JFK', destination: 'LAX' }, 'kt', 16_000)
    const row = (key: string) => view.rows.find((item) => item.k === key)?.v
    expect(view.callsign).toBe('THY123')
    expect(view.typeCode).toBe('C700')
    expect(row('AIRCRAFT TYPE')).toContain('Cessna Citation Longitude')
    expect(row('SERIAL NUMBER')).toBe('NOT AVAILABLE')
    expect(row('AGE')).toBe('NOT AVAILABLE')
    expect(row('COUNTRY OF REG.')).toBe('Turkey')
    expect(row('BAROMETRIC ALT.')).toBe('35000 FT  FL350')
    expect(row('TRACK')).toBe('223° SW')
    expect(row('TRUE AIRSPEED')).toContain('EST')
    expect(row('MACH')).toContain('EST')
    expect(row('LAST SEEN')).toBe('15S')
    expect(view.originCode).toBe('JFK')
    expect(view.originCity).toBe('New York')
    expect(view.destCity).toBe('Los Angeles')
  })

  it('uses a measured mach number without an EST tag', () => {
    const view = formatFlight(fix({ mach: 0.78, tasKt: 460, iasKt: 280 }), undefined, 'kt')
    const row = (key: string) => view.rows.find((item) => item.k === key)?.v
    expect(row('MACH')).toBe('0.78')
    expect(row('TRUE AIRSPEED')).toBe('460 KT')
    expect(row('INDICATED AIRSPEED')).toBe('280 KT')
  })

  it('parses a callsign route and a planespotters photo without inventing fields', () => {
    const route = parseAdsbRoute({
      response: {
        flightroute: {
          airline: { name: 'United Airlines' },
          origin: { iata_code: 'SFO', municipality: 'San Francisco', latitude: 37.62, longitude: -122.38 },
          destination: { iata_code: 'SIN', municipality: 'Singapore', latitude: 1.35, longitude: 103.99 },
        },
      },
    })
    expect(route).toMatchObject({ operator: 'United Airlines', origin: 'SFO', destination: 'SIN', originCity: 'San Francisco' })
    expect(parseAdsbRoute({ response: {} })).toBeNull()
    const photo = parseSpotters({
      photos: [{ thumbnail_large: { src: 'https://example.test/p.jpg' }, link: 'https://example.test/page', photographer: 'A Spotter' }],
    })
    expect(photo).toMatchObject({
      photoUrl: 'https://example.test/p.jpg',
      photoCredit: 'A Spotter / PlaneSpotters.net',
    })
    expect(parseSpotters({ photos: [] })).toBeNull()
    const merged = mergeAirMeta(
      { type: 'A321', typeName: 'Airbus A321', registration: 'TC-LUM', operator: 'Turkish Airlines', origin: '', destination: '', photoUrl: 'https://example.test/p.jpg', photoCredit: 'A Spotter / PlaneSpotters.net' },
      { photoUrl: 'https://airport.test/x.jpg', photoCredit: 'airport-data.com', origin: 'IST', operator: 'Other' },
    )
    expect(merged.photoUrl).toBe('https://example.test/p.jpg')
    expect(merged.operator).toBe('Turkish Airlines')
    expect(merged.origin).toBe('IST')
    const ahead = routeAhead(40, -74, { type: '', typeName: '', registration: '', operator: '', origin: 'JFK', destination: 'LAX' })
    expect(ahead?.length).toBeGreaterThan(2)
    expect(routeAhead(40, -74, undefined)).toBeNull()
  })
})
