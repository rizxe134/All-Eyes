import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { clampBox, placeTip } from '../src/ui/clamp'
import { hudFrame, overlapArea } from '../src/ui/hud-frame'

describe('hover tooltip stays in the window', () => {
  it('flips a tooltip that would leave the lower-right corner', () => {
    const box = placeTip(780, 500, 120, 28, 800, 540)
    expect(box.left + 120).toBeLessThanOrEqual(800 - 8)
    expect(box.top + 28).toBeLessThanOrEqual(540 - 8)
    expect(box.left).toBeGreaterThanOrEqual(8)
    expect(box.top).toBeGreaterThanOrEqual(8)
  })

  it('clamps a dragged card that starts past the edge', () => {
    const box = clampBox(900, 700, 240, 180, 800, 540)
    expect(box.left).toBe(800 - 240 - 8)
    expect(box.top).toBe(540 - 180 - 8)
  })
})

describe('HUD slots do not move when a contact is open', () => {
  const sizes = [
    [800, 540],
    [1024, 700],
    [1440, 900],
  ] as const

  it('keeps the same rectangles at each window size', () => {
    for (const [width, height] of sizes) {
      const first = hudFrame(width, height)
      const again = hudFrame(width, height)
      expect(again).toEqual(first)
      expect(overlapArea(first.top, first.dock)).toBe(0)
      expect(overlapArea(first.dock, first.foot)).toBe(0)
      expect(overlapArea(first.dock, first.right)).toBe(0)
      expect(overlapArea(first.right, first.foot)).toBe(0)
      expect(first.dock.x).toBe(10)
      expect(first.dock.y).toBe(82)
    }
  })

  it('does not anchor the flight panel or the layer list to the camera', () => {
    const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
    expect(css).not.toMatch(/left:\s*356px/)
    expect(css).toMatch(/\.ae-top \{[^}]*height:\s*64px/)
    expect(css).toMatch(/text-overflow:\s*ellipsis/)
    expect(css).toMatch(/\.ae-flight \{[^}]*position:\s*relative/)
    expect(css).toMatch(/\.ae-hud\.is-flight \.ae-layers/)
  })
})
