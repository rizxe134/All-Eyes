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
    this.state = { ...EMPTY }
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
      this.state = { ...EMPTY }
    }
    applyPalette(this.state.markerStyle, this.state.colorOverrides)
  }

  get(): Settings {
    return this.state
  }

  update(patch: Partial<Settings>): void {
    this.state = { ...this.state, ...patch }
    applyPalette(this.state.markerStyle, this.state.colorOverrides)
    localStorage.setItem(KEY, JSON.stringify(this.state))
    for (const fn of this.listeners) fn()
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }
}
