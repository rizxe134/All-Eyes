import { formatCard } from '../../core/cards'
import type { AllEyesPlugin, Contact } from '../../core/types'
import { getJson } from '../../net/http'
import { parseLaunches } from './parse'

const LAYER = 'launches'

export const launchPlugin: AllEyesPlugin = {
  id: 'launches',
  name: 'Launches',
  version: '1.0.0',
  layers: [
    {
      id: LAYER,
      label: 'LAUNCH',
      description: 'Upcoming orbital launches from The Space Devs.',
      defaultOn: true,
      create(ctx) {
        let timer = 0
        let on = false
        const tick = async () => {
          if (!on || ctx.signal.aborted) return
          try {
            const fixes = parseLaunches(await getJson('/api/launches', ctx.settings, ctx.signal))
            const now = Date.now()
            const contacts: Contact[] = fixes.map((fix) => {
              const soon = fix.net > 0 && fix.net - now < 48 * 3600_000
              const vehicle = fix.name.split('|')[0]?.trim() || fix.name
              const card = [
                { k: 'VEH', v: vehicle },
                { k: 'PAD', v: fix.pad },
                { k: 'NET', v: fix.net ? new Date(fix.net).toISOString().slice(0, 16) + 'Z' : '' },
                { k: 'STAT', v: fix.status },
              ]
              return {
                id: `launch:${fix.id}`,
                layerId: LAYER,
                kind: 'launch' as const,
                lat: fix.lat,
                lon: fix.lon,
                altKm: 0,
                heading: 0,
                label: fix.name,
                detail: formatCard(card),
                brightness: soon ? 0.95 : 0.5,
                shape: 'ico-launch',
                scale: soon ? 1.1 : 0.85,
                time: fix.net,
                card,
              }
            })
            ctx.publish(LAYER, contacts)
            ctx.log(LAYER, '')
          } catch (err) {
            ctx.log(LAYER, err instanceof Error ? err.message : 'LAUNCH FEED FAULT')
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
            timer = window.setInterval(() => void tick(), 10 * 60_000)
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
