import type { Settings, SettingsStore as SettingsApi, SpeedUnit } from './types'

const KEY = 'alleyes.settings.v1'

const EMPTY: Settings = {
  mute: false,
  openskyId: '',
  openskySecret: '',
  firmsKey: '',
  markerSize: 0.7,
  speedUnit: 'kt',
}

function speedUnit(value: unknown): SpeedUnit {
  if (value === 'mph' || value === 'kmh' || value === 'kt') return value
  return 'kt'
}

function markerSize(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return EMPTY.markerSize
  return Math.min(1.8, Math.max(0.35, n))
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
      this.state = {
        mute: Boolean(parsed.mute),
        openskyId: String(parsed.openskyId ?? ''),
        openskySecret: String(parsed.openskySecret ?? ''),
        firmsKey: String(parsed.firmsKey ?? ''),
        markerSize: markerSize(parsed.markerSize),
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
