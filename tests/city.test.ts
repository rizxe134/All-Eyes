import { describe, expect, it } from 'vitest'
import { cameraNear, crtForZoom, MIN_RANGE_KM } from '../src/core/range'
import { basemapCredit, effectiveSource, parseBasemapMode, tileStack } from '../src/city/basemap'
import { buildingHeightM, cityQuery, parseOverpass } from '../src/city/overpass'
import { latToTileY, lonToTileX, tileBounds, tileFootprintCount, tilesForView, zoomForRange } from '../src/city/mercator'
import { MAX_BUILDINGS, MAX_OVERPASS_ELEMENTS, MAX_VEHICLES, allowRecover, createArmFlag, heapAction, keysToEvict, rendererAction, viewMoved } from '../src/city/budget'
import { simulateTraffic } from '../src/city/traffic'
import { localClock, parseAir, parseFiTrains, parseHereFlow, parseMbta, parseMeteo, parseNominatim, parseNominatimAll, parseTomTomFlow, weatherWord } from '../src/city/feeds'
import { evictTileCacheForTest, tileCacheBytes, tileCachePut } from '../src/city/cache'

describe('mercator tiles', () => {
  it('round-trips a point through its tile bounds', () => {
    const lat = 40.7484
    const lon = -73.9857
    const z = 12
    const x = Math.floor(lonToTileX(lon, z))
    const y = Math.floor(latToTileY(lat, z))
    const box = tileBounds(z, x, y)
    expect(lat).toBeGreaterThan(box.south)
    expect(lat).toBeLessThan(box.north)
    expect(lon).toBeGreaterThan(box.west)
    expect(lon).toBeLessThan(box.east)
  })

  it('picks a finer zoom as the camera drops toward the street', () => {
    const far = zoomForRange(800, 40.7)
    const city = zoomForRange(12, 40.7)
    const street = zoomForRange(0.45, 40.7)
    expect(city).toBeGreaterThan(far)
    expect(street).toBeGreaterThan(city)
    expect(street).toBeLessThanOrEqual(18)
    expect(city).toBeGreaterThanOrEqual(12)
    expect(city).toBeLessThanOrEqual(15)
  })

  it('covers the view with a capped tile set that includes the center', () => {
    const tiles = tilesForView(33.749, -84.388, 8, 12)
    expect(tiles.length).toBeGreaterThan(0)
    expect(tiles.length).toBeLessThanOrEqual(12)
    const z = tiles[0].z
    expect(tiles.every((tile) => tile.z === z)).toBe(true)
    const x = lonToTileX(-84.388, z)
    const y = latToTileY(33.749, z)
    expect(tiles.some((tile) => tile.x === Math.floor(x) && tile.y === Math.floor(y))).toBe(true)
  })

  it('steps zoom out instead of allocating the footprint at z=18', () => {
    const started = performance.now()
    for (let range = 1500; range >= 0.3; range *= 0.85) {
      const tiles = tilesForView(40.71, -74.01, range, 12)
      expect(tiles.length).toBeLessThanOrEqual(12)
      expect(tiles.length).toBeGreaterThan(0)
      expect(tiles[0].z).toBeLessThanOrEqual(zoomForRange(range, 40.71))
    }
    expect(performance.now() - started).toBeLessThan(80)
    const wide = tilesForView(40.71, -74.01, 900, 12)
    expect(wide[0].z).toBeLessThan(12)
    expect(tileFootprintCount(40.71, -74.01, 900, 18)).toBeGreaterThan(1_000_000)
    for (const [lat, lon] of [[40.71, -74.01], [35.68, 139.69], [51.51, -0.13]] as const) {
      const street = tilesForView(lat, lon, 0.4, 12)
      expect(street.length).toBeLessThanOrEqual(12)
      expect(street.length).toBeGreaterThan(0)
    }
  })
})

describe('basemap', () => {
  it('uses Esri imagery and an Esri label overlay for hybrid, with no key', () => {
    const stack = tileStack('hybrid', 'free', { maptiler: '', mapbox: '' }, 12, 10, 11)
    expect(stack.base).toContain('World_Imagery/MapServer/tile/12/11/10')
    expect(stack.overlay).toContain('World_Reference_Overlay')
    expect(basemapCredit('hybrid', 'free')).toContain('Esri')
    expect(parseBasemapMode('satellite')).toBe('sat')
  })

  it('keeps Mapbox off until that source is selected and a token is present', () => {
    expect(effectiveSource('mapbox', { maptiler: '', mapbox: '' })).toBe('free')
    const stack = tileStack('sat', 'mapbox', { maptiler: '', mapbox: 'pk.test-token' }, 3, 1, 2)
    expect(stack.base).toContain('api.mapbox.com')
    expect(stack.base).toContain('pk.test-token')
  })
})

