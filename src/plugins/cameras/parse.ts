import { feedMode } from './feed'

export type CamMode = 'hls' | 'mjpeg' | 'mp4' | 'snapshot' | 'offline'

export interface TrafficCam {
  id: string
  name: string
  road: string
  direction: string
  lat: number
  lon: number
  source: string
  agency: string
  attribution: string
  imageUrl: string
  videoUrl: string
  pageUrl: string
  mode: CamMode
  refreshSec: number
  updated: string
  online: boolean
}

interface Agency {
  source: string
  host: string
  agency: string
  attribution: string
  pageUrl: string
}

const AGENCIES: Record<string, Agency> = {
  ga: { source: 'ga', host: '511ga.org', agency: 'Georgia 511', attribution: 'Georgia 511 / GDOT', pageUrl: 'https://511ga.org/' },
  fl: { source: 'fl', host: 'fl511.com', agency: 'FL511', attribution: 'FL511', pageUrl: 'https://fl511.com/' },
  wi: { source: 'wi', host: '511wi.gov', agency: 'Wisconsin 511', attribution: 'Wisconsin 511', pageUrl: 'https://511wi.gov/' },
  az: { source: 'az', host: 'az511.gov', agency: 'AZ511', attribution: 'AZ511', pageUrl: 'https://az511.gov/' },
  on: { source: 'on', host: '511on.ca', agency: 'Ontario 511', attribution: 'Ontario 511', pageUrl: 'https://511on.ca/' },
  pa: { source: 'pa', host: 'www.511pa.com', agency: '511PA', attribution: '511PA', pageUrl: 'https://www.511pa.com/' },
  ne: { source: 'ne', host: 'www.newengland511.org', agency: 'New England 511', attribution: 'New England 511', pageUrl: 'https://www.newengland511.org/' },
  ut: { source: 'ut', host: 'www.udottraffic.utah.gov', agency: 'UDOT', attribution: 'UDOT Traffic', pageUrl: 'https://www.udottraffic.utah.gov/' },
}

function num(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN
  return Number.isFinite(n) ? n : null
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : ''
}

function point(lat: number | null, lon: number | null): boolean {
  return lat != null && lon != null && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180
}

function refreshSec(value: unknown, fallback: number): number {
  const n = num(value)
  if (n == null || n <= 0) return fallback
  return Math.max(3, Math.min(3600, Math.round(n)))
}

