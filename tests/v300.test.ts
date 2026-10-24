import { describe, expect, it } from 'vitest'
import { resetCatalog, searchCams, setSourceCams, sourceCounts } from '../src/plugins/cameras/catalog'
import { dedupeCams, feedMode, marksForView, modeLabel } from '../src/plugins/cameras/feed'
import {
  parse511,
  parseCaltrans,
  parseFeed,
  parseFi,
  parseNyc,
  parseOhgo,
  parseTfl,
  parseWindy,
  parseWsdot,
  type TrafficCam,
} from '../src/plugins/cameras/parse'
import { mediaAllowed, rewritePlaylist } from '../server/cams.mjs'

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

describe('camera feed mode', () => {
  it('keeps an open playlist as HLS and an auth-walled one as a snapshot', () => {
    expect(feedMode('https://cctv1.dot.wi.gov/rtplive/CCTV-49-0011/playlist.m3u8', 'https://511wi.gov/map/Cctv/1', false)).toBe('hls')
    expect(feedMode('https://sfs.example/playlist.m3u8', 'https://511ga.org/map/Cctv/18558', true)).toBe('snapshot')
    expect(feedMode('https://s3-eu-west-1.amazonaws.com/jamcams.tfl.gov.uk/00002.00865.mp4', 'https://s3-eu-west-1.amazonaws.com/jamcams.tfl.gov.uk/00002.00865.jpg', false)).toBe('mp4')
    expect(feedMode('https://cctv1.dot.wi.gov/stream.mjpg', 'https://cctv1.dot.wi.gov/still.jpg', false)).toBe('mjpeg')
    expect(feedMode('', 'https://webcams.nyctmc.org/api/cameras/1/image', false)).toBe('snapshot')
    expect(feedMode('', '', false)).toBe('offline')
    expect(feedMode('https://dis-se16.divas.cloud:8200/chan-12637_h/index.m3u8', 'https://fl511.com/map/Cctv/1', false)).toBe('snapshot')
  })

  it('labels streams, clips, and stills differently', () => {
    expect(modeLabel('hls', 5)).toBe('LIVE')
    expect(modeLabel('mjpeg', 5)).toBe('LIVE')
    expect(modeLabel('mp4', 60)).toBe('VIDEO CLIP · refreshes every 60s')
    expect(modeLabel('snapshot', 600)).toBe('SNAPSHOT · refreshes every 600s')
    expect(modeLabel('offline', 5)).toBe('FEED OFFLINE')
  })
})

