/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it } from 'vitest'
import { execute } from '../src/core/command'
import { dockLayout } from '../src/ui/layout'
import { LAYER_COLORS, MONO_HEX, applyPalette, layerHex, parseHex } from '../src/core/palette'
import { PluginRegistry } from '../src/core/registry'
import { SettingsStore } from '../src/core/settings'
import { distanceKm, dueTiles, sweepProgress, worldSweepTiles } from '../src/plugins/aircraft/feed'
import type { AirFix } from '../src/plugins/aircraft/parse'
import { FAR_STALE_MS, mergeHeldAged } from '../src/plugins/aircraft/retain'
import { systemPlugin } from '../src/plugins/system/plugin'
import type { CommandContext } from '../src/core/types'

const NM_KM = 1.852

function fix(icao: string): AirFix {
  return {
    icao,
    callsign: icao.toUpperCase(),
    country: '',
    lat: 40,
    lon: -70,
    altM: 10000,
    track: 90,
    speedKt: 450,
    onGround: false,
    typeCode: '',
    registration: '',
    squawk: '',
    vertFpm: 0,
    seenMs: 0,
    desc: '',
    altBaroFt: null,
    altGpsFt: null,
    tasKt: null,
    iasKt: null,
    mach: null,
  }
}

describe('marker palette', () => {
  afterEach(() => applyPalette('color', {}))

  it('gives each category its own colour and restores phosphor', () => {
    applyPalette('color', {})
    expect(layerHex('aircraft')).toBe('#4da3ff')
    expect(layerHex('airground')).toBe('#ffb020')
    expect(layerHex('starlink')).toBe('#c9a6ff')
    expect(layerHex('ships')).toBe('#2ee0c0')
    expect(layerHex('quakes')).toBe('#ff4b4b')
    expect(layerHex('aircraft')).not.toBe(layerHex('ships'))
    expect(Object.keys(LAYER_COLORS).length).toBeGreaterThanOrEqual(10)
    applyPalette('mono', { aircraft: '#112233' })
    expect(layerHex('aircraft')).toBe(MONO_HEX)
    expect(layerHex('starlink')).toBe(MONO_HEX)
  })

  it('accepts a per-layer override and rejects a bad hex', () => {
    expect(parseHex('#AABBCC')).toBe('#aabbcc')
    expect(parseHex('red')).toBeNull()
    applyPalette('color', { ships: '#123456', quakes: 'nope' })
    expect(layerHex('ships')).toBe('#123456')
    expect(layerHex('quakes')).toBe('#ff4b4b')
  })
})

describe('worldwide aircraft sweep', () => {
  it('covers North America, Europe, Asia, and the ocean tracks inside 250 nm', () => {
    const tiles = worldSweepTiles()
    expect(tiles.length).toBeGreaterThan(900)
    const spots: Array<[number, number]> = [
      [40.7, -74],
      [51.5, -0.1],
      [35.7, 139.7],
      [1.3, 103.8],
      [30, -40],
      [20, -160],
      [-33.9, 151.2],
    ]
    for (const [lat, lon] of spots) {
      let best = Infinity
      for (const tile of tiles) best = Math.min(best, distanceKm(lat, lon, tile.lat, tile.lon))
      expect(best).toBeLessThanOrEqual(250 * NM_KM)
    }
  })

  it('keeps a far contact past 90 seconds and drops it after the far window', () => {
    const now = 1_000_000
    const previous = new Map([['abc123', { fix: fix('abc123'), updatedAt: now - 120_000 }]])
    expect(mergeHeldAged(previous, null, now, () => FAR_STALE_MS).has('abc123')).toBe(true)
    expect(mergeHeldAged(previous, null, now, () => 90_000).has('abc123')).toBe(false)
    const ancient = new Map([['abc123', { fix: fix('abc123'), updatedAt: now - FAR_STALE_MS - 1 }]])
    expect(mergeHeldAged(ancient, null, now, () => FAR_STALE_MS).has('abc123')).toBe(false)
  })

  it('reports sweep coverage and still caps a pump batch', () => {
    const tiles = worldSweepTiles()
    const now = 5_000_000
    const stamps = new Map([[tiles[0]!.key, { at: now, ok: true, count: 3 }]])
    const progress = sweepProgress(stamps, now, FAR_STALE_MS)
    expect(progress.total).toBe(tiles.length)
    expect(progress.covered).toBe(1)
    expect(progress.pct).toBe(Math.round((100 * progress.covered) / progress.total))
    const due = dueTiles(now, 40, -74, 12_000, new Map(), 4, 0)
    expect(due.tiles.length).toBeLessThanOrEqual(4)
    expect(due.tiles.length).toBeGreaterThan(0)
  })
})