function absUrl(host: string, path: string): string {
  if (!path) return ''
  if (/^https?:\/\//i.test(path)) return path
  if (path.startsWith('//')) return `https:${path}`
  return `https://${host}${path.startsWith('/') ? '' : '/'}${path}`
}

function record(row: unknown): Record<string, unknown> {
  return row && typeof row === 'object' ? row as Record<string, unknown> : {}
}

function cam(partial: Omit<TrafficCam, 'online'> & { online?: boolean }): TrafficCam {
  return { ...partial, online: partial.online !== false }
}

export function parseTfl(body: unknown): TrafficCam[] {
  if (!Array.isArray(body)) return []
  const out: TrafficCam[] = []
  for (const item of body) {
    const row = record(item)
    const lat = num(row.lat)
    const lon = num(row.lon)
    if (lat == null || lon == null || !point(lat, lon)) continue
    const props: Record<string, string> = {}
    if (Array.isArray(row.additionalProperties)) {
      for (const entry of row.additionalProperties) {
        const prop = record(entry)
        const key = str(prop.key)
        if (key) props[key] = str(prop.value)
      }
    }
    const imageUrl = props.imageUrl || ''
    const videoUrl = props.videoUrl || ''
    const available = props.available !== 'false'
    const name = str(row.commonName) || str(row.id) || 'JamCam'
    out.push(cam({
      id: `cam:tfl:${str(row.id) || name}`,
      name,
      road: name,
      direction: props.view || '',
      lat,
      lon,
      source: 'tfl',
      agency: 'Transport for London',
      attribution: 'Transport for London JamCam',
      imageUrl,
      videoUrl: available ? videoUrl : '',
      pageUrl: 'https://www.tfl.gov.uk/traffic/status/',
      mode: available ? feedMode(videoUrl, imageUrl, false) : imageUrl ? 'snapshot' : 'offline',
      refreshSec: 60,
      updated: '',
      online: available,
    }))
  }
  return out
}

export function parseCaltrans(body: unknown): TrafficCam[] {
  const root = record(body)
  const rows = Array.isArray(root.data) ? root.data : Array.isArray(body) ? body : []
  const out: TrafficCam[] = []
  for (const item of rows) {
    const wrap = record(item)
    const cctv = record(wrap.cctv ?? item)
    const loc = record(cctv.location)
    const image = record(cctv.imageData)
    const still = record(image.static)
    const stamp = record(cctv.recordTimestamp)
    const lat = num(loc.latitude)
    const lon = num(loc.longitude)
    if (lat == null || lon == null || !point(lat, lon)) continue
    const imageUrl = str(still.currentImageURL)
    const videoUrl = str(image.streamingVideoURL)
    const name = str(loc.locationName) || str(loc.nearbyPlace) || 'Caltrans CCTV'
    const updated = [str(stamp.recordDate), str(stamp.recordTime)].filter(Boolean).join(' ')
    out.push(cam({
      id: `cam:ca:${lat.toFixed(5)}:${lon.toFixed(5)}`,
      name,
      road: str(loc.route),
      direction: str(loc.direction),
      lat,
      lon,
      source: 'caltrans',
      agency: 'Caltrans',
      attribution: 'Caltrans',
      imageUrl,
      videoUrl,
      pageUrl: 'https://cwwp2.dot.ca.gov/',
      mode: feedMode(videoUrl, imageUrl, false),
      refreshSec: refreshSec(still.currentImageUpdateFrequency, 5),
      updated,
    }))
  }
  return out
}

export function parseNyc(body: unknown): TrafficCam[] {
  const root = record(body)
  const rows = Array.isArray(body) ? body : Array.isArray(root.cameras) ? root.cameras : []
  const out: TrafficCam[] = []
  for (const item of rows) {
    const row = record(item)
    const lat = num(row.latitude)
    const lon = num(row.longitude)
    if (lat == null || lon == null || !point(lat, lon)) continue
    const online = str(row.isOnline) !== 'false' && row.isOnline !== false
    const imageUrl = str(row.imageUrl)
    const name = str(row.name) || str(row.id) || 'NYC DOT camera'
    out.push(cam({
      id: `cam:nyc:${str(row.id) || name}`,
      name,
      road: str(row.area) || name,
      direction: '',
      lat,
      lon,
      source: 'nyc',
      agency: 'NYC DOT',
      attribution: 'NYC DOT',
      imageUrl,
      videoUrl: '',
      pageUrl: 'https://webcams.nyctmc.org/',
      mode: imageUrl ? 'snapshot' : 'offline',
      refreshSec: 5,
      updated: '',
      online,
    }))
  }
  return out
}

export function parseFi(body: unknown): TrafficCam[] {
  const root = record(body)
  const features = Array.isArray(root.features) ? root.features : []
  const out: TrafficCam[] = []
  for (const item of features) {
    const feature = record(item)
    const geometry = record(feature.geometry)
    const coords = Array.isArray(geometry.coordinates) ? geometry.coordinates : []
    const lon = num(coords[0])
    const lat = num(coords[1])
    if (lat == null || lon == null || !point(lat, lon)) continue
    const props = record(feature.properties)
    const presets = Array.isArray(props.presets) ? props.presets : []
    const station = str(props.name) || str(props.id) || 'Digitraffic'
    const updated = str(props.dataUpdatedTime)
    const interval = refreshSec(props.collectionInterval, 600)
    for (const preset of presets) {
      const view = record(preset)
      if (view.inCollection === false) continue
      const presetId = str(view.id)
      if (!presetId) continue
      const imageUrl = `https://weathercam.digitraffic.fi/${presetId}.jpg`
      out.push(cam({
        id: `cam:fi:${presetId}`,
        name: `${station} ${presetId}`,
        road: station,
        direction: str(view.presentationName) || str(view.direction),
        lat,
        lon,
        source: 'fi',
        agency: 'Fintraffic',
        attribution: 'Fintraffic / Digitraffic',
        imageUrl,
        videoUrl: '',
        pageUrl: 'https://www.digitraffic.fi/',
        mode: 'snapshot',
        refreshSec: interval,
        updated,
      }))
    }
  }
  return out
}

function pointWkt(text: string): { lat: number; lon: number } | null {
  const match = /POINT\s*\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)/i.exec(text)
  if (!match) return null
  const lon = Number(match[1])
  const lat = Number(match[2])
  return point(lat, lon) ? { lat, lon } : null
}

export function parse511(body: unknown, source: string): TrafficCam[] {
  const agency = AGENCIES[source]
  if (!agency) return []
  const root = record(body)
  const host = str(root.host) || agency.host
  const rows = Array.isArray(root.data) ? root.data : []
  const out: TrafficCam[] = []
  for (const item of rows) {
    const row = record(item)
    const latLng = record(row.latLng)
    const geography = record(latLng.geography)
    const at = pointWkt(str(geography.wellKnownText))
    if (!at) continue
    const images = Array.isArray(row.images) ? row.images : []
    for (const image of images) {
      const view = record(image)
      if (view.disabled === true) continue
      const imageUrl = absUrl(host, str(view.imageUrl))
      const videoUrl = str(view.videoUrl)
      const auth = view.isVideoAuthRequired === true || view.videoDisabled === true || view.blocked === true
      const id = str(view.id) || str(row.id)
      if (!id) continue
      const name = str(view.description) || str(row.location) || str(row.roadway) || id
      out.push(cam({
        id: `cam:${source}:${id}`,
        name,
        road: str(row.roadway),
        direction: str(row.direction),
        lat: at.lat,
        lon: at.lon,
        source,
        agency: agency.agency,
        attribution: agency.attribution,
        imageUrl,
        videoUrl: auth ? '' : videoUrl,
        pageUrl: agency.pageUrl,
        mode: feedMode(videoUrl, imageUrl, auth, str(view.videoType)),
        refreshSec: 60,
        updated: '',
      }))
    }
  }
  return out
}

