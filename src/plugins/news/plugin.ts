import type { AllEyesPlugin, Contact, LayerContext } from '../../core/types'
import { newsPoints, onNewsPoints } from '../../desk/news-store'

const LAYER = 'news'

export const newsPlugin: AllEyesPlugin = {
  id: 'news',
  name: 'World news',
  version: '4.0.0',
  layers: [
    {
      id: LAYER,
      label: 'NEWS',
      description: 'Geolocated headlines. Off until SHOW ON GLOBE is on. Outlet-country pins are labeled OUTLET COUNTRY.',
      defaultOn: false,
      create(ctx: LayerContext) {
        let stop = () => {}
        const draw = () => {
          const contacts: Contact[] = newsPoints().map((point) => ({
            id: point.id,
            layerId: LAYER,
            kind: 'beacon',
            lat: point.lat,
            lon: point.lon,
            altKm: 0,
            heading: 0,
            label: point.title,
            detail: point.detail,
            brightness: 0.95,
            shape: 'news',
            scale: 1.1,
            card: [
              { k: 'STORY', v: point.title },
              { k: 'SOURCE', v: point.source },
              { k: 'WHERE', v: point.detail },
            ],
          }))
          ctx.publish(LAYER, contacts)
        }
        return {
          setEnabled(on: boolean) {
            stop()
            stop = () => {}
            if (!on) {
              ctx.publish(LAYER, [])
              return
            }
            stop = onNewsPoints(draw)
            draw()
          },
          dispose() {
            stop()
            ctx.publish(LAYER, [])
          },
        }
      },
    },
  ],
}
