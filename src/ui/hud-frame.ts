/**
 * Fixed HUD slots. These numbers match src/styles.css.
 * Feed text, the camera, and a selected contact must not change them.
 * When a flight, ship, or satellite is open, its panel replaces the layer
 * list inside the same dock rectangle.
 */

export interface HudBox {
  x: number
  y: number
  w: number
  h: number
}

export interface HudFrame {
  top: HudBox
  dock: HudBox
  right: HudBox
  foot: HudBox
}

const TOP_H = 64
const FOOT_H = 96
const GAP = 8
const EDGE = 10

export function hudFrame(width: number, height: number): HudFrame {
  const short = height <= 720 || width <= 900
  const dockW = short ? 400 : 252
  const rightW = short ? 220 : 292
  const y = EDGE + TOP_H + GAP
  const bottom = EDGE + FOOT_H + GAP
  const h = Math.max(0, height - y - bottom)
  return {
    top: { x: EDGE, y: EDGE, w: Math.max(0, width - EDGE * 2), h: TOP_H },
    dock: { x: EDGE, y, w: dockW, h },
    right: { x: Math.max(EDGE, width - EDGE - rightW), y, w: rightW, h },
    foot: { x: EDGE, y: height - EDGE - FOOT_H, w: Math.max(0, width - EDGE * 2), h: FOOT_H },
  }
}

/** Settings panel in the gap between the layer dock and the model viewer. */
export function cfgFrame(width: number, height: number): HudBox {
  const frame = hudFrame(width, height)
  const gap = 8
  const left = frame.dock.x + frame.dock.w + gap
  const rightEdge = frame.right.x - gap
  const w = Math.max(0, Math.min(360, rightEdge - left))
  const x = rightEdge - w
  const h = Math.min(480, frame.dock.h)
  return { x, y: frame.dock.y, w, h }
}

/** Radar slot inside the dock. It never leaves that rectangle. */
export function radarFrame(width: number, height: number): HudBox {
  const frame = hudFrame(width, height)
  const short = height <= 720 || width <= 900
  if (!short) {
    const h = 176
    return { x: frame.dock.x, y: frame.dock.y + frame.dock.h - h, w: frame.dock.w, h }
  }
  const w = 108
  return { x: frame.dock.x + frame.dock.w - w, y: frame.dock.y, w, h: frame.dock.h }
}

export function overlapArea(a: HudBox, b: HudBox): number {
  const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x))
  const y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y))
  return x * y
}