describe('camera parsers', () => {
  it('reads a TfL JamCam as a video clip', () => {
    const rows = parseTfl([{
      id: 'JamCam_00002.00865',
      commonName: 'A406 Billet Upass E',
      lat: 51.60067,
      lon: -0.01594,
      additionalProperties: [
        { key: 'available', value: 'true' },
        { key: 'imageUrl', value: 'https://s3-eu-west-1.amazonaws.com/jamcams.tfl.gov.uk/00002.00865.jpg' },
        { key: 'videoUrl', value: 'https://s3-eu-west-1.amazonaws.com/jamcams.tfl.gov.uk/00002.00865.mp4' },
        { key: 'view', value: 'West' },
      ],
    }])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      id: 'cam:tfl:JamCam_00002.00865',
      direction: 'West',
      mode: 'mp4',
      attribution: 'Transport for London JamCam',
    })
  })

  it('reads Caltrans stills and streams', () => {
    const rows = parseCaltrans({
      data: [
        {
          cctv: {
            location: { locationName: 'TV102 -- I-580 : West of SR-24', latitude: '37.82539', longitude: '-122.27291', direction: 'West', route: 'I-580' },
            imageData: {
              streamingVideoURL: 'https://media.dot.ca.gov/D4/W4_at_Lone_Tree_Way.stream/playlist.m3u8',
              static: { currentImageURL: 'https://cwwp2.dot.ca.gov/data/d4/cctv/image/tv.jpg', currentImageUpdateFrequency: '5' },
            },
            recordTimestamp: { recordDate: '2026-10-23', recordTime: '12:00:00' },
          },
        },
        {
          cctv: {
            location: { locationName: 'Still only', latitude: 34.1, longitude: -118.2, direction: 'North', route: 'I-5' },
            imageData: { streamingVideoURL: '', static: { currentImageURL: 'https://cwwp2.dot.ca.gov/still.jpg' } },
          },
        },
      ],
    })
    expect(rows.map((row) => row.mode)).toEqual(['hls', 'snapshot'])
    expect(rows[0]?.refreshSec).toBe(5)
    expect(rows[0]?.road).toBe('I-580')
  })

  it('reads NYC as snapshots', () => {
    const rows = parseNyc([{ id: '1', name: 'FDR at 23 St', latitude: '40.7', longitude: '-73.9', area: 'Manhattan', isOnline: 'true', imageUrl: 'https://webcams.nyctmc.org/api/cameras/1/image' }])
    expect(rows[0]).toMatchObject({ mode: 'snapshot', source: 'nyc', agency: 'NYC DOT', refreshSec: 5 })
  })

  it('emits one Digitraffic camera per preset without a detail call', () => {
    const rows = parseFi({
      features: [{
        geometry: { type: 'Point', coordinates: [23.99616, 60.05374, 0] },
        properties: {
          id: 'C01503',
          name: 'kt51_Inkoo',
          dataUpdatedTime: '2026-10-23T15:25:45Z',
          presets: [
            { id: 'C0150301', inCollection: true },
            { id: 'C0150302', inCollection: true },
            { id: 'C0150309', inCollection: false },
          ],
        },
      }],
    })
    expect(rows.map((row) => row.id)).toEqual(['cam:fi:C0150301', 'cam:fi:C0150302'])
    expect(rows[0]).toMatchObject({
      mode: 'snapshot',
      refreshSec: 600,
      imageUrl: 'https://weathercam.digitraffic.fi/C0150301.jpg',
      lat: 60.05374,
      lon: 23.99616,
    })
  })

  it('treats Georgia auth video as a snapshot and Wisconsin open video as HLS', () => {
    const row = (host: string, auth: boolean, video: string | null) => ({
      host,
      data: [{
        id: '11148',
        roadway: 'SR 13',
        direction: 'North',
        location: 'ATL-0602',
        latLng: { geography: { wellKnownText: 'POINT (-84.38 33.85)' } },
        images: [{
          id: '18558',
          description: 'ATL-0602: SR 13 at Lenox Rd',
          imageUrl: '/map/Cctv/18558',
          videoUrl: video,
          isVideoAuthRequired: auth,
        }],
      }],
    })
    const georgia = parse511(row('511ga.org', true, 'https://sfs.example/playlist.m3u8'), 'ga')
    expect(georgia[0]).toMatchObject({
      mode: 'snapshot',
      imageUrl: 'https://511ga.org/map/Cctv/18558',
      videoUrl: '',
      attribution: 'Georgia 511 / GDOT',
    })
    const wisconsin = parse511(row('511wi.gov', false, 'https://cctv1.dot.wi.gov/rtplive/CCTV-49-0011/playlist.m3u8'), 'wi')
    expect(wisconsin[0]?.mode).toBe('hls')
    expect(parseFeed('fl', row('fl511.com', true, 'https://divas.cloud/live/playlist.m3u8'))[0]?.mode).toBe('snapshot')
    expect(parseFeed('az', row('az511.gov', false, null))[0]?.mode).toBe('snapshot')
    expect(parseFeed('on', row('511on.ca', false, null))[0]?.mode).toBe('snapshot')
  })

  it('reads optional keyed catalogs as snapshots', () => {
    expect(parseWindy({ webcams: [{ webcamId: 9, title: 'Harbor', location: { latitude: 60.1, longitude: 24.9, city: 'Helsinki' }, images: { current: { preview: 'https://img.example/9.jpg' } } }] })[0]?.mode).toBe('snapshot')
    expect(parseWsdot({ Cameras: [{ CameraID: 4, Title: 'I-5', DisplayLatitude: 47.6, DisplayLongitude: -122.3, ImageURL: 'https://images.wsdot.wa.gov/4.jpg', RoadName: 'I-5' }] })[0]).toMatchObject({ mode: 'snapshot', road: 'I-5' })
    expect(parseOhgo({ results: [{ id: 'c1', location: 'I-71', latitude: 39.9, longitude: -83.0, direction: 'North', cameraViews: [{ largeUrl: 'https://ohgo.com/c1.jpg' }] }] })[0]?.mode).toBe('snapshot')
    expect(parseTfl({})).toEqual([])
    expect(parseFeed('nope', {})).toEqual([])
  })
})

