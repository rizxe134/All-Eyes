import { describe, expect, it } from 'vitest'
import { clipCountdownLabel, needsResync, StallWatch } from '../src/plugins/cameras/live'
import { inSourceBounds, parseFeed } from '../src/plugins/cameras/parse'
import { filterCams } from '../src/desk/cameras'

describe('live edge', () => {
  it('resyncs only when far behind', () => {
    expect(needsResync(10, 30)).toBe(true)
    expect(needsResync(25, 30)).toBe(false)
    expect(needsResync(10, null)).toBe(false)
  })
  it('detects a stall', () => {
    const w = new StallWatch(1000)
    w.reset(0)
    expect(w.feed(1, 0)).toBe(false)
    expect(w.feed(1, 500)).toBe(false)
    expect(w.feed(1, 1200)).toBe(true)
    expect(w.feed(2, 1300)).toBe(false)
    expect(w.feed(2, 5000, true)).toBe(false)
  })
  it('labels the clip countdown', () => {
    expect(clipCountdownLabel(3.2)).toBe('VIDEO CLIP · ENDED · NEW CLIP IN 4s')
    expect(clipCountdownLabel(0)).toBe('VIDEO CLIP · LOADING NEW CLIP')
  })
})

describe('camera coordinates', () => {
  const wi = (wkt: string, extra: Record<string, unknown> = {}) => ({
    data: [{ id: 1, latLng: { geography: { wellKnownText: wkt } }, images: [{ id: 7, imageUrl: '/map/Cctv/7' }], ...extra }],
  })
  it('drops (0,0) and keeps real Wisconsin points', () => {
    expect(parseFeed('wi', wi('POINT (0 0)'))).toHaveLength(0)
    const ok = parseFeed('wi', wi('POINT (-89.4 43.07)'))
    expect(ok).toHaveLength(1)
    expect(ok[0].lat).toBeCloseTo(43.07)
    expect(ok[0].lon).toBeCloseTo(-89.4)
  })
  it('drops cameras with missing coordinates', () => {
    expect(parseFeed('wi', wi(''))).toHaveLength(0)
    expect(parseFeed('wi', wi('', { latitude: null, longitude: null }))).toHaveLength(0)
  })
  it('falls back to latitude/longitude fields', () => {
    expect(parseFeed('wi', wi('', { latitude: '43.07', longitude: '-89.4' }))).toHaveLength(1)
  })
  it('hides cameras outside their source region', () => {
    expect(parseFeed('wi', wi('POINT (2.3 48.8)'))).toHaveLength(0)
    expect(inSourceBounds('tfl', 51.5, -0.12)).toBe(true)
    expect(inSourceBounds('tfl', 0, 0)).toBe(false)
    expect(inSourceBounds('caltrans', 34, -118)).toBe(true)
    expect(inSourceBounds('caltrans', 43, -89)).toBe(false)
  })
})

describe('live only', () => {
  it('keeps only live feeds', () => {
    const base = { name: 'a', road: '', direction: '', lat: 1, lon: 1, source: 'x', agency: '', attribution: '', imageUrl: '', videoUrl: '', pageUrl: '', refreshSec: 30, updated: '', online: true }
    const cams = [
      { ...base, id: '1', mode: 'hls' as const },
      { ...base, id: '2', mode: 'mp4' as const },
      { ...base, id: '3', mode: 'snapshot' as const },
    ]
    expect(filterCams(cams, { mode: 'live' }).map((c) => c.id)).toEqual(['1'])
  })
})
