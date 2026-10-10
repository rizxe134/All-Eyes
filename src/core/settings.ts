import type { GlobeTheme, Settings, SettingsStore as SettingsApi, SpeedUnit } from './types'

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
  markerSize: MARKER_DEFAULT,
  theme: 'color',
  crt: CRT_DEFAULT,
  speedUnit: 'kt',
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

export class SettingsStore implements SettingsApi {
  private state: Settings
  private listeners = new Set<() => void>()

  constructor() {
    this.state = { ...EMPTY }
    try {
      const raw = localStorage.getItem(KEY)
      if (!raw) return
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
        markerSize: legacySize ? MARKER_DEFAULT : markerSize(parsed.markerSize),
        theme: theme ?? 'color',
        crt: crt ?? CRT_DEFAULT,
        speedUnit: speedUnit(parsed.speedUnit),
      }
    } catch {
      this.state = { ...EMPTY }
    }
  }

  get(): Settings {
    return this.state
  }

  update(patch: Partial<Settings>): void {
    this.state = { ...this.state, ...patch }
    localStorage.setItem(KEY, JSON.stringify(this.state))
    for (const fn of this.listeners) fn()
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }
}
