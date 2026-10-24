import { describe, expect, it } from 'vitest'
import { searchCams, resetCatalog, setSourceCams } from '../src/plugins/cameras/catalog'
import {
  feedMode,
  lastGoodLabel,
  marksForView,
  offlineLabel,
  playbackPlan,
  secureUrl,
  stepLabel,
} from '../src/plugins/cameras/feed'
import { countClasses, filterDetections, letterbox, mapBox } from '../src/plugins/cameras/detect-math'
import { parse511, type TrafficCam } from '../src/plugins/cameras/parse'
import { canonicalMedia, mediaAllowed, mediaHeaders } from '../server/cams.mjs'

function cam(partial: Partial<TrafficCam> & Pick<TrafficCam, 'id' | 'lat' | 'lon' | 'mode'>): TrafficCam {
  return {
    road: '',
    direction: '',
    source: 'test',
    agency: 'Test',
    attribution: 'Test',
    imageUrl: '',
    videoUrl: '',
    pageUrl: '',
    refreshSec: 30,
    updated: '',
    online: true,
    ...partial,
    name: partial.name ?? partial.id,
  }
}

describe('playback fallback', () => {
  it('tries a public stream before the snapshot and upgrades http', () => {
    const plan = playbackPlan(cam({
      id: 'cam:ca:1',
      lat: 34,
      lon: -118,
      mode: 'hls',
      videoUrl: 'http://wzmedia.dot.ca.gov/D8/LB-8_10_389.stream/playlist.m3u8',
      imageUrl: 'https://cwwp2.dot.ca.gov/data/d8/cctv/image/a.jpg',
    }))
    expect(plan.hidden).toBe(false)
    expect(plan.steps.map((step) => step.kind)).toEqual(['hls', 'snapshot'])
    expect(plan.steps[0]?.url.startsWith('https://wzmedia.dot.ca.gov/')).toBe(true)
    expect(feedMode('http://wzmedia.dot.ca.gov/D8/LB-8_10_389.stream/playlist.m3u8', 'https://cwwp2.dot.ca.gov/a.jpg', false)).toBe('hls')
    expect(secureUrl('//cctv1.dot.wi.gov/a.m3u8')).toBe('https://cctv1.dot.wi.gov/a.m3u8')
  })

  it('does not play an auth-walled or unproxied playlist', () => {
    const georgia = playbackPlan(cam({
      id: 'cam:ga:1',
      lat: 33.8,
      lon: -84.3,
      mode: 'snapshot',
      videoUrl: '',
      imageUrl: 'https://511ga.org/map/Cctv/18558',
    }))
    expect(georgia.steps.map((step) => step.kind)).toEqual(['snapshot'])
    expect(georgia.reason).toBe('')
    const florida = playbackPlan(cam({
      id: 'cam:fl:1',
      lat: 28,
      lon: -81,
      mode: 'snapshot',
      videoUrl: 'https://dis-se16.divas.cloud:8200/chan-12637_h/index.m3u8',
      imageUrl: 'https://fl511.com/map/Cctv/1',
    }))
    expect(florida.steps.map((step) => step.kind)).toEqual(['snapshot'])
    expect(florida.reason).toBe('STREAM NOT PUBLIC')
  })

  it('hides a catalog-disabled camera and names a total failure', () => {
    expect(playbackPlan(cam({ id: 'cam:nyc:1', lat: 40, lon: -73, mode: 'snapshot', online: false, imageUrl: 'https://webcams.nyctmc.org/a.jpg' })).hidden).toBe(true)
    const dead = playbackPlan(cam({ id: 'cam:x:1', lat: 1, lon: 2, mode: 'offline' }))
    expect(dead.steps).toEqual([])
    expect(dead.reason).toBe('NO MEDIA URL')
    expect(stepLabel('snapshot', 5, 'STREAM 404')).toBe('SNAPSHOT · STREAM 404')
    expect(stepLabel('hls', 5, '')).toBe('LIVE')
    expect(stepLabel('mp4', 60, '')).toBe('VIDEO CLIP · plays once, then a new clip')
    expect(offlineLabel('SNAPSHOT FAILED', 'NEVER')).toBe('FEED OFFLINE · SNAPSHOT FAILED · LAST GOOD NEVER')
    expect(lastGoodLabel(1_000, 1_000)).toBe('JUST NOW')
    expect(lastGoodLabel(null)).toBe('NEVER')
  })

  it('drops disabled cameras from the globe and from search', () => {
    const rows = [
      cam({ id: 'cam:tfl:1', lat: 51.51, lon: -0.12, mode: 'mp4', name: 'One' }),
      cam({ id: 'cam:tfl:off', lat: 51.52, lon: -0.11, mode: 'snapshot', name: 'Closed', online: false }),
    ]
    expect(marksForView(rows, { lat: 51.5, lon: -0.1, rangeKm: 40 }).map((mark) => mark.id)).toEqual(['cam:tfl:1'])
    resetCatalog()
    setSourceCams('tfl', rows)
    expect(searchCams('closed')).toEqual([])
    expect(searchCams('one').map((row) => row.id)).toEqual(['cam:tfl:1'])
    resetCatalog()
  })

  it('skips a 511 view the catalog marks hidden', () => {
    const rows = parse511({
      host: '511ga.org',
      data: [{
        id: '1',
        roadway: 'SR 13',
        latLng: { geography: { wellKnownText: 'POINT (-84.38 33.85)' } },
        images: [
          { id: '9', description: 'Hidden', imageUrl: '/map/Cctv/9', visible: false },
          { id: '10', description: 'Shown', imageUrl: '/map/Cctv/10' },
        ],
      }],
    }, 'ga')
    expect(rows.map((row) => row.id)).toEqual(['cam:ga:10'])
  })
})

