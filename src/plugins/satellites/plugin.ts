import type { AllEyesPlugin, Contact, LayerContext, PluginContext } from '../../core/types'
import { getText } from '../../net/http'
import { displayAltKm } from './alt'
import { formatPass, windowsAbove } from './passes'
import { parseTle, type SatFix } from './parse'
import { buildSatrec, elevationDeg, orbitTrack, periodMinutes, propagateGeodetic } from './propagate'
import type { SatRec } from 'satellite.js'

interface LiveSat {
  fix: SatFix
  satrec: SatRec
}

const cache = new Map<string, LiveSat[]>()
const inflight = new Map<string, Promise<LiveSat[]>>()
let passHost: HTMLElement | null = null

const ALIAS: Record<string, RegExp> = {
  iss: /ISS \(ZARYA\)/i,
  tiangong: /TIANHE|TIANGONG/i,
  css: /TIANHE/i,
  hubble: /HST|HUBBLE/i,
}

function allSats(): LiveSat[] {
  return [...cache.values()].flat()
}

export function findSat(query: string): LiveSat | null {
  const q = query.trim().toLowerCase()
  if (!q) return null
  const alias = ALIAS[q]
  const pool = allSats()
  if (alias) {
    const named = pool.find((sat) => alias.test(sat.fix.name))
    if (named) return named
  }
  const norad = Number(q)
  if (Number.isFinite(norad)) {
    const byId = pool.find((sat) => sat.fix.norad === norad)
    if (byId) return byId
  }
  return (
    pool.find((sat) => sat.fix.name.toLowerCase() === q) ??
    pool.find((sat) => sat.fix.name.toLowerCase().includes(q)) ??
    null
  )
}

async function loadGroup(ctx: LayerContext, group: string): Promise<LiveSat[]> {
  const hit = cache.get(group)
  if (hit) return hit
  let job = inflight.get(group)
  if (!job) {
    job = getText(`/api/celestrak?group=${encodeURIComponent(group)}`, ctx.settings, ctx.signal)
      .then((text) => {
        const live: LiveSat[] = []
        for (const fix of parseTle(text, group)) {
          const satrec = buildSatrec(fix)
          if (satrec) live.push({ fix, satrec })
        }
        cache.set(group, live)
        return live
      })
      .finally(() => inflight.delete(group))
    inflight.set(group, job)
  }
  return job
}

function sample<T>(list: T[], max: number): T[] {
  if (list.length <= max) return list
  const step = list.length / max
  const out: T[] = []
  for (let i = 0; i < max; i++) {
    const item = list[Math.floor(i * step)]
    if (item) out.push(item)
  }
  return out
}

function toContacts(sats: LiveSat[], layerId: string, when: Date): Contact[] {
  const out: Contact[] = []
  for (const sat of sats) {
    const point = propagateGeodetic(sat.satrec, when)
    if (!point) continue
    const station = sat.fix.group === 'stations'
    out.push({
      id: `${layerId}:${sat.fix.norad}`,
      layerId,
      kind: 'sat',
      lat: point.lat,
      lon: point.lon,
      altKm: displayAltKm(point.altKm),
      heading: 0,
      label: sat.fix.name,
      detail: `${sat.fix.name}\nNORAD ${sat.fix.norad}\nTRUE ALT ${Math.round(point.altKm)} KM\nGROUP ${sat.fix.group.toUpperCase()}`,
      brightness: station ? 1 : layerId === 'starlink' ? 0.4 : 0.62,
      shape: 'diamond',
      scale: station ? 1.2 : 0.72,
    })
  }
  return out
}

function predict(sat: LiveSat, lat: number, lon: number, start: number): string {
  const samples: { t: number; el: number }[] = []
  const end = start + 12 * 60 * 60 * 1000
  for (let t = start; t <= end; t += 60_000) {
    const el = elevationDeg(sat.satrec, lat, lon, new Date(t))
    if (el != null) samples.push({ t, el })
  }
  const windows = windowsAbove(samples, 10).slice(0, 4)
  if (!windows.length) return `${sat.fix.name}\nNO PASS ABOVE 10° IN 12H`
  return [sat.fix.name, ...windows.map(formatPass)].join('\n')
}

function trackedSat(getTrackId: () => string | null): LiveSat | null {
  const id = getTrackId()
  if (!id) return findSat('iss')
  const norad = Number(id.split(':')[1])
  return (Number.isFinite(norad) ? findSat(String(norad)) : null) ?? findSat('iss')
}

