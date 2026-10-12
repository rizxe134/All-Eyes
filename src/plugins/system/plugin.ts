import { findCity } from '../../core/cities'
import { parseHex } from '../../core/palette'
import type { AllEyesPlugin, CommandContext } from '../../core/types'

function watchId(): string {
  return `w${Math.random().toString(36).slice(2, 8)}`
}

async function flyQuery(query: string, ctx: CommandContext, range: number): Promise<string> {
  const city = findCity(query)
  if (city) {
    ctx.flyTo(city.lat, city.lon, range)
    ctx.setPin(city.lat, city.lon)
    return `FLY ${city.name}`
  }
  const hit = await ctx.searchPlace(query)
  if (!hit) return `NO FIX "${query.toUpperCase()}"`
  ctx.flyTo(hit.lat, hit.lon, Math.min(range, 1800))
  ctx.setPin(hit.lat, hit.lon)
  return `FLY ${hit.label.toUpperCase()}`
}

export const systemPlugin: AllEyesPlugin = {
  id: 'system',
  name: 'System',
  version: '1.0.0',
  commands: [
    {
      name: 'help',
      usage: 'help',
      summary: 'List verbs',
      run(_args, ctx) {
        return ctx.help()
      },
    },
    {
      name: 'go',
      usage: 'go <query>',
      summary: 'Fly to a place or address',
      async run(args, ctx) {
        const query = args.join(' ').trim()
        if (!query) return 'USAGE: GO <QUERY>'
        return ctx.go(query)
      },
    },
    {
      name: 'fly',
      usage: 'fly <place>',
      summary: 'Fly to a city or place',
      async run(args, ctx) {
        const query = args.join(' ').trim()
        if (!query) return 'USAGE: FLY <PLACE>'
        return flyQuery(query, ctx, 2200)
      },
    },
    {
      name: 'goto',
      usage: 'goto <lat> <lon>',
      summary: 'Fly to coordinates',
      run(args, ctx) {
        const lat = Number(args[0])
        const lon = Number(args[1])
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return 'USAGE: GOTO <LAT> <LON>'
        const range = Number(args[2])
        ctx.flyTo(lat, lon, Number.isFinite(range) ? range : 1600)
        ctx.setPin(lat, lon)
        return `GOTO ${lat.toFixed(2)} ${lon.toFixed(2)}`
      },
    },
    {
      name: 'layer',
      usage: 'layer <id> on|off',
      summary: 'Toggle a layer',
      run(args, ctx) {
        const id = args[0]?.toLowerCase()
        const mode = args[1]?.toLowerCase()
        if (!id || (mode !== 'on' && mode !== 'off')) return 'USAGE: LAYER <ID> ON|OFF'
        if (!ctx.layers().some((layer) => layer.id === id)) return `NO LAYER ${id.toUpperCase()}`
        ctx.setLayer(id, mode === 'on')
        return `${id.toUpperCase()} ${mode.toUpperCase()}`
      },
    },
    {
      name: 'layers',
      usage: 'layers',
      summary: 'Show layer states',
      run(_args, ctx) {
        return ctx.layers().map((layer) => `${layer.on ? 'ON ' : 'OFF'} ${layer.id}`).join('\n')
      },
    },
    {
      name: 'track',
      usage: 'track <name>',
      summary: 'Lock follow cam on a contact',
      run(args, ctx) {
        const query = args.join(' ').trim()
        if (!query) return 'USAGE: TRACK <NAME>'
        const hit = ctx.findContact(query)
        if (!hit) return `NO CONTACT "${query.toUpperCase()}"`
        ctx.track(hit.id)
        ctx.flyTo(hit.lat, hit.lon, Math.max(700, 900 + hit.altKm * 0.2))
        return `LOCK ${hit.label}`
      },
    },
    {
      name: 'drop',
      usage: 'drop',
      summary: 'Release the follow cam',
      run(_args, ctx) {
        ctx.track(null)
        return 'LOCK RELEASED'
      },
    },
    {
      name: 'time',
      usage: 'time live | time <minutes>',
      summary: 'Scrub replay time',
      run(args, ctx) {
        const arg = args[0]?.toLowerCase()
        if (!arg || arg === 'live' || arg === 'now') {
          ctx.setTimeMinutes('live')
          return 'TIME LIVE'
        }
        const minutes = Number(arg)
        if (!Number.isFinite(minutes)) return 'USAGE: TIME LIVE | TIME <-720..360>'
        const clamped = Math.max(-720, Math.min(360, minutes))
        ctx.setTimeMinutes(clamped)
        return `TIME ${clamped > 0 ? '+' : ''}${clamped} MIN`
      },
    },
    {
      name: 'pin',
      usage: 'pin',
      summary: 'Drop the pass pin on the view center',
      run(_args, ctx) {
        const view = ctx.getView()
        ctx.setPin(view.lat, view.lon)
        return `PIN ${view.lat.toFixed(2)} ${view.lon.toFixed(2)}`
      },
    },
    {
      name: 'where',
      usage: 'where',
      summary: 'Print view and pin',
      run(_args, ctx) {
        const view = ctx.getView()
        const pin = ctx.getPin()
        return `VIEW ${view.lat.toFixed(2)} ${view.lon.toFixed(2)} RNG ${Math.round(view.rangeKm)}KM\nPIN ${pin.lat.toFixed(2)} ${pin.lon.toFixed(2)}`
      },
    },
    {
      name: 'watch',
      usage: 'watch quake <mag> | watch flight <callsign> | watch pass <sat> | watch list | watch clear',
      summary: 'Arm or list alert rules',
      run(args, ctx) {
        const kind = args[0]?.toLowerCase()
        if (!kind || kind === 'list') {
          if (!ctx.alerts.rules.length) return 'NO WATCHES'
          return ctx.alerts.rules.map((rule) => `${rule.id} ${rule.kind.toUpperCase()} ${rule.value}`).join('\n')
        }
        if (kind === 'clear') {
          ctx.alerts.clearRules()
          return 'WATCHES CLEARED'
        }
        if (kind === 'drop') {
          const id = args[1]
          if (!id) return 'USAGE: WATCH DROP <ID>'
          ctx.alerts.remove(id)
          return `DROPPED ${id}`
        }
        if (kind === 'quake') {
          const mag = Number(args[1] ?? '5')
          if (!Number.isFinite(mag)) return 'USAGE: WATCH QUAKE <MAG>'
          ctx.alerts.add({ id: watchId(), kind: 'quake', value: String(mag) })
          return `WATCH QUAKE >= ${mag}`
        }
        if (kind === 'flight') {
          const text = args.slice(1).join(' ').trim()
          if (!text) return 'USAGE: WATCH FLIGHT <CALLSIGN>'
          ctx.alerts.add({ id: watchId(), kind: 'flight', value: text.toUpperCase() })
          return `WATCH FLIGHT ${text.toUpperCase()}`
        }
        if (kind === 'pass') {
          const text = args.slice(1).join(' ').trim() || 'ISS'
          ctx.alerts.add({ id: watchId(), kind: 'pass', value: text })
          return `WATCH PASS ${text.toUpperCase()}`
        }
        return 'USAGE: WATCH QUAKE <MAG> | WATCH FLIGHT <CALLSIGN> | WATCH PASS <SAT> | WATCH LIST | WATCH CLEAR'
      },
    },
    {
      name: 'size',
      usage: 'size <0.2-1.6|up|down>',
      summary: 'Global marker size',
      run(args, ctx) {
        const current = ctx.getMarkerSize()
        const arg = (args[0] ?? '').toLowerCase()
        let next = current
        if (!arg) return `SIZE ${current.toFixed(2)}`
        if (arg === 'up') next = current + 0.1
        else if (arg === 'down') next = current - 0.1
        else next = Number(arg)
        if (!Number.isFinite(next)) return 'USAGE: SIZE <0.2-1.6|UP|DOWN>'
        ctx.setMarkerSize(next)
        return `SIZE ${ctx.getMarkerSize().toFixed(2)}`
      },
    },
    {
      name: 'colors',
      usage: 'colors [mono|color|reset|<layer> <#hex|clear>]',
      summary: 'Category marker colours, or the old phosphor',
      run(args, ctx) {
        const head = (args[0] ?? '').toLowerCase()
        if (!head) return `COLORS ${ctx.getMarkerStyle().toUpperCase()}`
        if (head === 'mono' || head === 'color') {
          ctx.setMarkerStyle(head)
          return `COLORS ${head.toUpperCase()}`
        }
        if (head === 'reset') {
          ctx.clearColorOverrides()
          return 'COLORS RESET'
        }
        const layerId = head
        const known = ctx.layers().some((layer) => layer.id === layerId)
        if (!known) return `NO LAYER ${layerId.toUpperCase()}`
        const paint = (args[1] ?? '').toLowerCase()
        if (!paint) return 'USAGE: COLORS <LAYER> <#RRGGBB|CLEAR>'
        if (paint === 'clear') {
          ctx.setColorOverride(layerId, null)
          return `COLORS ${layerId.toUpperCase()} CLEAR`
        }
        const hex = parseHex(paint)
        if (!hex) return 'USAGE: COLORS <LAYER> <#RRGGBB|CLEAR>'
        ctx.setColorOverride(layerId, hex)
        return `COLORS ${layerId.toUpperCase()} ${hex.toUpperCase()}`
      },
    },
    {
      name: 'radar',
      usage: 'radar [on|off]',
      summary: 'Show or hide the corner radar',
      run(args, ctx) {
        const arg = (args[0] ?? '').toLowerCase()
        if (!arg || arg === 'toggle') return ctx.setRadar(!ctx.radarOn()) ? 'RADAR ON' : 'RADAR OFF'
        if (arg === 'on' || arg === 'show') return ctx.setRadar(true) ? 'RADAR ON' : 'RADAR OFF'
        if (arg === 'off' || arg === 'hide') return ctx.setRadar(false) ? 'RADAR ON' : 'RADAR OFF'
        return 'USAGE: RADAR [ON|OFF]'
      },
    },
    {
      name: 'theme',
      usage: 'theme <color|green>',
      summary: 'Natural-color globe or green phosphor',
      run(args, ctx) {
        const arg = (args[0] ?? '').toLowerCase()
        if (!arg) return `THEME ${ctx.getTheme().toUpperCase()}`
        if (arg !== 'color' && arg !== 'green') return 'USAGE: THEME <COLOR|GREEN>'
        ctx.setTheme(arg)
        return `THEME ${ctx.getTheme().toUpperCase()}`
      },
    },
    {
      name: 'crt',
      usage: 'crt <0-1|on|off|up|down>',
      summary: 'Globe CRT intensity',
      run(args, ctx) {
        const current = ctx.getCrt()
        const arg = (args[0] ?? '').toLowerCase()
        if (!arg) return `CRT ${current.toFixed(2)}`
        let next = current
        if (arg === 'on') next = current > 0.05 ? current : 0.4
        else if (arg === 'off') next = 0
        else if (arg === 'up') next = current + 0.1
        else if (arg === 'down') next = current - 0.1
        else next = Number(arg)
        if (!Number.isFinite(next)) return 'USAGE: CRT <0-1|ON|OFF|UP|DOWN>'
        ctx.setCrt(next)
        return `CRT ${ctx.getCrt().toFixed(2)}`
      },
    },
    {
      name: 'viewer',
      usage: 'viewer [on|off]',
      summary: 'Show or hide the model viewer',
      run(args, ctx) {
        const arg = (args[0] ?? '').toLowerCase()
        if (!arg) {
          ctx.setViewer(!ctx.viewerOpen())
        } else if (arg === 'on' || arg === 'open') {
          ctx.setViewer(true)
        } else if (arg === 'off' || arg === 'shut' || arg === 'hide') {
          ctx.setViewer(false)
        } else {
          return 'USAGE: VIEWER [ON|OFF]'
        }
        return ctx.viewerOpen() ? 'VIEWER ON' : 'VIEWER OFF'
      },
    },
    {
      name: 'mute',
      usage: 'mute',
      summary: 'Toggle 8-bit audio',
      run(_args, ctx) {
        return ctx.toggleMute() ? 'AUDIO MUTED' : 'AUDIO LIVE'
      },
    },
    {
      name: 'shot',
      usage: 'shot',
      summary: 'Save a phosphor frame',
      run(_args, ctx) {
        ctx.screenshot()
        return 'FRAME SAVED'
      },
    },
    {
      name: 'link',
      usage: 'link',
      summary: 'Copy a share link for this view',
      async run(_args, ctx) {
        const url = await ctx.copyLink()
        return `LINK ${url}`
      },
    },
  ],
}
