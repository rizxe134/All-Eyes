import { describe, expect, it } from 'vitest'
import { cardRows, FLOCK_FEED, FLOCK_SOURCE, fromCompact, manufacturerOf, marksForView, mergeAlpr, parseOverpassAlpr, tilesForView } from '../src/plugins/flock/parse'
import { alprQuery, compactDeflock, overpassFailed, OVERPASS_MIRRORS } from '../server/flock.mjs'
import { LEGEND_ROWS, spriteForLayer } from '../src/core/legend'

const body = {
  elements: [
    { type: 'node', id: 1, lat: 33.9, lon: -84.4, tags: { man_made: 'surveillance', 'surveillance:type': 'ALPR', manufacturer: 'Flock Safety', 'manufacturer:wikidata': 'Q108485435', direction: '110', operator: 'Cobb County PD' } },
    { type: 'node', id: 2, lat: 33.91, lon: -84.41, tags: { 'surveillance:type': 'ALPR', manufacturer: 'Motorola Solutions' } },
    { type: 'way', id: 3, center: { lat: 33.92, lon: -84.42 }, tags: { 'surveillance:type': 'ALPR', 'manufacturer:wikidata': 'Q108485435' } },
    { type: 'node', id: 4, lat: 0, lon: 0, tags: { 'surveillance:type': 'ALPR' } },
    { type: 'node', id: 5, lat: 33.9, lon: -84.4, tags: { 'surveillance:type': 'camera' } },
    { type: 'node', id: 6, tags: { 'surveillance:type': 'ALPR' } },
  ],
}

describe('flock alpr parse', () => {
  it('keeps ALPR nodes and ways, labels makers, drops bad points', () => {
    const rows = parseOverpassAlpr(body)
    expect(rows.map((r) => r.id)).toEqual(['alpr:n1', 'alpr:n2', 'alpr:w3'])
    expect(rows[0]).toMatchObject({ manufacturer: 'Flock Safety', isFlock: true, direction: '110', operator: 'Cobb County PD', osmUrl: 'https://www.openstreetmap.org/node/1' })
    expect(rows[1]).toMatchObject({ manufacturer: 'Motorola Solutions', isFlock: false })
    expect(rows[2]).toMatchObject({ isFlock: true, osmUrl: 'https://www.openstreetmap.org/way/3' })
    expect(manufacturerOf({}).name).toBe('Unknown ALPR')
  })
  it('card is honest: no feed, crowdsourced source', () => {
    const card = cardRows(parseOverpassAlpr(body)[0]!)
    expect(card.find((r) => r.k === 'FEED')?.v).toBe(FLOCK_FEED)
    expect(FLOCK_FEED).toBe('NOT AVAILABLE — private ALPR camera, no public feed')
    expect(card.find((r) => r.k === 'SOURCE')?.v).toBe(FLOCK_SOURCE)
    expect(FLOCK_SOURCE).toBe('OpenStreetMap / DeFlock (crowdsourced)')
    expect(JSON.stringify(card)).not.toMatch(/\.(jpg|m3u8|mp4)|flocksafety\.com/i)
  })
  it('compacts DeFlock GeoJSON and reads it back', () => {
    const c = compactDeflock({ features: [
      { geometry: { type: 'Point', coordinates: [-83.15, 34.28] }, properties: { osmId: 9, osmType: 'way', brand: 'Flock Safety' } },
      { geometry: { type: 'Point', coordinates: [0, 0] }, properties: { osmId: 10 } },
      { geometry: { type: 'Point', coordinates: [-80, 35] }, properties: { osmId: 11, osmType: 'node' } },
    ] })
    expect(c.points).toHaveLength(2)
    const rows = fromCompact(c)
    expect(rows[0]).toMatchObject({ id: 'alpr:w9', isFlock: true, osmUrl: 'https://www.openstreetmap.org/way/9' })
    expect(rows[1]).toMatchObject({ id: 'alpr:n11', manufacturer: 'Unknown ALPR' })
  })
  it('overpass rows replace overview rows with richer tags', () => {
    const base = new Map(fromCompact({ brands: ['Flock Safety'], points: [[33.9, -84.4, 0, 1, 'n']] }).map((r) => [r.id, r]))
    const merged = mergeAlpr(base, parseOverpassAlpr(body))
    expect(merged.get('alpr:n1')?.operator).toBe('Cobb County PD')
  })
  it('clusters when zoomed out, singles when zoomed in', () => {
    const rows = parseOverpassAlpr(body)
    const wide = marksForView(rows, { lat: 33.9, lon: -84.4, rangeKm: 2000 })
    expect(wide).toHaveLength(1)
    expect(wide[0]).toMatchObject({ cluster: true, count: 3 })
    const close = marksForView(rows, { lat: 33.9, lon: -84.4, rangeKm: 10 })
    expect(close.every((m) => !m.cluster)).toBe(true)
    expect(close[0]!.label).toBe('FLOCK ALPR')
  })
  it('asks for few small tiles', () => {
    const t = tilesForView({ lat: 33.9, lon: -84.4, rangeKm: 50 })
    expect(t.length).toBeGreaterThan(0)
    expect(t.length).toBeLessThanOrEqual(6)
    for (const x of t) expect(x.n - x.s).toBeCloseTo(0.5)
  })
})

describe('flock server', () => {
  it('builds an ALPR overpass query with DeFlock first and a fallback mirror', () => {
    const q = alprQuery(33.9, -84.5, 34.1, -84.2)
    expect(q).toContain('["surveillance:type"="ALPR"]')
    expect(q.startsWith('[out:json]')).toBe(true)
    expect(OVERPASS_MIRRORS[0]).toContain('overpass.deflock.org')
    expect(OVERPASS_MIRRORS.length).toBeGreaterThan(1)
  })
  it('treats timeouts as failures', () => {
    expect(overpassFailed({ elements: [], remark: 'runtime error: Query timed out' })).toBe(true)
    expect(overpassFailed({ elements: [] })).toBe(false)
    expect(overpassFailed(null)).toBe(true)
  })
})

describe('flock legend', () => {
  it('legend row uses the globe sprite', () => {
    const row = LEGEND_ROWS.find((r) => r.id === 'flock')
    expect(row && row.kind === 'icon' && row.sprite).toBe(spriteForLayer('flock'))
  })
})
