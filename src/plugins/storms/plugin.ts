import { formatCard } from '../../core/cards'
import type { AllEyesPlugin, Contact } from '../../core/types'
import { getJson } from '../../net/http'
import '../markers/sprites'
import { parseStorms } from './parse'

const LAYER = 'storms'

export const stormPlugin: AllEyesPlugin = {
  id: 'storms',
  name: 'Storms',
  version: '1.0.0',
  layers: [
    {
      id: LAYER,
      label: 'STORMS',
      description: 'Active tropical cyclones from the National Hurricane Center.',
      defaultOn: true,
      create(ctx) {
        let timer = 0
        let on = false
        const tick = async () => {
          if (!on || ctx.signal.aborted) return
          try {
            const fixes = parseStorms(await getJson('/api/nhc/storms', ctx.settings, ctx.signal))
            const contacts: Contact[] = fixes.map((fix) => {
              const card = [
                { k: 'NAME', v: fix.name },
                { k: 'CLS', v: fix.classification },
                { k: 'WIND', v: fix.intensity ? `${fix.intensity} KT` : '' },
                { k: 'MOVE', v: fix.movement },
              ]
              return {
                id: `storm:${fix.id}`,
                layerId: LAYER,
                kind: 'storm' as const,
                lat: fix.lat,
                lon: fix.lon,
                altKm: 0,
                heading: 0,
                label: `${fix.name} ${fix.classification}`,
                detail: formatCard(card),
                brightness: 0.95,
                shape: 'ico-storm',
                scale: 1.15,
                card,
              }
            })
            ctx.publish(LAYER, contacts)
            ctx.log(LAYER, contacts.length ? '' : 'NO ACTIVE CYCLONES')
          } catch (err) {
            ctx.log(LAYER, err instanceof Error ? err.message : 'STORM FEED FAULT')
          }
        }
        return {
          setEnabled(next) {
            if (next === on) return
            on = next
            if (!next) {
              window.clearInterval(timer)
              ctx.publish(LAYER, [])
              return
            }
            void tick()
            timer = window.setInterval(() => void tick(), 5 * 60_000)
          },
          dispose() {
            on = false
            window.clearInterval(timer)
          },
        }
      },
    },
  ],
}
