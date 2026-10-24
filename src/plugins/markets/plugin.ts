import type { AllEyesPlugin, Contact, LayerContext } from '../../core/types'
import { EXCHANGES, exchangeStatus } from '../../desk/exchanges'

const LAYER = 'markets'

export const marketsPlugin: AllEyesPlugin = {
  id: 'markets',
  name: 'Stock exchanges',
  version: '4.0.0',
  layers: [
    {
      id: LAYER,
      label: 'STOCK EXCHANGES',
      description: 'Major exchanges with local time and OPEN, CLOSED, PRE, POST, or HOLIDAY from the built-in calendar.',
      defaultOn: true,
      create(ctx: LayerContext) {
        let timer = 0
        const draw = () => {
          const now = new Date()
          const contacts: Contact[] = EXCHANGES.map((ex) => {
            const session = exchangeStatus(ex, now)
            const note = session.note ? `${session.status} · ${session.note}` : session.status
            return {
              id: `ex:${ex.id}`,
              layerId: LAYER,
              kind: 'beacon',
              lat: ex.lat,
              lon: ex.lon,
              altKm: 0,
              heading: 0,
              label: ex.name,
              detail: `${note} ${session.localTime} ${ex.city}`,
              brightness: session.status === 'OPEN' ? 1 : 0.72,
              shape: 'exchange',
              scale: 1.15,
              card: [
                { k: 'EXCHANGE', v: ex.name },
                { k: 'MIC', v: ex.mic },
                { k: 'CITY', v: ex.city },
                { k: 'LOCAL', v: `${session.localDate} ${session.localTime}` },
                { k: 'STATUS', v: note },
              ],
            }
          })
          ctx.publish(LAYER, contacts)
        }
        return {
          setEnabled(on: boolean) {
            clearInterval(timer)
            timer = 0
            if (!on) {
              ctx.publish(LAYER, [])
              return
            }
            draw()
            timer = setInterval(draw, 60000) as unknown as number
          },
          dispose() {
            clearInterval(timer)
            ctx.publish(LAYER, [])
          },
        }
      },
    },
  ],
}
