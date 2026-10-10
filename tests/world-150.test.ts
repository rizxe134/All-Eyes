import { describe, expect, it } from 'vitest'
import { buildSatrec, propagateGeodetic, speedKmS } from '../src/plugins/satellites/propagate'
import { classifySat, designator, keplerKm, membersOf, orbitClass, tleMotion } from '../src/plugins/satellites/elements'
import { parseSatcat } from '../src/plugins/satellites/satcat'
import { parseNasa } from '../src/plugins/satellites/photo'
import { flagFromMmsi } from '../src/plugins/ships/mmsi'
import { boxArea, shipCoverageLimit, shipStatusLine, shipTiles } from '../src/plugins/ships/feed'
import { parseAisStream, parseOpenWaters } from '../src/plugins/ships/parse'
import { parseCommons } from '../src/plugins/ships/photo'
import { mergeShips } from '../src/plugins/ships/retain'
import { chooseHit, hitRadiusPx } from '../src/core/pick'

const ISS_1 = '1 25544U 98067A   26282.95044904  .00006711  00000+0  13074-3 0  9997'
const ISS_2 = '2 25544  51.6315  92.1575 0006672 244.0714 115.9587 15.48795780589546'

describe('picking', () => {
  it('uses a generous hit radius and a larger one for coarse pointers', () => {
    expect(hitRadiusPx(false)).toBeGreaterThanOrEqual(12)
    expect(hitRadiusPx(false)).toBeLessThanOrEqual(16)
    expect(hitRadiusPx(true)).toBeGreaterThan(hitRadiusPx(false))
  })

  it('breaks a near tie toward the higher priority contact', () => {
    const ship = { id: 'ship', d: 2, priority: 1 }
    const air = { id: 'air', d: 5, priority: 0 }
    expect(chooseHit([ship, air], '', -1)?.item.id).toBe('air')
  })

  it('still picks the nearest contact when they are not overlapping', () => {
    const far = { id: 'far', d: 13, priority: 0 }
    const near = { id: 'near', d: 2, priority: 6 }
    expect(chooseHit([far, near], '', -1)?.item.id).toBe('near')
  })
})

describe('ships', () => {
  it('reads a flag from the MMSI maritime identification digits', () => {
    expect(flagFromMmsi(230123456)).toBe('FI')
    expect(flagFromMmsi(366123456)).toBe('US')
    expect(flagFromMmsi(244190192)).toBe('NL')
    expect(flagFromMmsi(636012345)).toBe('LR')
    expect(flagFromMmsi(12)).toBe('')
  })

  it('merges by MMSI and keeps a contact through an empty poll', () => {
    const now = 1_000_000
    const first = mergeShips([], [{ mmsi: 244, lat: 51, lon: 4, sog: 1, cog: 10, heading: 10, navStat: 0, time: now, seen: now }], now)
    const moved = mergeShips(first, [{ mmsi: 244, lat: 52, lon: 4, sog: 2, cog: 20, heading: 20, navStat: 0, time: now, seen: now + 1000 }], now + 1000)
    expect(moved).toHaveLength(1)
    expect(moved[0]?.lat).toBe(52)
    const kept = mergeShips(moved, [], now + 2000)
    expect(kept.map((ship) => ship.mmsi)).toEqual([244])
    const gone = mergeShips(moved, null, now + 200_000)
    expect(gone).toHaveLength(0)
  })

  it('parses an Open Waters box without dropping vessels', () => {
    const page = parseOpenWaters({
      type: 'FeatureCollection',
      truncated: true,
      features: [
        { type: 'Feature', geometry: { type: 'Point', coordinates: [4.1, 51.9] }, properties: { mmsi: 244000001, name: 'ONE', type: 70, sog: 5, kind: 'vessel' } },
        { type: 'Feature', geometry: { type: 'Point', coordinates: [4.2, 51.8] }, properties: { mmsi: 244000002, name: 'TWO', type: 80, sog: 0, kind: 'vessel' } },
        { type: 'Feature', geometry: { type: 'Point', coordinates: [4.3, 51.7] }, properties: { mmsi: 970000001, kind: 'aton' } },
      ],
    })
    expect(page.ships).toHaveLength(2)
    expect(page.truncated).toBe(true)
    expect(page.meta[0]?.name).toBe('ONE')
  })

  it('reads an AISStream position', () => {
    const update = parseAisStream({
      MessageType: 'PositionReport',
      MetaData: { MMSI: 244000001, ShipName: 'ONE' },
      Message: { PositionReport: { Latitude: 51.9, Longitude: 4.1, Sog: 8, Cog: 90, TrueHeading: 90, NavigationalStatus: 0 } },
    })
    expect(update.fix?.mmsi).toBe(244000001)
    expect(update.fix?.sog).toBe(8)
    expect(update.meta?.name).toBe('ONE')
  })

  it('tiles the view under the anonymous area cap and names a coverage gap', () => {
    const tiles = shipTiles(51.9, 4.1, 80)
    expect(tiles.length).toBeGreaterThan(0)
    for (const tile of tiles) expect(boxArea(tile)).toBeLessThanOrEqual(100)
    expect(shipCoverageLimit(0, true, true, 0, false)).toBe(true)
    expect(shipCoverageLimit(4, true, true, 0, false)).toBe(false)
    expect(shipStatusLine(10, 0, [{ id: 'OPENWATERS', state: 'OK' }], true)).toContain('FEED COVERAGE LIMIT')
  })
})

