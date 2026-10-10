import { describe, expect, it } from 'vitest'
import { declutterCellDeg, declutterMarkers, markerScreenPx } from '../src/core/markers'
import { MARKER_DEFAULT } from '../src/core/settings'
import { backoffMs, feedFailure, feedStatusLine, viewSamples } from '../src/plugins/aircraft/feed'
import type { AirFix } from '../src/plugins/aircraft/parse'
import { STALE_MS, deadReckonFix, mergeHeld, type HeldContact } from '../src/plugins/aircraft/retain'

function fix(icao: string, over: Partial<AirFix> = {}): AirFix {
  return {
    icao,
    callsign: icao.toUpperCase(),
    country: '',
    lat: 51,
    lon: 0,
    altM: 10000,
    track: 0,
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
    ...over,
  }
}

function held(icao: string, updatedAt: number, over: Partial<AirFix> = {}): [string, HeldContact] {
  return [icao, { fix: fix(icao, over), updatedAt }]
}

describe('aircraft contact retention', () => {
  const now = 1_700_000_000_000

  it('keeps the last good contacts when a poll is empty or failed', () => {
    const previous = new Map([held('abc123', now - 10_000), held('def456', now - 20_000)])
    const empty = mergeHeld(previous, [], now)
    const failed = mergeHeld(previous, null, now)
    expect([...empty.keys()].sort()).toEqual(['abc123', 'def456'])
    expect([...failed.keys()].sort()).toEqual(['abc123', 'def456'])
    expect(empty.get('abc123')?.fix.lat).toBe(51)
  })

  it('merges by ICAO and replaces only the contacts the poll actually returned', () => {
    const previous = new Map([held('abc123', now - 10_000, { lat: 10, callsign: 'OLD' })])
    const next = mergeHeld(previous, [fix('abc123', { lat: 22, callsign: 'NEW' }), fix('fff111', { lat: 3 })], now)
    expect(next.get('abc123')).toMatchObject({ updatedAt: now, fix: { lat: 22, callsign: 'NEW' } })
    expect(next.get('fff111')?.fix.lat).toBe(3)
  })

  it('expires a contact after the staleness window and keeps a newer one', () => {
    const previous = new Map([
      held('stale1', now - STALE_MS - 1),
      held('fresh1', now - STALE_MS + 5_000),
    ])
    const next = mergeHeld(previous, null, now)
    expect(next.has('stale1')).toBe(false)
    expect(next.has('fresh1')).toBe(true)
    expect(STALE_MS).toBeGreaterThanOrEqual(60_000)
    expect(STALE_MS).toBeLessThanOrEqual(120_000)
  })

  it('dead-reckons along track and leaves a failed poll unmoved', () => {
    const start = fix('abc123', { lat: 51, lon: 0, track: 0, speedKt: 360 })
    const moved = deadReckonFix(start, now - 60_000, now)
    expect(moved.lat).toBeGreaterThan(51.05)
    expect(moved.lat).toBeLessThan(51.2)
    expect(moved.lon).toBeCloseTo(0, 5)
    const parked = deadReckonFix(fix('abc123', { onGround: true, speedKt: 20 }), now - 60_000, now)
    expect(parked.lat).toBe(51)
  })
})

describe('marker LOD and declutter', () => {
  it('never produces a zero-size marker, including the far default', () => {
    expect(markerScreenPx(true, false, true, MARKER_DEFAULT)).toBeGreaterThanOrEqual(4)
    expect(markerScreenPx(true, false, true, 0.2)).toBeGreaterThanOrEqual(4)
    expect(markerScreenPx(true, false, true, 0)).toBeGreaterThanOrEqual(4)
    expect(markerScreenPx(true, false, true, Number.NaN)).toBeGreaterThanOrEqual(4)
    expect(markerScreenPx(false, false, true, MARKER_DEFAULT)).toBeGreaterThanOrEqual(6)
    expect(markerScreenPx(false, true, false, 0.2)).toBeGreaterThan(0)
  })

  it('keeps at least one marker in each occupied cell and never drops a non-empty set', () => {
    const cell = declutterCellDeg(9800)
    expect(cell).toBeGreaterThan(0)
    const crowded = Array.from({ length: 20 }, (_, i) => ({
      id: `air:${i}`,
      lat: 51 + i * 0.01,
      lon: 0.01,
      brightness: i / 20,
    }))
    const oneCell = declutterMarkers(crowded, cell)
    expect(oneCell).toHaveLength(1)
    expect(oneCell[0]?.id).toBe('air:19')

    const split = [
      ...crowded,
      { id: 'air:other', lat: 10, lon: 40, brightness: 0.2 },
    ]
    const two = declutterMarkers(split, cell)
    const cells = new Set(two.map((marker) => `${Math.floor(marker.lat / cell)}:${Math.floor(marker.lon / cell)}`))
    expect(cells.size).toBe(2)
    expect(two.length).toBeGreaterThanOrEqual(2)

    const locked = declutterMarkers(crowded, cell, new Set(['air:0']))
    expect(locked.map((marker) => marker.id)).toContain('air:0')
    expect(locked.length).toBeGreaterThanOrEqual(1)
    expect(declutterMarkers([], cell)).toEqual([])
  })
})

describe('feed status', () => {
  it('names rate limits, denials, and the HUD line', () => {
    expect(feedFailure(new Error('429 /api/adsb/point'))).toBe('rate')
    expect(feedFailure(new Error('403 /api/airplanes/point'))).toBe('denied')
    expect(feedFailure(new Error('502 /api/adsb/point'))).toBe('down')
    expect(backoffMs('denied')).toBeGreaterThan(backoffMs('rate'))
    expect(feedStatusLine(1842, 'OK', 'ADSB.LOL')).toBe('AIR 1842 · OK · ADSB.LOL')
    expect(feedStatusLine(1842, 'RATE-LIMITED', 'ADSB.FI')).toContain('RATE-LIMITED')
    expect(feedStatusLine(0, 'OFFLINE', 'NONE')).toContain('OFFLINE')
  })

  it('queries the view center and does not drop it when the globe is wide', () => {
    const close = viewSamples(51.5, -0.1, 400)
    expect(close).toHaveLength(1)
    expect(close[0]).toMatchObject({ lat: 51.5, lon: -0.1 })
    const wide = viewSamples(14, 12, 9800)
    expect(wide[0]).toMatchObject({ lat: 14, lon: 12 })
    expect(wide.length).toBeGreaterThan(5)
  })
})