export function parseWindy(body: unknown): TrafficCam[] {
  const root = record(body)
  const rows = Array.isArray(root.webcams) ? root.webcams : []
  const out: TrafficCam[] = []
  for (const item of rows) {
    const row = record(item)
    const location = record(row.location)
    const lat = num(location.latitude)
    const lon = num(location.longitude)
    if (lat == null || lon == null || !point(lat, lon)) continue
    const images = record(row.images)
    const current = record(images.current)
    const urls = record(row.urls)
    const imageUrl = str(current.preview) || str(current.thumbnail)
    const name = str(row.title) || str(row.webcamId) || 'Windy webcam'
    out.push(cam({
      id: `cam:windy:${str(row.webcamId) || name}`,
      name,
      road: str(location.city),
      direction: '',
      lat,
      lon,
      source: 'windy',
      agency: 'Windy',
      attribution: 'Windy webcams',
      imageUrl,
      videoUrl: '',
      pageUrl: str(urls.detail) || 'https://www.windy.com/',
      mode: imageUrl ? 'snapshot' : 'offline',
      refreshSec: 600,
      updated: '',
    }))
  }
  return out
}

export function parseWsdot(body: unknown): TrafficCam[] {
  const root = record(body)
  const rows = Array.isArray(root.Cameras) ? root.Cameras : Array.isArray(body) ? body : []
  const out: TrafficCam[] = []
  for (const item of rows) {
    const row = record(item)
    const lat = num(row.DisplayLatitude)
    const lon = num(row.DisplayLongitude)
    if (lat == null || lon == null || !point(lat, lon)) continue
    const imageUrl = str(row.ImageURL)
    const name = str(row.Title) || str(row.CameraID) || 'WSDOT camera'
    out.push(cam({
      id: `cam:wsdot:${str(row.CameraID) || name}`,
      name,
      road: str(row.RoadName),
      direction: '',
      lat,
      lon,
      source: 'wsdot',
      agency: 'WSDOT',
      attribution: 'WSDOT',
      imageUrl,
      videoUrl: '',
      pageUrl: 'https://wsdot.com/travel/real-time/cameras',
      mode: imageUrl ? 'snapshot' : 'offline',
      refreshSec: 60,
      updated: '',
    }))
  }
  return out
}

export function parseOhgo(body: unknown): TrafficCam[] {
  const root = record(body)
  const rows = Array.isArray(root.results) ? root.results : []
  const out: TrafficCam[] = []
  for (const item of rows) {
    const row = record(item)
    const lat = num(row.latitude)
    const lon = num(row.longitude)
    if (lat == null || lon == null || !point(lat, lon)) continue
    const views = Array.isArray(row.cameraViews) ? row.cameraViews : [null]
    views.forEach((view, index) => {
      const shot = record(view)
      const imageUrl = str(shot.largeUrl) || str(shot.url) || str(shot.smallUrl)
      const name = str(row.location) || str(row.id) || 'OHGO camera'
      out.push(cam({
        id: `cam:ohgo:${str(row.id) || name}:${index}`,
        name: views.length > 1 ? `${name} ${index + 1}` : name,
        road: name,
        direction: str(row.direction),
        lat,
        lon,
        source: 'ohgo',
        agency: 'OHGO',
        attribution: 'OHGO',
        imageUrl,
        videoUrl: '',
        pageUrl: 'https://ohgo.com/',
        mode: imageUrl ? 'snapshot' : 'offline',
        refreshSec: 60,
        updated: '',
      }))
    })
  }
  return out
}

export function parseFeed(id: string, body: unknown): TrafficCam[] {
  if (id === 'tfl') return parseTfl(body)
  if (id === 'caltrans') return parseCaltrans(body)
  if (id === 'nyc') return parseNyc(body)
  if (id === 'fi') return parseFi(body)
  if (id === 'windy') return parseWindy(body)
  if (id === 'wsdot') return parseWsdot(body)
  if (id === 'ohgo') return parseOhgo(body)
  if (AGENCIES[id]) return parse511(body, id)
  return []
}