describe('satellites', () => {
  it('derives orbit class and designator from the TLE', () => {
    const motion = tleMotion(ISS_2)
    expect(motion).toBeTruthy()
    expect(orbitClass(motion!.meanMotion, motion!.eccentricity)).toBe('LEO')
    expect(orbitClass(1.0027, 0.0002)).toBe('GEO')
    expect(orbitClass(2.0, 0.7)).toBe('HEO')
    const kepler = keplerKm(motion!.meanMotion, motion!.eccentricity)
    expect(kepler.periodMin).toBeGreaterThan(90)
    expect(kepler.periodMin).toBeLessThan(96)
    expect(kepler.perigeeKm).toBeGreaterThan(390)
    expect(kepler.apogeeKm).toBeLessThan(470)
    expect(designator(ISS_1)).toBe('1998-067A')
    expect(classifySat('ISS (ZARYA)', ISS_2)).toBe('stations')
    expect(classifySat('STARLINK-100', ISS_2)).toBe('starlink')
  })

  it('propagates the ISS TLE into a low orbit', () => {
    const satrec = buildSatrec({ name: 'ISS (ZARYA)', norad: 25544, line1: ISS_1, line2: ISS_2, group: 'stations' })
    expect(satrec).toBeTruthy()
    const point = propagateGeodetic(satrec!, new Date('2026-10-09T22:48:38Z'))
    expect(point).toBeTruthy()
    expect(point!.lat).toBeGreaterThan(-90)
    expect(point!.lat).toBeLessThan(90)
    expect(point!.altKm).toBeGreaterThan(300)
    expect(point!.altKm).toBeLessThan(600)
    const speed = speedKmS(satrec!, new Date('2026-10-09T22:48:38Z'))
    expect(speed).toBeGreaterThan(7)
    expect(speed).toBeLessThan(8)
  })

  it('does not cap a catalog group', () => {
    const rows = Array.from({ length: 4000 }, (_, index) => ({ group: 'active' as const, id: index }))
    expect(membersOf(rows, 'active')).toHaveLength(4000)
    expect(membersOf(rows, 'starlink')).toHaveLength(0)
  })

  it('reads SATCAT and refuses an unrelated NASA image', () => {
    const record = parseSatcat([{ OBJECT_NAME: 'ISS (ZARYA)', OBJECT_ID: '1998-067A', OBJECT_TYPE: 'PAY', OWNER: 'ISS', LAUNCH_DATE: '1998-11-20' }])
    expect(record?.objectType).toBe('PAYLOAD')
    expect(record?.launch).toBe('1998-11-20')
    expect(parseNasa({ collection: { items: [{ data: [{ title: 'A random nebula' }], links: [{ href: 'https://images.example/a.jpg' }] }] } }, 'Hubble')).toBeNull()
    const photo = parseNasa({
      collection: {
        items: [
          { data: [{ title: 'Hubble training mockup' }], links: [{ href: 'https://images.example/h.jpg' }] },
          { data: [{ title: 'Hubble Space Telescope' }], links: [{ href: 'https://images.example/page' }, { href: 'https://images.example/h~medium.jpg' }] },
        ],
      },
    }, 'Hubble')
    expect(photo?.url).toBe('https://images.example/h~medium.jpg')
    expect(photo?.credit).toContain('NASA')
  })

  it('keeps a Commons photo only when the file title names the vessel', () => {
    const payload = {
      query: {
        pages: {
          a: { title: 'File:Generic cargo ship.jpg', imageinfo: [{ thumburl: 'https://upload.example/generic.jpg', descriptionurl: 'https://commons.example/generic' }] },
          b: { title: 'File:9529243 UAL Africa 2011.jpg', imageinfo: [{ thumburl: 'https://upload.example/ual.jpg', descriptionurl: 'https://commons.example/ual', extmetadata: { Artist: { value: 'Example' } } }] },
        },
      },
    }
    expect(parseCommons(payload, { name: 'UAL AFRICA', imo: '9529243' })?.url).toBe('https://upload.example/ual.jpg')
    expect(parseCommons(payload, { name: 'NOT A SHIP' })).toBeNull()
    expect(parseCommons({
      query: { pages: { c: { title: 'File:Freya the cat.jpg', imageinfo: [{ thumburl: 'https://upload.example/cat.jpg' }] } } },
    }, { name: 'FREYA' })).toBeNull()
  })
})