describe('overpass and geocoder', () => {
  it('asks for roads at city scale and buildings only when closer', () => {
    const region = cityQuery(40.71, -74.01, 30)
    const street = cityQuery(40.71, -74.01, 1)
    expect(region).toContain('highway')
    expect(region).not.toContain('"building"')
    expect(street).toContain('"building"')
    expect(cityQuery(40.71, -74.01, 400)).toBeNull()
  })

  it('parses roads, heights, and POIs', () => {
    const parsed = parseOverpass({
      elements: [
        { type: 'way', id: 1, tags: { highway: 'primary' }, geometry: [{ lat: 1, lon: 2 }, { lat: 1.01, lon: 2.01 }] },
        { type: 'way', id: 2, tags: { building: 'yes', 'building:levels': '10' }, geometry: [{ lat: 1, lon: 2 }, { lat: 1.001, lon: 2 }, { lat: 1.001, lon: 2.001 }] },
        { type: 'way', id: 3, tags: { building: 'yes', height: '40 m' }, geometry: [{ lat: 1, lon: 2 }, { lat: 1.001, lon: 2 }, { lat: 1, lon: 2.001 }] },
        { type: 'node', id: 9, lat: 1.1, lon: 2.1, tags: { amenity: 'hospital', name: 'GENERAL' } },
      ],
    })
    expect(parsed.roads).toHaveLength(1)
    expect(parsed.buildings.map((row) => row.heightM)).toEqual([32, 40])
    expect(parsed.pois[0].name).toBe('GENERAL')
    expect(buildingHeightM({})).toBe(9)
    const flood = {
      elements: Array.from({ length: MAX_OVERPASS_ELEMENTS + 40 }, (_, index) => ({
        type: 'way',
        id: index + 1,
        tags: { building: 'yes', height: '20' },
        geometry: [{ lat: 1, lon: 2 }, { lat: 1.001, lon: 2 }, { lat: 1.001, lon: 2.001 }],
      })),
    }
    expect(parseOverpass(flood).buildings).toHaveLength(MAX_BUILDINGS)
  })

  it('parses a nominatim search and a reverse object', () => {
    expect(parseNominatim([{ lat: '33.75', lon: '-84.39', display_name: 'Atlanta, Georgia' }])).toMatchObject({
      lat: 33.75,
      lon: -84.39,
      label: 'Atlanta, Georgia',
    })
    const reverse = parseNominatimAll({
      lat: '40.7',
      lon: '-74.0',
      display_name: 'New York',
      extratags: { population: '8000000' },
    })
    expect(reverse[0].population).toBe('8000000')
    expect(parseNominatim({})).toBeNull()
  })
})

describe('traffic simulation', () => {
  const roads = [{
    id: 'road:1',
    cls: 'primary',
    points: [
      { lat: 33.75, lon: -84.39 },
      { lat: 33.76, lon: -84.39 },
      { lat: 33.77, lon: -84.38 },
    ],
  }]

  it('is deterministic and moves along the road', () => {
    const a = simulateTraffic(roads, [], 1_700_000_000_000, null)
    const b = simulateTraffic(roads, [], 1_700_000_000_000, null)
    expect(b).toEqual(a)
    expect(a.length).toBeGreaterThan(0)
    expect(a[0].color).toBe('#4da3ff')
    const later = simulateTraffic(roads, [], 1_700_000_060_000, null)
    const moved = later.some((row, index) => row.lat !== a[index]?.lat || row.lon !== a[index]?.lon)
    expect(moved).toBe(true)
  })

  it('recolours with a live speed ratio and keeps the palette without one', () => {
    const live = simulateTraffic(roads, [], 1_700_000_000_000, 0.3)
    expect(live.every((row) => row.color === '#ff4b4b')).toBe(true)
    const free = simulateTraffic(roads, [], 1_700_000_000_000, 0.9)
    expect(free[0].color).toBe('#3dd68c')
  })

  it('stops at the vehicle cap on a dense road set', () => {
    const many = Array.from({ length: 800 }, (_, index) => ({
      id: `road:${index}`,
      cls: 'motorway',
      points: [
        { lat: 40.7, lon: -74 },
        { lat: 40.71, lon: -74 },
      ],
    }))
    const rows = simulateTraffic(many, [], 1_700_000_000_000, null)
    expect(rows).toHaveLength(MAX_VEHICLES)
  })
})