describe('camera dedupe and view marks', () => {
  it('keeps the richer feed and does not merge different presets at one pole', () => {
    const merged = dedupeCams([
      cam({ id: 'cam:ga:1', lat: 33.85, lon: -84.38, mode: 'snapshot', name: 'Lenox', imageUrl: 'https://511ga.org/a.png', source: 'ga' }),
      cam({ id: 'cam:ga:1', lat: 33.85, lon: -84.38, mode: 'hls', name: 'Lenox', videoUrl: 'https://cctv.example/a.m3u8', imageUrl: 'https://511ga.org/a.png', source: 'ga' }),
      cam({ id: 'cam:fi:a', lat: 60.05, lon: 23.99, mode: 'snapshot', name: 'kt51_Inkoo C0150301', source: 'fi' }),
      cam({ id: 'cam:fi:b', lat: 60.05, lon: 23.99, mode: 'snapshot', name: 'kt51_Inkoo C0150302', source: 'fi' }),
    ])
    expect(merged.find((row) => row.id === 'cam:ga:1')?.mode).toBe('hls')
    expect(merged.filter((row) => row.source === 'fi')).toHaveLength(2)
  })

  it('collapses the same name at the same rounded point across sources', () => {
    const merged = dedupeCams([
      cam({ id: 'cam:a:1', lat: 33.8504, lon: -84.3804, mode: 'snapshot', name: 'Lenox Rd', source: 'ga' }),
      cam({ id: 'cam:b:1', lat: 33.8501, lon: -84.3802, mode: 'mp4', name: 'Lenox Rd', source: 'tfl' }),
    ])
    expect(merged).toHaveLength(1)
    expect(merged[0]?.mode).toBe('mp4')
  })

  it('clusters a wide view and keeps individuals up close', () => {
    const rows = [
      cam({ id: 'cam:tfl:1', lat: 51.51, lon: -0.12, mode: 'mp4', name: 'One' }),
      cam({ id: 'cam:tfl:2', lat: 51.52, lon: -0.11, mode: 'mp4', name: 'Two' }),
    ]
    const wide = marksForView(rows, { lat: 51.5, lon: -0.1, rangeKm: 900 })
    expect(wide.some((mark) => mark.cluster)).toBe(true)
    const near = marksForView(rows, { lat: 51.5, lon: -0.1, rangeKm: 40 })
    expect(near.map((mark) => mark.id).sort()).toEqual(['cam:tfl:1', 'cam:tfl:2'])
    expect(near.every((mark) => !mark.cluster)).toBe(true)
  })

  it('searches the catalog by road and counts each source', () => {
    resetCatalog()
    setSourceCams('tfl', [cam({ id: 'cam:tfl:1', lat: 51.5, lon: -0.1, mode: 'mp4', name: 'A406 Billet', road: 'A406', source: 'tfl' })])
    setSourceCams('nyc', [cam({ id: 'cam:nyc:1', lat: 40.7, lon: -73.9, mode: 'snapshot', name: 'FDR', road: 'FDR', source: 'nyc' })])
    expect(searchCams('a406').map((row) => row.id)).toEqual(['cam:tfl:1'])
    expect(searchCams('fdr')[0]?.mode).toBe('snapshot')
    expect(sourceCounts().tfl).toMatchObject({ total: 1, mp4: 1 })
    expect(sourceCounts().nyc).toMatchObject({ total: 1, snapshot: 1 })
    resetCatalog()
  })
})

describe('camera media proxy', () => {
  it('rewrites relative playlists back through the proxy and refuses other hosts', () => {
    const text = [
      '#EXTM3U',
      '#EXT-X-STREAM-INF:BANDWIDTH=800000',
      'chunklist_w121077062.m3u8',
      '#EXT-X-MEDIA:URI="audio.m3u8"',
    ].join('\n')
    const rewritten = rewritePlaylist(text, 'https://cctv1.dot.wi.gov/rtplive/CCTV-49-0011/playlist.m3u8')
    expect(rewritten).toContain('/api/cams/media?u=' + encodeURIComponent('https://cctv1.dot.wi.gov/rtplive/CCTV-49-0011/chunklist_w121077062.m3u8'))
    expect(rewritten).toContain(encodeURIComponent('https://cctv1.dot.wi.gov/rtplive/CCTV-49-0011/audio.m3u8'))
    expect(mediaAllowed('https://media.dot.ca.gov/D4/playlist.m3u8')).toBe(true)
    expect(mediaAllowed('https://s3-eu-west-1.amazonaws.com/jamcams.tfl.gov.uk/00002.00865.mp4')).toBe(true)
    expect(mediaAllowed('https://example.com/secret.m3u8')).toBe(false)
    expect(mediaAllowed('http://511ga.org/map/Cctv/1')).toBe(false)
  })
})
