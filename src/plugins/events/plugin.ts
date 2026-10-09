import { formatCard } from '../../core/cards'
import type { AllEyesPlugin, Contact } from '../../core/types'
import { getJson, getText } from '../../net/http'
import { eventSprite } from '../markers/sprites'
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
              const card = [
                { k: 'NAME', v: fix.title },
                { k: 'KIND', v: fix.category },
                { k: 'TIME', v: fix.time ? new Date(fix.time).toISOString().slice(0, 16) + 'Z' : '' },
              ]
              contacts.push({
                id: `event:${fix.id}`,
                layerId: LAYER,
                kind: 'event',
                lat: fix.lat,
                lon: fix.lon,
                altKm: 0,
                heading: 0,
                label: fix.title,
                detail: formatCard(card),
                brightness: /fire|volcano/i.test(fix.category) ? 0.85 : 0.5,
                shape: eventSprite(fix.category),
                scale: /volcano/i.test(fix.category) ? 1.05 : 0.85,
                time: fix.time,
                card,
              })
            }
          } catch (err) {
            ctx.log(LAYER, err instanceof Error ? err.message : 'EONET FAULT')
          }
          if (!firmsOff) try {
            const fires = parseFirms(await getText('/api/firms/hotspots', ctx.settings, ctx.signal))
            fires.forEach((fire, index) => {
              const card = [
                { k: 'KIND', v: 'WILDFIRE' },
                { k: 'FRP', v: fire.frp.toFixed(1) },
                { k: 'TIME', v: fire.when },
              ]
              contacts.push({
                id: `fire:${index}:${fire.lat.toFixed(2)}:${fire.lon.toFixed(2)}`,
                layerId: LAYER,
                kind: 'event',
                lat: fire.lat,
                lon: fire.lon,
                altKm: 0,
                heading: 0,
                label: `FIRE ${fire.frp.toFixed(0)}`,
                detail: formatCard(card),
                brightness: Math.min(0.9, 0.4 + fire.frp / 90),
                shape: 'ico-fire',
                scale: 0.62,
                card,
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
