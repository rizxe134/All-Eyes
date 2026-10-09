import { describe, expect, it } from 'vitest'
import { execute, tokenize } from '../src/core/command'
import { bearingDeg, distanceKm, enuBasis, headingVector, latLonToVec, rightVector, vecToLatLon, dot } from '../src/core/geo'
import { PluginRegistry } from '../src/core/registry'
import { decodeShare, encodeShare } from '../src/core/share'
import { findCity } from '../src/core/cities'
import { windowsAbove } from '../src/plugins/satellites/passes'
import { displayAltKm } from '../src/plugins/satellites/alt'
import { examplePlugin } from '../src/plugins/example/plugin'
import { builtinPlugins } from '../src/plugins'
import type { AllEyesPlugin, CommandContext } from '../src/core/types'

function fakeCtx(over: Partial<CommandContext> = {}): CommandContext {
  return {
    flyTo() {},
    getView: () => ({ lat: 1, lon: 2, rangeKm: 1000 }),
    track() {},
    setLayer() {},
    layers: () => [],
    searchPlace: async () => null,
    findContact: () => null,
    contacts: () => [],
    setTimeMinutes() {},
    getTimeMinutes: () => 0,
    toggleMute: () => true,
    setMarkerSize() {},
    getMarkerSize: () => 0.7,
    screenshot() {},
    copyLink: async () => 'http://local/#x',
    alerts: {
      rules: [],
      items: [],
      add() {},
      remove() {},
      clearRules() {},
      raise: () => false,
      subscribe: () => () => {},
    },
    getPin: () => ({ lat: 0, lon: 0 }),
    setPin() {},
    getTrackId: () => null,
    help: () => 'HELP',
    ...over,
  }
}

describe('registry', () => {
  it('registers layers, panels, and commands', () => {
    const registry = new PluginRegistry()
    registry.register(examplePlugin)
    expect(registry.layers().map((layer) => layer.id)).toEqual(['beacons'])
    expect(registry.panels().map((panel) => panel.id)).toEqual(['beacon-help'])
    expect(registry.command('beacon')?.summary).toMatch(/beacon/i)
  })

  it('rejects duplicate ids', () => {
    const registry = new PluginRegistry()
    registry.register(examplePlugin)
    expect(() => registry.register(examplePlugin)).toThrow(/plugin id/i)
    const clash: AllEyesPlugin = {
      id: 'other',
      name: 'Other',
      version: '1',
      layers: [{ id: 'beacons', label: 'X', description: '', defaultOn: false, create: () => ({ setEnabled() {}, dispose() {} }) }],
    }
    expect(() => registry.register(clash)).toThrow(/layer id/i)
  })

  it('loads every built-in module once', () => {
    const registry = new PluginRegistry()
    for (const plugin of builtinPlugins) registry.register(plugin)
    const ids = registry.layers().map((layer) => layer.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toEqual(expect.arrayContaining(['aircraft', 'satellites', 'quakes', 'weather', 'ships', 'beacons']))
    expect(registry.commands().some((command) => command.name === 'fly')).toBe(true)
    expect(registry.commands().some((command) => command.name === 'pass')).toBe(true)
  })
})

describe('geo', () => {
  it('round-trips coordinates', () => {
    for (const [lat, lon] of [[35.68, 139.69], [0, 0], [-33.87, 151.21], [64.15, -21.94]] as const) {
      const back = vecToLatLon(latLonToVec(lat, lon, 20, 100))
      expect(back.lat).toBeCloseTo(lat, 4)
      expect(back.lon).toBeCloseTo(lon, 4)
    }
  })

  it('points heading zero north and ninety east', () => {
    const basis = enuBasis(0, 0)
    expect(dot(headingVector(0, 0, 0), basis.north)).toBeGreaterThan(0.99)
    expect(dot(headingVector(0, 0, 90), basis.east)).toBeGreaterThan(0.99)
    expect(dot(rightVector(0, 0, 0), basis.east)).toBeGreaterThan(0.99)
  })

  it('measures a known distance', () => {
    const km = distanceKm(51.5, -0.12, 48.86, 2.35)
    expect(km).toBeGreaterThan(300)
    expect(km).toBeLessThan(400)
    expect(Math.abs(bearingDeg(0, 0, 0, 10))).toBeGreaterThan(80)
  })
})

describe('share and commands', () => {
  it('round-trips a view hash', () => {
    const encoded = encodeShare({ lat: 12.34567, lon: -4.25, range: 8800.4, layers: ['aircraft', 'quakes'], track: 'air:abc' })
    const decoded = decodeShare('#' + encoded)
    expect(decoded?.lat).toBeCloseTo(12.3457, 3)
    expect(decoded?.lon).toBeCloseTo(-4.25, 3)
    expect(decoded?.range).toBe(8800)
    expect(decoded?.layers).toEqual(['aircraft', 'quakes'])
    expect(decoded?.track).toBe('air:abc')
  })

  it('tokenizes quotes and runs help', async () => {
    expect(tokenize('fly "new york" extra')).toEqual(['fly', 'new york', 'extra'])
    const registry = new PluginRegistry()
    for (const plugin of builtinPlugins) registry.register(plugin)
    const text = await execute('help', registry, fakeCtx())
    expect(text).toContain('FLY')
    expect(text).toContain('PASS')
  })

  it('finds bundled cities before the network', () => {
    expect(findCity('tokyo')?.name).toBe('TOKYO')
    expect(findCity('nyc')?.name).toBe('NEW YORK')
    expect(findCity('nope-not-a-city')).toBeNull()
  })
})

describe('passes and orbit display', () => {
  it('splits rise and set windows', () => {
    const samples = [
      { t: 0, el: 0 },
      { t: 1, el: 12 },
      { t: 2, el: 40 },
      { t: 3, el: 11 },
      { t: 4, el: 2 },
      { t: 5, el: 15 },
      { t: 6, el: 9 },
    ]
    const windows = windowsAbove(samples, 10)
    expect(windows).toHaveLength(2)
    expect(windows[0]).toMatchObject({ start: 1, peak: 2, peakEl: 40, end: 3 })
    expect(windows[1]?.start).toBe(5)
  })

  it('keeps low orbits and compresses high ones', () => {
    expect(displayAltKm(420)).toBe(420)
    expect(displayAltKm(20200)).toBeGreaterThan(4000)
    expect(displayAltKm(20200)).toBeLessThan(20200)
    expect(displayAltKm(36000)).toBeGreaterThan(displayAltKm(20200))
  })
})