function paintOrbit(ctx: PluginContext) {
  const id = ctx.getTrackId()
  if (!id || (!id.startsWith('satellites:') && !id.startsWith('starlink:'))) {
    ctx.globe.setOrbit(null)
    return
  }
  const sat = findSat(id.split(':')[1] ?? '')
  if (!sat) {
    ctx.globe.setOrbit(null)
    return
  }
  const minutes = Math.min(periodMinutes(sat.satrec), 180)
  const points = orbitTrack(sat.satrec, ctx.clock.now(), minutes, 96).map((point) => ({
    lat: point.lat,
    lon: point.lon,
    altKm: displayAltKm(point.altKm),
  }))
  ctx.globe.setOrbit(points)
}

function paintPasses(ctx: PluginContext) {
  if (!passHost) return
  const sat = trackedSat(() => ctx.getTrackId())
  if (!sat) {
    passHost.textContent = 'WAITING FOR TLES'
    return
  }
  const pin = ctx.getPin()
  passHost.textContent = predict(sat, pin.lat, pin.lon, ctx.clock.now())
}

function checkPassWatches(ctx: PluginContext) {
  const pin = ctx.getPin()
  const now = new Date()
  for (const rule of ctx.alerts.rules) {
    if (rule.kind !== 'pass') continue
    const sat = findSat(rule.value)
    if (!sat) continue
    const el = elevationDeg(sat.satrec, pin.lat, pin.lon, now)
    if (el != null && el >= 10) {
      ctx.alerts.raise(`pass:${rule.id}:${sat.fix.norad}`, `PASS ${sat.fix.name}`, `ELEV ${el.toFixed(0)}° OVER PIN`)
    }
  }
}

function makeLayer(id: string, label: string, description: string, defaultOn: boolean, wanted: string[], cap: number, extras: boolean) {
  return {
    id,
    label,
    description,
    defaultOn,
    create(ctx: LayerContext) {
      let timer = 0
      let watchTimer = 0
      let on = false
      let loaded: LiveSat[] = []

      const publish = () => {
        ctx.publish(id, toContacts(sample(loaded, cap), id, new Date(ctx.clock.now())))
        if (extras) paintOrbit(ctx)
      }

      const tick = async () => {
        if (!on || ctx.signal.aborted) return
        try {
          const groups = await Promise.all(wanted.map((group) => loadGroup(ctx, group)))
          loaded = groups.flat()
          ctx.log(id, loaded.length ? '' : 'NO TLES')
        } catch (err) {
          ctx.log(id, err instanceof Error ? err.message : 'TLE FAULT')
        }
        publish()
        if (extras) paintPasses(ctx)
      }

      const offClock = ctx.clock.subscribe(() => { if (on) publish() })
      const offTrack = extras ? ctx.onTrack(() => { if (on) { paintOrbit(ctx); paintPasses(ctx) } }) : () => {}
      const offPin = extras ? ctx.onPin(() => { if (on) paintPasses(ctx) }) : () => {}

      return {
        setEnabled(next: boolean) {
          if (next === on) return
          on = next
          window.clearInterval(timer)
          window.clearInterval(watchTimer)
          if (!next) {
            ctx.publish(id, [])
            if (extras) ctx.globe.setOrbit(null)
            return
          }
          void tick()
          timer = window.setInterval(() => publish(), 1000)
          if (extras) {
            watchTimer = window.setInterval(() => {
              checkPassWatches(ctx)
              paintPasses(ctx)
            }, 30000)
          }
        },
        dispose() {
          on = false
          window.clearInterval(timer)
          window.clearInterval(watchTimer)
          offClock()
          offTrack()
          offPin()
          ctx.publish(id, [])
        },
      }
    },
  }
}

export const satellitePlugin: AllEyesPlugin = {
  id: 'satellites',
  name: 'Satellites',
  version: '1.0.0',
  layers: [
    makeLayer(
      'satellites',
      'SATS',
      'Stations, bright visual objects, weather birds, and GNSS. High orbits are pulled inward.',
      true,
      ['stations', 'visual', 'weather', 'gps-ops'],
      2500,
      true,
    ),
    makeLayer(
      'starlink',
      'STAR',
      'A sampled Starlink shell. Off until you arm it.',
      false,
      ['starlink'],
      1200,
      false,
    ),
  ],
  panels: [
    {
      id: 'passes',
      title: 'PASSES',
      mount(host) {
        passHost = host
        host.textContent = 'PIN A SPOT, THEN PASS ISS'
        return () => { passHost = null }
      },
    },
  ],
  commands: [
    {
      name: 'pass',
      usage: 'pass [name]',
      summary: 'Predict satellite passes over the pin',
      run(args, ctx) {
        const query = args.join(' ').trim()
        const sat = query ? findSat(query) : trackedSat(() => ctx.getTrackId()) ?? findSat('iss')
        if (!sat) return 'NO TLE LOADED. ARM SATS AND WAIT.'
        const pin = ctx.getPin()
        return predict(sat, pin.lat, pin.lon, Date.now() + ctx.getTimeMinutes() * 60_000)
      },
    },
  ],
}
