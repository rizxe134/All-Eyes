/** @vitest-environment happy-dom */
import { describe, expect, it } from 'vitest'
import { SettingsStore } from '../src/core/settings'

describe('settings', () => {
  it('migrates the old untouched marker size to the small default', () => {
    localStorage.setItem('alleyes.settings.v1', JSON.stringify({ markerSize: 0.7, mute: true, speedUnit: 'mph' }))
    const store = new SettingsStore()
    expect(store.get().markerSize).toBe(0.45)
    expect(store.get().theme).toBe('color')
    expect(store.get().crt).toBe(0.4)
    expect(store.get().mute).toBe(true)
    expect(store.get().speedUnit).toBe('mph')
  })

  it('keeps a custom marker size from before the theme fields existed', () => {
    localStorage.setItem('alleyes.settings.v1', JSON.stringify({ markerSize: 1.2 }))
    const store = new SettingsStore()
    expect(store.get().markerSize).toBe(1.2)
    expect(store.get().theme).toBe('color')
  })

  it('keeps an explicit 0.7 once a theme has been saved', () => {
    localStorage.setItem('alleyes.settings.v1', JSON.stringify({ markerSize: 0.7, theme: 'green', crt: 0 }))
    const store = new SettingsStore()
    expect(store.get().markerSize).toBe(0.7)
    expect(store.get().theme).toBe('green')
    expect(store.get().crt).toBe(0)
  })
})
