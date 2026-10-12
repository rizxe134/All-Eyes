import { describe, expect, it } from 'vitest'
import '../src/plugins/glyphs'
import { parseCoordinates } from '../src/search/coords'
import { coordinateHit } from '../src/search/geocode'
import { nominatimHits, parseMeteoGeo, parsePhoton } from '../src/search/parse'
import { rangeForCoordinate, rangeForScale, scaleFromTags } from '../src/search/zoom'
import { matchContacts } from '../src/search/suggest'
import { LEGEND_ROWS, spriteForLayer } from '../src/core/legend'
import { knownSprites, spriteRows } from '../src/core/sprites'
import { callsignMatch, parseFlightQuery } from '../src/plugins/aircraft/callsign'
import { routeLine } from '../src/plugins/aircraft/detail'
import { etaFromGroundSpeed, routeSpan } from '../src/plugins/aircraft/metrics'
import { viewerShape } from '../src/plugins/satellites/elements'
import { satSprite } from '../src/plugins/satellites/sprites'
import type { Contact } from '../src/core/types'

describe('coordinates and zoom', () => {
  it('reads decimal and DMS pairs', () => {
    const decimal = parseCoordinates('40.7580, -73.9855')
    expect(decimal).toMatchObject({ lat: 40.758, lon: -73.9855 })
    expect(parseCoordinates('40.7580 -73.9855')?.lon).toBeCloseTo(-73.9855, 3)
    expect(parseCoordinates('40.758N, 73.985W')).toMatchObject({ lat: 40.758, lon: -73.985 })
    const dms = parseCoordinates(`40°45'28.8"N 73°59'7.8"W`)
    expect(dms).not.toBeNull()
    expect(dms!.lat).toBeCloseTo(40.758, 2)
    expect(dms!.lon).toBeCloseTo(-73.9855, 2)
    expect(dms!.dms).toBe(true)
    expect(parseCoordinates('DL123')).toBeNull()
    expect(parseCoordinates('atlanta')).toBeNull()
  })

  it('picks a closer range for a street than a country', () => {
    expect(rangeForScale('street')).toBe(0.45)
    expect(rangeForScale('city')).toBe(12)
    expect(rangeForScale('country')).toBe(1800)
    expect(rangeForCoordinate(5, true)).toBe(0.45)
    expect(rangeForCoordinate(4, false)).toBe(0.45)
    expect(rangeForCoordinate(1, false)).toBe(12)
    expect(rangeForCoordinate(0, false)).toBe(80)
    expect(scaleFromTags({ kind: 'house', klass: 'building' })).toBe('street')
    expect(scaleFromTags({ kind: 'city', klass: 'place' })).toBe('city')
    expect(scaleFromTags({ kind: 'country' })).toBe('country')
    expect(scaleFromTags({ kind: 'aerodrome', klass: 'aeroway' })).toBe('airport')
    expect(scaleFromTags({ kind: 'postcode' })).toBe('landmark')
    expect(coordinateHit('33.7490, -84.3880')?.rangeKm).toBe(0.45)
    expect(coordinateHit('34, -84')?.rangeKm).toBe(80)
  })

  it('parses photon, nominatim, and open-meteo bodies', () => {
    const photon = parsePhoton({
      features: [{
        geometry: { coordinates: [-73.9855, 40.758] },
        properties: { name: 'Times Square', osm_key: 'tourism', osm_value: 'attraction', city: 'New York', country: 'United States' },
      }],
    })
    expect(photon[0]).toMatchObject({ lat: 40.758, lon: -73.9855, scale: 'landmark', source: 'photon' })
    const named = nominatimHits([{
      lat: '51.5',
      lon: '-0.12',
      display_name: 'London, United Kingdom',
      addresstype: 'city',
      class: 'place',
      type: 'city',
    }])
    expect(named[0]).toMatchObject({ scale: 'city', rangeKm: 12 })
    const country = nominatimHits([{ lat: '54', lon: '-2', display_name: 'United Kingdom', addresstype: 'country', class: 'boundary', type: 'administrative' }])
    expect(country[0]?.scale).toBe('country')
    expect(country[0]?.rangeKm).toBe(1800)
    const meteo = parseMeteoGeo({ results: [{ name: 'Paris', latitude: 48.85, longitude: 2.35, country: 'France', feature_code: 'PPLC' }] })
    expect(meteo[0]).toMatchObject({ scale: 'city', label: 'Paris, France' })
    expect(parsePhoton({})).toEqual([])
  })
})

