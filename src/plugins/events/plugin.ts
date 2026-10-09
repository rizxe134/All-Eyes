import type { AllEyesPlugin, Contact } from '../../core/types'
import { getJson, getText } from '../../net/http'
import { parseEonet, parseFirms } from './parse'

const LAYER = 'events'

export const eventPlugin: AllEyesPlugin = {
  id: 'events',
  name: 'Events',
  version: '1.0.0',
  layers: [
    {
      id: LAYER,
      label: 'EVENTS',
      description: 'NASA EONET natural events. A FIRMS key adds fire hotspots.',
      defaultOn: true,
      create(ctx) {
        let timer = 0
        let on = false
        let firmsOff = false
        const wakeFirms = ctx.settings.subscribe(() => { firmsOff = false })
        const tick = async () => {
          if (!on || ctx.signal.aborted) return
          const contacts: Contact[] = []
          try {
            const events = parseEonet(await getJson('/api/eonet/events', ctx.settings, ctx.signal))
            for (const fix of events) {
              contacts.push({
                id: `event:${fix.id}`,
                layerId: LAYER,
                kind: 'event',
                lat: fix.lat,
                lon: fix.lon,
                altKm: 0,
                heading: 0,
                label: fix.title,
                detail: `${fix.title}\n${fix.category}\n${fix.time ? new Date(fix.time).toISOString().slice(0, 16) + 'Z' : 'EONET'}`,
                brightness: /fire|volcano/i.test(fix.category) ? 0.95 : 0.6,
                shape: 'drop',
                scale: /volcano/i.test(fix.category) ? 1.3 : 0.9,
                time: fix.time,
              })
            }
          } catch (err) {
            ctx.log(LAYER, err instanceof Error ? err.message : 'EONET FAULT')
          }
          if (!firmsOff) try {
            const fires = parseFirms(await getText('/api/firms/hotspots', ctx.settings, ctx.signal))
            fires.forEach((fire, index) => {
              contacts.push({
                id: `fire:${index}:${fire.lat.toFixed(2)}:${fire.lon.toFixed(2)}`,
                layerId: LAYER,
                kind: 'event',
                lat: fire.lat,
                lon: fire.lon,
                altKm: 0,
                heading: 0,
                label: `FIRE ${fire.frp.toFixed(0)}`,
                detail: `FIRMS FRP ${fire.frp.toFixed(1)}\n${fire.when}`,
                brightness: Math.min(1, 0.45 + fire.frp / 80),
                shape: 'drop',
                scale: 0.55,
              })
            })
          } catch {
            firmsOff = true
          }
          ctx.publish(LAYER, contacts)
          if (contacts.length) ctx.log(LAYER, '')
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
            wakeFirms()
          },
        }
      },
    },
  ],
}
