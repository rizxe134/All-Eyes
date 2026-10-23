import type { AllEyesPlugin, Contact, LayerContext } from '../../core/types'
import { getJson } from '../../net/http'
import { allCams, installCamDebug, setSourceCams } from './catalog'
import { marksForView } from './feed'
import { parseFeed } from './parse'

const LAYER = 'cameras'

interface Feed {
  id: string
  url: string
  south: number
  west: number
  north: number
  east: number
}

const FEEDS: Feed[] = [
  { id: 'tfl', url: '/api/cams/tfl', south: 51.2, west: -0.6, north: 51.8, east: 0.4 },
  { id: 'caltrans', url: '/api/cams/caltrans', south: 32.4, west: -124.5, north: 42.1, east: -114 },
  { id: 'nyc', url: '/api/cams/nyc', south: 40.4, west: -74.3, north: 41, east: -73.6 },
  { id: 'fi', url: '/api/cams/fi', south: 59.5, west: 19, north: 70.2, east: 31.6 },
  { id: 'ga', url: '/api/cams/511?host=511ga.org', south: 30.3, west: -85.7, north: 35.1, east: -80.8 },
  { id: 'fl', url: '/api/cams/511?host=fl511.com', south: 24.4, west: -87.7, north: 31.1, east: -79.8 },
  { id: 'wi', url: '/api/cams/511?host=511wi.gov', south: 42.4, west: -93, north: 47.1, east: -86.8 },
  { id: 'az', url: '/api/cams/511?host=az511.gov', south: 31.3, west: -114.8, north: 37, east: -109 },
  { id: 'on', url: '/api/cams/511?host=511on.ca', south: 41.6, west: -95.2, north: 56.9, east: -74.3 },
  { id: 'pa', url: '/api/cams/511?host=www.511pa.com', south: 39.7, west: -80.5, north: 42.3, east: -74.7 },
  { id: 'ne', url: '/api/cams/511?host=www.newengland511.org', south: 41, west: -73.5, north: 47.5, east: -67 },
  { id: 'ut', url: '/api/cams/511?host=www.udottraffic.utah.gov', south: 37, west: -114.1, north: 42, east: -109 },
]

function intersects(feed: Feed, view: { lat: number; lon: number; rangeKm: number }): boolean {
  const pad = Math.min(40, (view.rangeKm * 0.62) / 111)
  const south = view.lat - pad
  const north = view.lat + pad
  const west = view.lon - pad
  const east = view.lon + pad
  return !(north < feed.south || south > feed.north || east < feed.west || west > feed.east)
}

export const cameraPlugin: AllEyesPlugin = {
  id: 'cameras',
  name: 'Traffic cameras',
  version: '3.0.0',
  layers: [
    {
      id: LAYER,
      label: 'TRAFFIC CAMS',
      description: 'Public road cameras for the area in view. One feed plays at a time.',
      defaultOn: true,
      create(ctx: LayerContext) {
        installCamDebug()
        let on = false
        let timer = 0
        let published = ''
        let viewAt = 0
        let queueAt = 0
        let windyKey = ''
        let windyCell = ''
        const started = new Set<string>()

        const publish = () => {
          if (!on) {
            if (published) {
              published = ''
              ctx.publish(LAYER, [])
            }
            return
          }
          const view = ctx.globe.getView()
          const contacts = marksForView(allCams(), view).map((mark): Contact => ({
            id: mark.id,
            layerId: LAYER,
            kind: 'cam',
            lat: mark.lat,
            lon: mark.lon,
            altKm: 0,
            heading: 0,
            label: mark.label,
            detail: mark.detail,
            brightness: mark.cluster ? 0.85 : 1,
            shape: 'cam',
            scale: mark.scale,
          }))
          const key = contacts.map((contact) => contact.id).join('|')
          if (key === published) return
          published = key
          ctx.publish(LAYER, contacts)
        }

        const load = (id: string, url: string) => {
          if (started.has(id) || ctx.signal.aborted) return
          started.add(id)
          void getJson(url, ctx.settings, ctx.signal, 90000)
            .then((body) => {
              setSourceCams(id, parseFeed(id, body))
              published = ''
              if (on) publish()
            })
            .catch(() => {
              started.delete(id)
            })
        }

        const loadVisible = () => {
          const view = ctx.globe.getView()
          for (const feed of FEEDS) {
            if (intersects(feed, view)) load(feed.id, feed.url)
          }
          const settings = ctx.settings.get()
          const cell = `${view.lat.toFixed(0)}:${view.lon.toFixed(0)}`
          if (settings.windyKey && (settings.windyKey !== windyKey || cell !== windyCell || !started.has('windy'))) {
            windyKey = settings.windyKey
            windyCell = cell
            started.delete('windy')
            load('windy', `/api/cams/windy?lat=${view.lat.toFixed(3)}&lon=${view.lon.toFixed(3)}`)
          }
          if (settings.wsdotKey) load('wsdot', '/api/cams/wsdot')
          if (settings.ohgoKey) load('ohgo', '/api/cams/ohgo')
        }

        const kick = () => {
          if (!on || ctx.signal.aborted) return
          loadVisible()
          const now = Date.now()
          if (now - queueAt >= 4000) {
            queueAt = now
            const next = FEEDS.find((feed) => !started.has(feed.id))
            if (next) load(next.id, next.url)
          }
          publish()
        }

        const stopView = ctx.globe.onView(() => {
          if (!on) return
          const now = Date.now()
          if (now - viewAt < 400) return
          viewAt = now
          loadVisible()
          publish()
        })

        return {
          setEnabled(next) {
            if (next === on) return
            on = next
            window.clearInterval(timer)
            if (!next) {
              published = ''
              ctx.publish(LAYER, [])
              return
            }
            queueAt = 0
            kick()
            timer = window.setInterval(kick, 2000)
          },
          dispose() {
            on = false
            window.clearInterval(timer)
            stopView()
            ctx.publish(LAYER, [])
          },
        }
      },
    },
  ],
}