describe('flight numbers and route math', () => {
  it('turns an IATA flight number into the ICAO callsign', () => {
    expect(parseFlightQuery('DL123').candidates).toContain('DAL123')
    expect(parseFlightQuery('AA 100').candidates).toContain('AAL100')
    expect(parseFlightQuery('UA2402').candidates).toContain('UAL2402')
    expect(parseFlightQuery('DAL123').kind).toBe('icao')
    expect(parseFlightQuery('BAW3ZL').candidates[0]).toBe('BAW3ZL')
    expect(parseFlightQuery('N12345').kind).toBe('reg')
    expect(parseFlightQuery('a1b2c3').kind).toBe('hex')
  })

  it('matches a live callsign, registration, or hex', () => {
    const query = parseFlightQuery('DL123')
    expect(callsignMatch('DAL123', '', 'abc123', query)).toBe(true)
    expect(callsignMatch('AAL100', '', 'abc123', query)).toBe(false)
    expect(callsignMatch('', 'N12345', 'abc123', parseFlightQuery('N12345'))).toBe(true)
    expect(callsignMatch('DAL1', '', 'a1b2c3', parseFlightQuery('a1b2c3'))).toBe(true)
    const hits = matchContacts('DL123', [
      contact('air:abc123', 'air', 'DAL123', 'DAL123'),
      contact('ship:123456789', 'ship', 'EVER GIVEN', ''),
      contact('sat:25544', 'sat', 'ISS', ''),
    ])
    expect(hits.some((hit) => hit.contactId === 'air:abc123')).toBe(true)
    expect(matchContacts('25544', [contact('sat:25544', 'sat', 'ISS', '')])[0]?.group).toBe('Satellites')
    expect(matchContacts('123456789', [contact('ship:123456789', 'ship', 'EVER GIVEN', '')])[0]?.group).toBe('Ships')
  })

  it('computes progress, remaining distance, and an EST from ground speed', () => {
    const span = routeSpan(40.64, -73.78, 39.1, -95, 33.94, -118.41)
    expect(span.progress).toBeGreaterThan(0.2)
    expect(span.progress).toBeLessThan(0.6)
    expect(span.flownKm).toBeGreaterThan(100)
    expect(span.remainKm).toBeGreaterThan(span.flownKm)
    const eta = etaFromGroundSpeed(1852, 500, Date.UTC(2026, 0, 1, 12, 0, 0))
    expect(eta).toBe('14:00Z')
    expect(etaFromGroundSpeed(1852, null)).toBeNull()
    expect(etaFromGroundSpeed(1852, 10)).toBeNull()
    const line = routeLine(39, -95, {
      type: '',
      typeName: '',
      registration: '',
      operator: '',
      origin: 'JFK',
      destination: 'LAX',
    })
    expect(line).not.toBeNull()
    expect(line![0]!.lat).toBeCloseTo(40.64, 2)
    expect(line![0]!.lon).toBeCloseTo(-73.78, 2)
    expect(line![line!.length - 1]!.lat).toBeCloseTo(33.94, 2)
    expect(line![line!.length - 1]!.lon).toBeCloseTo(-118.41, 2)
    expect(line!.some((point) => Math.abs(point.lat - 39) < 0.2)).toBe(true)
  })
})

describe('legend sprites', () => {
  it('uses the same sprite ids the globe draws', () => {
    expect(spriteForLayer('aircraft')).toBe('air-a320')
    expect(spriteForLayer('airground')).toBe('air-gnd')
    expect(spriteForLayer('starlink')).toBe(viewerShape('STARLINK-1007', 'starlink'))
    expect(spriteForLayer('starlink')).toBe(satSprite('STARLINK-1007', 'starlink'))
    expect(spriteForLayer('ships')).toBe('ship-cargo')
    expect(spriteForLayer('quakes')).toBe('ico-quake')
    expect(spriteForLayer('storms')).toBe('ico-storm')
    expect(spriteForLayer('weather')).toBe('ico-wx')
    expect(spriteForLayer('launches')).toBe('ico-launch')
    expect(spriteForLayer('traffic')).toBe('city-car')
    expect(spriteForLayer('buildings')).toBe('city-building')
    expect(spriteForLayer('roads')).toBe('city-road')
    expect(spriteForLayer('transit')).toBe('chevron')
    expect(spriteForLayer('poi')).toBe('drop')
    const known = new Set(knownSprites())
    for (const row of LEGEND_ROWS) {
      if (row.kind !== 'icon') continue
      expect(known.has(row.sprite), row.sprite).toBe(true)
      expect(spriteRows(row.sprite).some((line) => line.includes('#'))).toBe(true)
      expect(row.sprite).toBe(spriteForLayer(row.id))
    }
    expect(spriteRows('air-a320')).toHaveLength(56)
    expect(spriteRows('air-gnd')).toHaveLength(56)
    expect(spriteRows('sat-starlink')).toHaveLength(56)
    expect(LEGEND_ROWS.some((row) => row.kind === 'line' && row.id === 'route' && row.dashed)).toBe(true)
    expect(LEGEND_ROWS.some((row) => row.id === 'track')).toBe(true)
    expect(LEGEND_ROWS.some((row) => row.id === 'select')).toBe(true)
  })
})

function contact(id: string, kind: Contact['kind'], label: string, callsign: string): Contact {
  return {
    id,
    layerId: kind === 'air' ? 'aircraft' : kind === 'ship' ? 'ships' : 'stations',
    kind,
    lat: 1,
    lon: 2,
    altKm: 0,
    heading: 0,
    label,
    detail: label,
    brightness: 1,
    shape: 'dot',
    scale: 1,
    callsign,
  }
}
