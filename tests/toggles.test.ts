/** @vitest-environment happy-dom */
import { describe, expect, it } from 'vitest'
import { SettingsStore } from '../src/core/settings'
import { cfgFrame, hudFrame, overlapArea, radarFrame } from '../src/ui/hud-frame'
import {
  escapePanels,
  pointerPanels,
  togglePanel,
  toggleRadar,
  toggleSound,
  toggleViewer,
  type ChromeState,
} from '../src/ui/toggles'

const base: ChromeState = { panel: null, radar: true, sound: true, viewer: true }

describe('top bar toggles', () => {
  it('opens a panel, closes it on the second press, and switches without stacking', () => {
    const cfg = togglePanel(base, 'cfg')
    expect(cfg.panel).toBe('cfg')
    expect(togglePanel(cfg, 'cfg').panel).toBeNull()
    const link = togglePanel(cfg, 'link')
    expect(link.panel).toBe('link')
    expect(togglePanel(link, 'shot').panel).toBe('shot')
    expect(togglePanel(link, 'legend').panel).toBe('legend')
    expect(togglePanel(link, 'more').panel).toBe('more')
  })

  it('closes the open panel on Escape', () => {
    expect(escapePanels(togglePanel(base, 'cfg')).panel).toBeNull()
    expect(escapePanels(togglePanel(base, 'shot')).panel).toBeNull()
    expect(escapePanels(base).panel).toBeNull()
  })

  it('closes a transient popover on an outside click, and leaves the globe and settings alone', () => {
    const link = togglePanel(base, 'link')
    expect(pointerPanels(link, 'away').panel).toBeNull()
    expect(pointerPanels(link, 'globe').panel).toBe('link')
    expect(pointerPanels(link, 'panel').panel).toBe('link')
    expect(pointerPanels(link, 'button').panel).toBe('link')
    const cfg = togglePanel(base, 'cfg')
    expect(pointerPanels(cfg, 'away').panel).toBe('cfg')
    expect(pointerPanels(cfg, 'globe').panel).toBe('cfg')
    const more = togglePanel(base, 'more')
    expect(pointerPanels(more, 'away').panel).toBeNull()
    expect(pointerPanels(more, 'globe').panel).toBe('more')
  })

  it('toggles sound, the model viewer, and the radar without closing a panel', () => {
    const cfg = togglePanel(base, 'cfg')
    const quiet = toggleSound(cfg)
    expect(quiet.sound).toBe(false)
    expect(quiet.panel).toBe('cfg')
    expect(toggleSound(quiet).sound).toBe(true)
    const shut = toggleViewer(base)
    expect(shut.viewer).toBe(false)
    expect(toggleViewer(shut).viewer).toBe(true)
    const off = toggleRadar(base)
    expect(off.radar).toBe(false)
    expect(off.panel).toBeNull()
    expect(toggleRadar(off).radar).toBe(true)
  })
})

describe('radar setting', () => {
  it('persists across a reload and defaults to on', () => {
    localStorage.setItem('alleyes.settings.v1', JSON.stringify({ theme: 'color', radar: true }))
    const first = new SettingsStore()
    expect(first.get().radar).toBe(true)
    first.update({ radar: false })
    const second = new SettingsStore()
    expect(second.get().radar).toBe(false)
    second.update({ radar: true })
    expect(new SettingsStore().get().radar).toBe(true)
  })
})

describe('cfg and radar stay in their slots', () => {
  const sizes = [
    [800, 540],
    [1024, 700],
    [1440, 900],
  ] as const

  it('keeps the settings panel out of the dock, the viewer, and the radar', () => {
    for (const [width, height] of sizes) {
      const frame = hudFrame(width, height)
      const cfg = cfgFrame(width, height)
      const radar = radarFrame(width, height)
      expect(cfg.w).toBeGreaterThan(0)
      expect(cfg.h).toBeGreaterThan(0)
      expect(overlapArea(cfg, frame.dock)).toBe(0)
      expect(overlapArea(cfg, frame.right)).toBe(0)
      expect(overlapArea(cfg, frame.top)).toBe(0)
      expect(overlapArea(cfg, radar)).toBe(0)
      expect(overlapArea(radar, frame.right)).toBe(0)
      expect(overlapArea(radar, frame.top)).toBe(0)
      expect(radar.x).toBeGreaterThanOrEqual(frame.dock.x)
      expect(radar.x + radar.w).toBeLessThanOrEqual(frame.dock.x + frame.dock.w)
    }
  })
})
