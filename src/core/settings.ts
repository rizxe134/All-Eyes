import type { Settings, SettingsStore as SettingsApi } from './types'

const KEY = 'alleyes.settings.v1'

const EMPTY: Settings = {
  mute: false,
  openskyId: '',
  openskySecret: '',
  firmsKey: '',
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
