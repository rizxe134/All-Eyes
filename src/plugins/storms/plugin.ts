import type { AllEyesPlugin, Contact } from '../../core/types'
import { getJson } from '../../net/http'
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
            const contacts: Contact[] = fixes.map((fix) => ({
              id: `storm:${fix.id}`,
              layerId: LAYER,
              kind: 'storm',
              lat: fix.lat,
              lon: fix.lon,
              altKm: 0,
              heading: 0,
              label: `${fix.name} ${fix.classification}`,
              detail: `${fix.name}\n${fix.classification} ${fix.intensity}KT\nMOVE ${fix.movement}\nNHC`,
              brightness: 1,
              shape: 'ring',
              scale: 2.4,
            }))
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