describe('city feeds', () => {
  it('parses weather, air, and the optional flow ratios', () => {
    const meteo = parseMeteo({
      timezone: 'America/New_York',
      utc_offset_seconds: -14400,
      current: { temperature_2m: 21.2, weather_code: 3, wind_speed_10m: 12 },
      daily: { time: ['2026-10-11'], weather_code: [61], temperature_2m_max: [24], temperature_2m_min: [16] },
    })
    expect(meteo?.timezone).toBe('America/New_York')
    expect(weatherWord(meteo?.code ?? null)).toBe('OVERCAST')
    expect(localClock(Date.UTC(2026, 9, 11, 16, 0, 0), -14400)).toBe('12:00')
    expect(parseAir({ current: { us_aqi: 42, pm2_5: 8.2 } })).toEqual({ aqi: 42, pm25: 8.2 })
    expect(parseTomTomFlow({ flowSegmentData: { currentSpeed: 20, freeFlowSpeed: 40 } })).toBeCloseTo(0.5)
    expect(parseHereFlow({ results: [{ currentFlow: { jamFactor: 8 } }] })).toBeCloseTo(0.2)
  })

  it('parses MBTA vehicles and Finnish trains', () => {
    const mbta = parseMbta({
      data: [{ id: 'v1', attributes: { latitude: 42.35, longitude: -71.06, bearing: 90, label: '1950', current_status: 'IN_TRANSIT_TO' } }],
    })
    expect(mbta[0].label).toBe('MBTA 1950')
    const trains = parseFiTrains([{ trainNumber: 11, speed: 99, location: { coordinates: [24.9, 60.2] }, timestamp: '2026-10-11T19:00:00Z' }])
    expect(trains[0]).toMatchObject({ lat: 60.2, lon: 24.9, agency: 'DIGITRAFFIC' })
  })
})

describe('street zoom clip and crt', () => {
  it('keeps the wide near-plane formula and shrinks it only up close', () => {
    const radius = 100
    const farDist = radius + (180 / 6371) * radius
    expect(cameraNear(farDist, radius)).toBeCloseTo(Math.max(0.05, farDist - radius * 1.35), 6)
    const streetDist = radius + (MIN_RANGE_KM / 6371) * radius
    const near = cameraNear(streetDist, radius)
    expect(near).toBeLessThan(streetDist - radius)
    expect(near).toBeGreaterThan(0)
  })

  it('eases the CRT overlay as range falls, without changing the stored value', () => {
    expect(crtForZoom(0.4, 800)).toBeCloseTo(0.4)
    expect(crtForZoom(0.4, 0.4)).toBeLessThan(0.1)
    expect(crtForZoom(0.4, 0.4)).toBeGreaterThan(0)
  })
})

describe('tile cache cap', () => {
  it('drops the oldest blobs once the cap is crossed', async () => {
    const blob = new Blob([new Uint8Array(1000)])
    await tileCachePut('a', blob)
    await tileCachePut('b', blob)
    const before = tileCacheBytes()
    expect(before).toBeGreaterThanOrEqual(2000)
    evictTileCacheForTest(1000)
    expect(tileCacheBytes()).toBeLessThanOrEqual(1000)
  })
})

describe('city memory budgets', () => {
  it('evicts the oldest textures and keeps the ones on screen', () => {
    const entries = [
      { key: 'old', at: 1 },
      { key: 'mid', at: 2 },
      { key: 'shown', at: 3 },
      { key: 'new', at: 4 },
    ]
    expect(keysToEvict(entries, new Set(['shown']), 2)).toEqual(['old', 'mid'])
    expect(keysToEvict(entries, new Set(['old', 'mid', 'shown', 'new']), 2)).toEqual([])
  })

  it('sheds and reloads on heap and renderer RSS thresholds', () => {
    expect(heapAction(0, 0)).toBe('ok')
    expect(heapAction(400 * 1024 * 1024, 4 * 1024 * 1024 * 1024)).toBe('ok')
    expect(heapAction(450 * 1024 * 1024, 4 * 1024 * 1024 * 1024)).toBe('shed')
    expect(heapAction(950 * 1024 * 1024, 4 * 1024 * 1024 * 1024)).toBe('reload')
    expect(rendererAction(800_000)).toBe('ok')
    expect(rendererAction(1_200_000)).toBe('shed')
    expect(rendererAction(2_000_000)).toBe('reload')
    const first = allowRecover([], 1_000)
    expect(first.ok).toBe(true)
    const full = allowRecover([1_000, 1_100, 1_200], 1_300)
    expect(full.ok).toBe(false)
    expect(allowRecover([1_000, 1_100, 1_200], 1_000 + 120_000).ok).toBe(true)
  })

  it('ignores a still camera and refuses a second listener arm', () => {
    const here = { lat: 40.7, lon: -74, range: 12 }
    expect(viewMoved(here, { ...here })).toBe(false)
    expect(viewMoved(here, { ...here, range: 4 })).toBe(true)
    const flag = createArmFlag()
    expect(flag.arm()).toBe(true)
    expect(flag.arm()).toBe(false)
    flag.disarm()
    expect(flag.arm()).toBe(true)
  })
})
