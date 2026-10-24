import type { AllEyesPlugin, Contact, LayerContext } from '../../core/types'
import { getJson } from '../../net/http'
import './sprites'
import { CLUSTER_RANGE_KM, cardRows, FLOCK_FEED, FLOCK_SOURCE, fromCompact, marksForView, mergeAlpr, parseOverpassAlpr, tilesForView, type Alpr } from './parse'

const LAYER = 'flock'
/** Below this range the view asks Overpass for fresh, fully tagged points per tile. */
const TILE_RANGE_KM = 160

let points = new Map<string, Alpr>()

export function flockPoints(): readonly Alpr[] {
  return [...points.values()]
}

export const flockPlugin: AllEyesPlugin = {
  id: 'flock',
  name: 'ALPR cameras (Flock and others)',
  version: '4.1.0',
  layers: [
    {
      id: LAYER,
      label: 'FLOCK ALPR',
      description: `License-plate reader locations from ${FLOCK_SOURCE}. Location only. Feed: ${FLOCK_FEED}.`,
      defaultOn: false,
      create(ctx: LayerContext) {
        let on = false
        let published = ''
        let viewAt = 0
        let allState: 'idle' | 'loading' | 'done' | 'failed' = 'idle'
        const tiles = new Map<string, 'loading' | 'done' | number>()

        const status = (text: string) => ctx.status?.(LAYER, text)

        const publish = () => {
          if (!on) return
          const view = ctx.globe.getView()
          const contacts = marksForView(points.values(), view).map((m): Contact => ({
            id: m.id,
            layerId: LAYER,
            kind: 'beacon',
            lat: m.lat,
            lon: m.lon,
            altKm: 0,
            heading: 0,
            label: m.label,
            detail: m.detail,
            brightness: m.cluster ? 0.85 : 1,
            shape: 'alpr',
            scale: m.scale,
            card: m.alpr
              ? cardRows(m.alpr)
              : [
                  { k: 'CLUSTER', v: `${m.count} ALPR cameras` },
                  { k: 'FEED', v: FLOCK_FEED },
                  { k: 'SOURCE', v: FLOCK_SOURCE },
                ],
          }))
          const key = contacts.map((c) => c.id).join('|')
          if (key === published) return
          published = key
          ctx.publish(LAYER, contacts)
        }

        const loadAll = () => {
          if (allState === 'loading' || allState === 'done') return
          allState = 'loading'
          status('ALPR LOADING · DeFlock daily')
          void getJson('/api/flock/all', ctx.settings, ctx.signal, 120000)
            .then((body) => {
              const rows = fromCompact(body)
              const merged = mergeAlpr(new Map(rows.map((r) => [r.id, r])), [...points.values()])
              points = merged
              allState = 'done'
              status(`ALPR ${points.size} · ${FLOCK_SOURCE}`)
              published = ''
              publish()
            })
            .catch(() => {
              allState = 'failed'
              status('ALPR OVERVIEW OFFLINE · zoom in for Overpass')
            })
        }

        const loadTiles = () => {
          const view = ctx.globe.getView()
          if (view.rangeKm > TILE_RANGE_KM) return
          for (const t of tilesForView(view)) {
            const state = tiles.get(t.key)
            if (state === 'loading' || state === 'done') continue
            if (typeof state === 'number' && Date.now() < state) continue
            tiles.set(t.key, 'loading')
            void getJson(`/api/flock/area?s=${t.s}&w=${t.w}&n=${t.n}&e=${t.e}`, ctx.settings, ctx.signal, 60000)
              .then((body) => {
                points = mergeAlpr(points, parseOverpassAlpr(body))
                tiles.set(t.key, 'done')
                published = ''
                publish()
              })
              .catch(() => {
                tiles.set(t.key, Date.now() + 60000)
                status('ALPR OVERPASS RATE-LIMITED · retrying')
              })
          }
        }

        const kick = () => {
          if (!on || ctx.signal.aborted) return
          const view = ctx.globe.getView()
          if (view.rangeKm >= CLUSTER_RANGE_KM || allState === 'idle') loadAll()
          loadTiles()
          publish()
        }

        const stopView = ctx.globe.onView(() => {
          if (!on) return
          const now = Date.now()
          if (now - viewAt < 500) return
          viewAt = now
          kick()
        })

        return {
          setEnabled(next) {
            if (next === on) return
            on = next
            published = ''
            if (!next) {
              ctx.publish(LAYER, [])
              return
            }
            kick()
          },
          dispose() {
            on = false
            stopView()
            ctx.publish(LAYER, [])
          },
        }
      },
    },
  ],
}
