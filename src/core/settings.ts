import { parseBasemapMode, parseBasemapSource } from '../city/basemap'
import { applyPalette, parseHex } from './palette'
import type { GlobeTheme, MarkerStyle, Settings, SettingsStore as SettingsApi, SpeedUnit } from './types'

const KEY = 'alleyes.settings.v1'

export const MARKER_MIN = 0.2
export const MARKER_MAX = 1.6
export const MARKER_DEFAULT = 0.45
export const CRT_DEFAULT = 0.4

const EMPTY: Settings = {
  mute: false,
  openskyId: '',
  openskySecret: '',
  firmsKey: '',
  aisstreamKey: '',
  maptilerKey: '',
  mapboxKey: '',
  tomtomKey: '',
  hereKey: '',
  windyKey: '',
  wsdotKey: '',
  ohgoKey: '',
  newsApiKey: '',
  gnewsKey: '',
  finnhubKey: '',
  twelveKey: '',
  alphaKey: '',
  polygonKey: '',
  fmpKey: '',
  watchlist: [],
  detectConf: 0.45,
  detectCams: [],
  basemap: 'hybrid',
  basemapSource: 'free',
  markerSize: MARKER_DEFAULT,
  theme: 'color',
  crt: CRT_DEFAULT,
  speedUnit: 'kt',
  markerStyle: 'color',
  colorOverrides: {},
  radar: true,
}

function speedUnit(value: unknown): SpeedUnit {
  if (value === 'mph' || value === 'kmh' || value === 'kt') return value
  return 'kt'
}

function markerSize(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return EMPTY.markerSize
  return Math.min(MARKER_MAX, Math.max(MARKER_MIN, n))
}

function themeOf(value: unknown): GlobeTheme | null {
  if (value === 'green' || value === 'color') return value
  return null
}

function crtOf(value: unknown): number | null {
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  return Math.min(1, Math.max(0, n))
}

function styleOf(value: unknown): MarkerStyle {
  return value === 'mono' ? 'mono' : 'color'
}

export function detectConfOf(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0.45
  return Math.min(0.9, Math.max(0.2, Math.round(n * 20) / 20))
}

function watchlistOf(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  for (const item of value) {
    const text = String(item ?? '').trim().toUpperCase()
    if (!/^[A-Z0-9.^]{1,16}$/.test(text)) continue
    if (out.includes(text)) continue
    out.push(text)
    if (out.length >= 40) break
  }
  return out
}

function detectCamsOf(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  for (const item of value) {
    if (typeof item !== 'string' || !item.startsWith('cam:') || item.length > 96) continue
    if (out.includes(item)) continue
    out.push(item)
    if (out.length >= 40) break
  }
  return out
}

function overridesOf(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!/^[a-z0-9-]{2,24}$/i.test(key)) continue
    const hex = parseHex(String(raw ?? ''))
    if (hex) out[key] = hex
  }
  return out
}

export class SettingsStore implements SettingsApi {
  private state: Settings
  private listeners = new Set<() => void>()

  constructor() {
    this.state = { ...EMPTY, detectCams: [], watchlist: [] }
    try {
      const raw = localStorage.getItem(KEY)
      if (raw) {
      const parsed = JSON.parse(raw) as Partial<Settings>
      const theme = themeOf(parsed.theme)
      const crt = crtOf(parsed.crt)
      // v1.3 stored 0.7 as the untouched default. Treat that sentinel as the new small default
      // until the operator saves a theme or a CRT value.
      const legacySize = theme == null && crt == null && Number(parsed.markerSize) === 0.7
      this.state = {
        mute: Boolean(parsed.mute),
        openskyId: String(parsed.openskyId ?? ''),
        openskySecret: String(parsed.openskySecret ?? ''),
        firmsKey: String(parsed.firmsKey ?? ''),
        aisstreamKey: String(parsed.aisstreamKey ?? ''),
        maptilerKey: String(parsed.maptilerKey ?? ''),
        mapboxKey: String(parsed.mapboxKey ?? ''),
        tomtomKey: String(parsed.tomtomKey ?? ''),
        hereKey: String(parsed.hereKey ?? ''),
        windyKey: String(parsed.windyKey ?? ''),
        wsdotKey: String(parsed.wsdotKey ?? ''),
        ohgoKey: String(parsed.ohgoKey ?? ''),
        newsApiKey: String(parsed.newsApiKey ?? ''),
        gnewsKey: String(parsed.gnewsKey ?? ''),
        finnhubKey: String(parsed.finnhubKey ?? ''),
        twelveKey: String(parsed.twelveKey ?? ''),
        alphaKey: String(parsed.alphaKey ?? ''),
        polygonKey: String(parsed.polygonKey ?? ''),
        fmpKey: String(parsed.fmpKey ?? ''),
        watchlist: watchlistOf(parsed.watchlist),
        detectConf: detectConfOf(parsed.detectConf),
        detectCams: detectCamsOf(parsed.detectCams),
        basemap: parseBasemapMode(String(parsed.basemap ?? '')) ?? 'hybrid',
        basemapSource: parseBasemapSource(String(parsed.basemapSource ?? '')) ?? 'free',
        markerSize: legacySize ? MARKER_DEFAULT : markerSize(parsed.markerSize),
        theme: theme ?? 'color',
        crt: crt ?? CRT_DEFAULT,
        speedUnit: speedUnit(parsed.speedUnit),
        markerStyle: styleOf(parsed.markerStyle),
        colorOverrides: overridesOf(parsed.colorOverrides),
        radar: parsed.radar !== false,
      }
      }
    } catch {
      this.state = { ...EMPTY, detectCams: [], watchlist: [], colorOverrides: {} }
    }
    applyPalette(this.state.markerStyle, this.state.colorOverrides)
  }

  get(): Settings {
    return this.state
  }

  update(patch: Partial<Settings>): void {
    const next = { ...this.state, ...patch }
    if (patch.watchlist) next.watchlist = watchlistOf(patch.watchlist)
    this.state = next
    applyPalette(this.state.markerStyle, this.state.colorOverrides)
    localStorage.setItem(KEY, JSON.stringify(this.state))
    for (const fn of this.listeners) fn()
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }
}