describe('detection geometry', () => {
  it('letterboxes a wide frame into a square and a tall frame into a wide stage', () => {
    const wide = letterbox(1920, 1080, 1000, 1000)
    expect(wide.scale).toBeCloseTo(1000 / 1920)
    expect(wide.offX).toBeCloseTo(0)
    expect(wide.offY).toBeCloseTo(218.75)
    const box = mapBox({ x: 100, y: 50, w: 200, h: 80 }, 1920, 1080, 1000, 1000)
    expect(box.x).toBeCloseTo(100 * (1000 / 1920))
    expect(box.y).toBeCloseTo(50 * (1000 / 1920) + 218.75)
    expect(box.w).toBeCloseTo(200 * (1000 / 1920))
    const tall = letterbox(640, 480, 1000, 400)
    expect(tall.scale).toBeCloseTo(400 / 480)
    expect(tall.offY).toBeCloseTo(0)
    expect(tall.offX).toBeCloseTo((1000 - 640 * (400 / 480)) / 2)
    expect(mapBox({ x: 0, y: 0, w: 1, h: 1 }, 0, 10, 10, 10)).toEqual({ x: 0, y: 0, w: 0, h: 0 })
  })

  it('keeps road users and drops everything else under the confidence threshold', () => {
    const boxes = filterDetections([
      { class: 'car', score: 0.91, bbox: [1, 2, 3, 4] },
      { class: 'Motorbike', score: 0.5, bbox: [5, 6, 7, 8] },
      { class: 'airplane', score: 0.99, bbox: [0, 0, 9, 9] },
      { class: 'person', score: 0.2, bbox: [1, 1, 1, 1] },
      { class: 'truck', score: 0.44, bbox: [2, 2, 2, 2] },
    ], 0.45)
    expect(boxes.map((box) => box.class)).toEqual(['car', 'motorcycle'])
    expect(countClasses(boxes)).toMatchObject({ car: 1, motorcycle: 1, truck: 0, person: 0, bus: 0, bicycle: 0 })
  })
})

describe('camera media headers', () => {
  it('sends the agency referer and still refuses an auth-walled host', () => {
    expect(canonicalMedia('http://wzmedia.dot.ca.gov/D8/a.m3u8')).toBe('https://wzmedia.dot.ca.gov/D8/a.m3u8')
    expect(mediaAllowed(canonicalMedia('http://wzmedia.dot.ca.gov/D8/a.m3u8'))).toBe(true)
    expect(mediaAllowed('http://511ga.org/map/Cctv/1')).toBe(false)
    expect(mediaAllowed('https://dis-se16.divas.cloud:8200/chan-12637_h/index.m3u8')).toBe(false)
    const headers = mediaHeaders('https://wzmedia.dot.ca.gov/D5/playlist.m3u8')
    expect(headers.referer).toBe('https://cwwp2.dot.ca.gov/')
    expect(headers.origin).toBe('https://cwwp2.dot.ca.gov')
    expect(mediaHeaders('https://cctv1.dot.wi.gov/rtplive/a/playlist.m3u8').referer).toBe('https://511wi.gov/')
    expect(mediaHeaders('https://s3-eu-west-1.amazonaws.com/jamcams.tfl.gov.uk/a.mp4').origin).toBe('https://www.tfl.gov.uk')
  })
})
