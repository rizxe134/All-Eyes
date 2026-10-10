import { describe, expect, it } from 'vitest'
import { parseAdsb, parseOpenSky } from '../src/plugins/aircraft/parse'
import { parseQuakes } from '../src/plugins/earthquakes/parse'
import { parseTle } from '../src/plugins/satellites/parse'
import { buildSatrec, propagateGeodetic } from '../src/plugins/satellites/propagate'
import { parseAis } from '../src/plugins/ships/parse'
import { parseStorms } from '../src/plugins/storms/parse'
import { parseEonet, parseFirms } from '../src/plugins/events/parse'
import { parseLaunches } from '../src/plugins/launches/parse'
import { kpLabel, parseKp } from '../src/plugins/spaceweather/parse'

const ISS = `ISS (ZARYA)
1 25544U 98067A   26281.85354122  .00006592  00000+0  12863-3 0  9993
2 25544  51.6315  97.5838 0006777 239.2205 120.8116 15.48782232589376
`

describe('aircraft parsers', () => {
  it('reads OpenSky state vectors and skips empty positions', () => {
    const fixes = parseOpenSky({
      states: [
        ['abc123', 'UAL1    ', 'United States', 1, 1, -73.7, 40.6, 10000, false, 230, 90, 0, null, 10200],
        ['gone', 'X', 'Nowhere', 1, 1, null, null, 0, false, 0, 0],
      ],
    })
    expect(fixes).toHaveLength(1)
    expect(fixes[0]).toMatchObject({ icao: 'abc123', callsign: 'UAL1', lat: 40.6, lon: -73.7, onGround: false })
    expect(fixes[0]?.speedKt).toBeGreaterThan(400)
    expect(fixes[0]?.altM).toBe(10200)
  })

  it('reads ADS-B feet and ground flags', () => {
    const fixes = parseAdsb({
      ac: [
        { hex: 'ABCDEF', flight: 'BAW1   ', lat: 51.5, lon: -0.1, alt_baro: 35000, track: 180, gs: 450, t: 'B77W' },
        { hex: '000111', flight: 'PARKED', lat: 51.4, lon: -0.4, alt_baro: 'ground', gs: 0 },
      ],
    })
    expect(fixes[0]?.altM).toBeCloseTo(35000 * 0.3048, 1)
    expect(fixes[0]?.typeCode).toBe('B77W')
    expect(fixes[0]?.registration).toBe('')
    expect(fixes[1]?.onGround).toBe(true)
    expect(fixes[1]?.altM).toBe(0)
  })

  it('reads the aircraft array used by adsb.fi and does not cap the list', () => {
    const fixes = parseAdsb({
      aircraft: [
        { hex: 'abc111', flight: 'DAL1', lat: 33.64, lon: -84.43, alt_baro: 'ground', gs: 0 },
        { hex: 'abc222', flight: 'DAL2', lat: 33.7, lon: -84.5, alt_baro: 12000, gs: 280 },
      ],
    })
    expect(fixes).toHaveLength(2)
    expect(fixes[0]?.onGround).toBe(true)
    expect(fixes[1]?.onGround).toBe(false)
  })
})

describe('world feeds', () => {
  it('parses USGS geojson', () => {
    const quakes = parseQuakes({
      features: [
        {
          id: 'us1',
          properties: { mag: 5.4, place: '10km E of Test', time: 1_700_000_000_000 },
          geometry: { type: 'Point', coordinates: [140.1, 35.2, 12.5] },
        },
        { id: 'bad', properties: { mag: null }, geometry: { coordinates: [null, null] } },
      ],
    })
    expect(quakes).toEqual([
      { id: 'us1', mag: 5.4, place: '10km E of Test', time: 1_700_000_000_000, lat: 35.2, lon: 140.1, depthKm: 12.5 },
    ])
  })

  it('parses three-line elements and propagates ISS', () => {
    const sats = parseTle(ISS, 'stations')
    expect(sats).toHaveLength(1)
    expect(sats[0]).toMatchObject({ name: 'ISS (ZARYA)', norad: 25544, group: 'stations' })
    const rec = buildSatrec(sats[0]!)
    expect(rec).not.toBeNull()
    const point = propagateGeodetic(rec!, new Date('2026-10-09T03:00:00Z'))
    expect(point).not.toBeNull()
    expect(point!.lat).toBeGreaterThan(-90)
    expect(point!.lat).toBeLessThan(90)
    expect(point!.altKm).toBeGreaterThan(300)
    expect(point!.altKm).toBeLessThan(600)
  })

  it('parses Baltic AIS and treats heading 511 as missing', () => {
    const ships = parseAis({
      features: [
        {
          mmsi: 210884000,
          geometry: { type: 'Point', coordinates: [24.7, 59.4] },
          properties: { mmsi: 210884000, sog: 12.5, cog: 40, navStat: 0, heading: 511, timestampExternal: 10 },
        },
      ],
    })
    expect(ships[0]).toMatchObject({ mmsi: 210884000, lat: 59.4, lon: 24.7, heading: 40, sog: 12.5 })
  })

  it('parses NHC storms and EONET points', () => {
    expect(parseStorms({
      activeStorms: [{ id: 'al09', name: 'Isaias', classification: 'HU', intensity: '90', latitudeNumeric: 25.4, longitudeNumeric: -88.4, movementDir: 330, movementSpeed: 8 }],
    })[0]).toMatchObject({ name: 'Isaias', lat: 25.4, lon: -88.4 })

    const events = parseEonet({
      events: [{
        id: 'EONET_1',
        title: 'Wildfire',
        categories: [{ id: 'wildfires', title: 'Wildfires' }],
        geometry: [{ type: 'Point', date: '2026-10-08T00:00:00Z', coordinates: [-120.5, 36.2] }],
      }],
    })
    expect(events[0]).toMatchObject({ title: 'Wildfire', category: 'Wildfires', lat: 36.2, lon: -120.5 })
  })

  it('parses launches, firms rows, and kp index', () => {
    const launches = parseLaunches({
      results: [{ id: 'abc', name: 'Demo | Payload', net: '2026-10-09T19:00:00Z', status: { abbrev: 'Go' }, pad: { latitude: '28.5', longitude: '-80.5', name: 'SLC-40' } }],
    })
    expect(launches[0]).toMatchObject({ name: 'Demo | Payload', lat: 28.5, lon: -80.5, status: 'Go' })

    const fires = parseFirms('latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight\n36.2,-120.5,320,1,1,2026-10-08,1200,N,VIIRS,high,1,290,42.5,D\n')
    expect(fires[0]).toMatchObject({ lat: 36.2, lon: -120.5, frp: 42.5 })

    expect(parseKp([{ time_tag: '2026-10-09T00:00:00', Kp: 5.33 }])).toEqual({ time: '2026-10-09T00:00:00', kp: 5.33 })
    expect(kpLabel(5.33)).toBe('ACTIVE')
    expect(parseKp([['time_tag', 'Kp'], ['2026-10-09 00:00:00', '2.0']])).toMatchObject({ kp: 2 })
  })
})