describe('dock layout', () => {
  it('uses two columns on a short window and one column on a large one', () => {
    expect(dockLayout(800, 540)).toEqual({ columns: 2, radarPx: 96, radarSide: true, menuScrolls: true })
    expect(dockLayout(1024, 700)).toEqual({ columns: 2, radarPx: 96, radarSide: true, menuScrolls: true })
    expect(dockLayout(1440, 900)).toEqual({ columns: 1, radarPx: 148, radarSide: false, menuScrolls: true })
  })
})

describe('colour and radar settings', () => {
  it('round-trips marker style, overrides, and the radar toggle', () => {
    localStorage.setItem(
      'alleyes.settings.v1',
      JSON.stringify({
        markerSize: 0.5,
        theme: 'color',
        crt: 0.4,
        markerStyle: 'mono',
        radar: false,
        colorOverrides: { aircraft: '#112233', nope: 'red', 'x': '#ffffff' },
      }),
    )
    const store = new SettingsStore()
    expect(store.get().markerStyle).toBe('mono')
    expect(store.get().radar).toBe(false)
    expect(store.get().colorOverrides).toEqual({ aircraft: '#112233' })
    expect(layerHex('aircraft')).toBe(MONO_HEX)
    store.update({ markerStyle: 'color', radar: true })
    const again = new SettingsStore()
    expect(again.get().markerStyle).toBe('color')
    expect(again.get().radar).toBe(true)
    expect(again.get().colorOverrides.aircraft).toBe('#112233')
    expect(layerHex('aircraft')).toBe('#112233')
    applyPalette('color', {})
  })
})

describe('colors and radar commands', () => {
  it('sets mono, a layer colour, and the radar', async () => {
    const registry = new PluginRegistry()
    registry.register(systemPlugin)
    let style: 'color' | 'mono' = 'color'
    let radar = true
    const overrides = new Map<string, string>()
    const ctx = {
      layers: () => [{ id: 'aircraft', label: 'AIRCRAFT', on: true }],
      setMarkerStyle(next: 'color' | 'mono') {
        style = next
      },
      getMarkerStyle: () => style,
      setColorOverride(id: string, hex: string | null) {
        if (!hex) overrides.delete(id)
        else overrides.set(id, hex)
      },
      clearColorOverrides() {
        overrides.clear()
        style = 'color'
      },
      setRadar(on: boolean) {
        radar = on
        return on
      },
      radarOn: () => radar,
    } as CommandContext
    expect(await execute('colors', registry, ctx)).toBe('COLORS COLOR')
    expect(await execute('colors mono', registry, ctx)).toBe('COLORS MONO')
    expect(style).toBe('mono')
    expect(await execute('colors aircraft #ff00aa', registry, ctx)).toBe('COLORS AIRCRAFT #FF00AA')
    expect(overrides.get('aircraft')).toBe('#ff00aa')
    expect(await execute('colors reset', registry, ctx)).toBe('COLORS RESET')
    expect(overrides.size).toBe(0)
    expect(await execute('radar off', registry, ctx)).toBe('RADAR OFF')
    expect(radar).toBe(false)
    expect(await execute('radar', registry, ctx)).toBe('RADAR ON')
  })
})
