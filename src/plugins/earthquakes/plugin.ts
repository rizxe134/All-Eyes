import { ageLabel, formatCard } from '../../core/cards'
import type { AllEyesPlugin, Contact, LayerContext } from '../../core/types'
import { getJson } from '../../net/http'
import '../markers/sprites'
import { parseQuakes, type QuakeFix } from './parse'

const LAYER = 'quakes'

function toContact(fix: QuakeFix, now: number): Contact {
  const mag = fix.mag
  const card = [
    { k: 'MAG', v: mag.toFixed(1) },
    { k: 'DEP', v: `${fix.depthKm.toFixed(0)} KM` },
    { k: 'TIME', v: new Date(fix.time).toISOString().slice(0, 16) + 'Z' },
    { k: 'AGE', v: ageLabel(fix.time, now) },
    { k: 'AT', v: fix.place },
  ]
  return {
    id: `quake:${fix.id}`,
    layerId: LAYER,
    kind: 'quake',
    lat: fix.lat,
    lon: fix.lon,
    altKm: 0,
    heading: 0,
    label: `M${mag.toFixed(1)} ${fix.place}`,
    detail: formatCard(card),
    brightness: Math.min(1, 0.35 + mag / 9),
    shape: 'ico-quake',
    scale: 0.85 + Math.min(0.55, mag * 0.08),
    time: fix.time,
    mag,
    card,
  }
}

export const earthquakePlugin: AllEyesPlugin = {
  id: 'earthquakes',
  name: 'Earthquakes',
  version: '1.0.0',
  layers: [
    {
      id: LAYER,
      label: 'QUAKES',
      description: 'USGS magnitude 2.5+ today and 4.5+ this week.',
      defaultOn: true,
      create(ctx: LayerContext) {
        let timer = 0
        let on = false
        let fixes: QuakeFix[] = []

        const publish = () => {
          const sim = ctx.clock.now()
          ctx.publish(LAYER, fixes.filter((fix) => fix.time <= sim + 60_000 && fix.time >= sim - 8 * 86400_000).map((fix) => toContact(fix, sim)))
        }

        const tick = async () => {
          if (!on || ctx.signal.aborted) return
          try {
            const [day, week] = await Promise.all([
              getJson('/api/usgs/quakes?feed=2.5_day', ctx.settings, ctx.signal).then(parseQuakes),
              getJson('/api/usgs/quakes?feed=4.5_week', ctx.settings, ctx.signal).then(parseQuakes),
            ])
            const merged = new Map<string, QuakeFix>()
            for (const fix of [...week, ...day]) merged.set(fix.id, fix)
            fixes = [...merged.values()]
            ctx.log(LAYER, '')
          } catch (err) {
            ctx.log(LAYER, err instanceof Error ? err.message : 'QUAKE FEED FAULT')
          }
          publish()
        }

        const off = ctx.clock.subscribe(() => { if (on) publish() })
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
            timer = window.setInterval(() => void tick(), 60_000)
          },
          dispose() {
            on = false
            window.clearInterval(timer)
            off()
          },
        }
      },
    },
  ],
}
