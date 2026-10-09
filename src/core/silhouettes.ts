import { registerSprite } from './sprites'

/**
 * Original filled top-down silhouettes. Nose is the top row.
 * These are drawn in code, not traced from any flight-tracker icon set.
 */

type Pt = [number, number]

const N = 56

function ellipse(cx: number, cy: number, rx: number, ry: number, steps = 16): Pt[] {
  const pts: Pt[] = []
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2
    pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry])
  }
  return pts
}

function mirror(poly: Pt[]): Pt[] {
  return poly.map(([x, y]) => [1 - x, y])
}

function inside(x: number, y: number, poly: Pt[]): boolean {
  let hit = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i]![0]
    const yi = poly[i]![1]
    const xj = poly[j]![0]
    const yj = poly[j]![1]
    if ((yi > y) === (yj > y)) continue
    const xCross = ((xj - xi) * (y - yi)) / (yj - yi) + xi
    if (x < xCross) hit = !hit
  }
  return hit
}

function ring(cx: number, cy: number, radius: number, thick: number): boolean[][] {
  const on = Array.from({ length: N }, () => Array<boolean>(N).fill(false))
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const dx = (x + 0.5) / N - cx
      const dy = (y + 0.5) / N - cy
      const d = Math.hypot(dx, dy)
      if (d <= radius && d >= radius - thick) on[y]![x] = true
    }
  }
  return on
}

function stamp(id: string, parts: Pt[][], extra?: boolean[][]) {
  const on = extra ?? Array.from({ length: N }, () => Array<boolean>(N).fill(false))
  if (extra) {
    for (let y = 0; y < N; y++) on[y] = extra[y]!.slice()
  }
  for (let y = 0; y < N; y++) {
    const gy = (y + 0.5) / N
    for (let x = 0; x < N; x++) {
      const gx = (x + 0.5) / N
      if (on[y]![x]) continue
      for (const poly of parts) {
        if (inside(gx, gy, poly)) {
          on[y]![x] = true
          break
        }
      }
    }
  }
  registerSprite(id, on.map((row) => row.map((lit) => (lit ? '#' : '.')).join('')))
}

function jet(id: string, opt: {
  fuse: number
  wingY: number
  sweep: number
  span: number
  engines: number
  engineX: number
  tail: number
}) {
  const f = opt.fuse
  const fuse: Pt[] = [
    [0.5, 0.03],
    [0.5 + f * 0.45, 0.12],
    [0.5 + f, opt.wingY],
    [0.5 + f * 0.7, 0.78],
    [0.5, 0.97],
    [0.5 - f * 0.7, 0.78],
    [0.5 - f, opt.wingY],
    [0.5 - f * 0.45, 0.12],
  ]
  const wingL: Pt[] = [
    [0.5 - f * 0.2, opt.wingY - 0.02],
    [0.5 - opt.span, opt.wingY + opt.sweep],
    [0.5 - opt.span + 0.02, opt.wingY + opt.sweep + 0.06],
    [0.5 - f * 0.15, opt.wingY + 0.1],
  ]
  const tailL: Pt[] = [
    [0.5 - f * 0.15, 0.8],
    [0.5 - opt.tail, 0.9],
    [0.5 - opt.tail + 0.02, 0.95],
    [0.5 - 0.02, 0.86],
  ]
  const parts: Pt[][] = [fuse, wingL, mirror(wingL), tailL, mirror(tailL)]
  const xs = opt.engines === 4
    ? [opt.engineX, opt.engineX + 0.12]
    : [opt.engineX]
  for (const x of xs) {
    parts.push(ellipse(x, opt.wingY + opt.sweep * 0.45, 0.035, 0.055))
    parts.push(ellipse(1 - x, opt.wingY + opt.sweep * 0.45, 0.035, 0.055))
  }
  stamp(id, parts)
}

let installed = false

/** Register filled silhouettes. Safe to call more than once. */
export function installSilhouettes(): void {
  if (installed) return
  installed = true
  jet('air-a320', { fuse: 0.07, wingY: 0.4, sweep: 0.16, span: 0.46, engines: 2, engineX: 0.28, tail: 0.2 })
  jet('air-b737', { fuse: 0.065, wingY: 0.46, sweep: 0.14, span: 0.44, engines: 2, engineX: 0.33, tail: 0.22 })
  jet('air-a350', { fuse: 0.09, wingY: 0.4, sweep: 0.18, span: 0.48, engines: 2, engineX: 0.26, tail: 0.22 })
  jet('air-b777', { fuse: 0.085, wingY: 0.42, sweep: 0.2, span: 0.48, engines: 2, engineX: 0.3, tail: 0.24 })
  jet('air-a380', { fuse: 0.11, wingY: 0.4, sweep: 0.16, span: 0.49, engines: 4, engineX: 0.22, tail: 0.24 })
  jet('air-b747', { fuse: 0.1, wingY: 0.38, sweep: 0.18, span: 0.48, engines: 4, engineX: 0.24, tail: 0.26 })
  jet('air-rj', { fuse: 0.055, wingY: 0.44, sweep: 0.1, span: 0.38, engines: 2, engineX: 0.32, tail: 0.16 })
  jet('air-cargo', { fuse: 0.12, wingY: 0.42, sweep: 0.12, span: 0.48, engines: 2, engineX: 0.28, tail: 0.24 })
  stamp('air-biz', [
    [[0.5, 0.06], [0.55, 0.14], [0.55, 0.72], [0.5, 0.94], [0.45, 0.72], [0.45, 0.14]],
    [[0.48, 0.42], [0.14, 0.56], [0.16, 0.62], [0.48, 0.52]],
    [[0.52, 0.42], [0.86, 0.56], [0.84, 0.62], [0.52, 0.52]],
    [[0.46, 0.78], [0.32, 0.88], [0.34, 0.93], [0.48, 0.84]],
    [[0.54, 0.78], [0.68, 0.88], [0.66, 0.93], [0.52, 0.84]],
    ellipse(0.38, 0.7, 0.035, 0.06),
    ellipse(0.62, 0.7, 0.035, 0.06),
  ])
  jet('air-unk', { fuse: 0.07, wingY: 0.44, sweep: 0.14, span: 0.42, engines: 2, engineX: 0.3, tail: 0.18 })

  const straight: Pt[] = [
    [0.47, 0.4],
    [0.08, 0.4],
    [0.08, 0.48],
    [0.47, 0.48],
  ]
  const propFuse: Pt[] = [
    [0.5, 0.08], [0.56, 0.16], [0.56, 0.72], [0.5, 0.94], [0.44, 0.72], [0.44, 0.16],
  ]
  stamp('air-prop', [
    propFuse,
    straight,
    mirror(straight),
    ellipse(0.22, 0.44, 0.04, 0.07),
    ellipse(0.78, 0.44, 0.04, 0.07),
    [[0.44, 0.82], [0.32, 0.9], [0.34, 0.95], [0.47, 0.88]],
    [[0.56, 0.82], [0.68, 0.9], [0.66, 0.95], [0.53, 0.88]],
  ])
  stamp('air-light', [
    [[0.5, 0.1], [0.55, 0.2], [0.54, 0.7], [0.5, 0.92], [0.46, 0.7], [0.45, 0.2]],
    [[0.48, 0.36], [0.12, 0.36], [0.12, 0.42], [0.48, 0.42]],
    [[0.52, 0.36], [0.88, 0.36], [0.88, 0.42], [0.52, 0.42]],
    [[0.46, 0.78], [0.36, 0.86], [0.38, 0.9], [0.48, 0.84]],
    [[0.54, 0.78], [0.64, 0.86], [0.62, 0.9], [0.52, 0.84]],
    ellipse(0.5, 0.14, 0.045, 0.03),
  ])
  const fighterWing: Pt[] = [
    [0.5, 0.08],
    [0.08, 0.62],
    [0.14, 0.68],
    [0.5, 0.42],
  ]
  stamp('air-fighter', [
    fighterWing,
    mirror(fighterWing),
    [[0.47, 0.4], [0.53, 0.4], [0.52, 0.9], [0.5, 0.96], [0.48, 0.9]],
    [[0.42, 0.78], [0.28, 0.88], [0.32, 0.92], [0.46, 0.84]],
    [[0.58, 0.78], [0.72, 0.88], [0.68, 0.92], [0.54, 0.84]],
  ])
  const rotor = ring(0.5, 0.4, 0.34, 0.035)
  stamp('air-heli', [
    [[0.5, 0.22], [0.58, 0.32], [0.56, 0.55], [0.52, 0.62], [0.5, 0.9], [0.48, 0.62], [0.44, 0.55], [0.42, 0.32]],
    [[0.46, 0.78], [0.34, 0.84], [0.36, 0.88], [0.48, 0.82]],
    [[0.54, 0.78], [0.66, 0.84], [0.64, 0.88], [0.52, 0.82]],
  ], rotor)

  stamp('sel-ring', [], ring(0.5, 0.5, 0.46, 0.06))

  hull('ship-cargo', 0.16, [
    [[0.28, 0.3], [0.72, 0.3], [0.72, 0.4], [0.28, 0.4]],
    [[0.28, 0.44], [0.72, 0.44], [0.72, 0.54], [0.28, 0.54]],
    [[0.28, 0.58], [0.72, 0.58], [0.72, 0.68], [0.28, 0.68]],
  ])
  hull('ship-tanker', 0.2, [
    [[0.4, 0.3], [0.6, 0.3], [0.6, 0.78], [0.4, 0.78]],
  ])
  hull('ship-pax', 0.18, [
    [[0.32, 0.32], [0.68, 0.32], [0.68, 0.62], [0.32, 0.62]],
  ])
  hull('ship-fish', 0.12, [
    [[0.42, 0.36], [0.58, 0.36], [0.54, 0.6], [0.46, 0.6]],
  ])
  hull('ship-mil', 0.14, [
    [[0.34, 0.28], [0.66, 0.28], [0.66, 0.58], [0.34, 0.58]],
    [[0.46, 0.16], [0.54, 0.16], [0.54, 0.3], [0.46, 0.3]],
  ])
  hull('ship-tug', 0.18, [
    [[0.38, 0.42], [0.62, 0.42], [0.62, 0.62], [0.38, 0.62]],
  ])
  hull('ship-sail', 0.1, [
    [[0.5, 0.14], [0.66, 0.5], [0.5, 0.5]],
    [[0.5, 0.14], [0.34, 0.5], [0.5, 0.5]],
  ])
  hull('ship-unk', 0.14, [])

  stamp('sat-station', [
    [[0.42, 0.38], [0.58, 0.38], [0.58, 0.62], [0.42, 0.62]],
    [[0.06, 0.44], [0.38, 0.44], [0.38, 0.56], [0.06, 0.56]],
    [[0.62, 0.44], [0.94, 0.44], [0.94, 0.56], [0.62, 0.56]],
  ])
  stamp('sat-nav', [
    ellipse(0.5, 0.5, 0.16, 0.16),
    [[0.46, 0.08], [0.54, 0.08], [0.54, 0.92], [0.46, 0.92]],
    [[0.08, 0.46], [0.92, 0.46], [0.92, 0.54], [0.08, 0.54]],
  ])
  stamp('sat-wx', [
    ellipse(0.5, 0.46, 0.22, 0.22),
    [[0.46, 0.68], [0.54, 0.68], [0.54, 0.9], [0.46, 0.9]],
  ])
  stamp('sat-comms', [
    [[0.4, 0.4], [0.6, 0.4], [0.6, 0.62], [0.4, 0.62]],
    [[0.47, 0.12], [0.53, 0.12], [0.53, 0.4], [0.47, 0.4]],
    [[0.18, 0.2], [0.82, 0.2], [0.5, 0.4]],
  ])
  stamp('sat-science', [
    [[0.4, 0.42], [0.6, 0.42], [0.6, 0.64], [0.4, 0.64]],
    [[0.14, 0.46], [0.4, 0.46], [0.4, 0.58], [0.14, 0.58]],
    [[0.6, 0.46], [0.86, 0.46], [0.86, 0.58], [0.6, 0.58]],
    [[0.47, 0.18], [0.53, 0.18], [0.53, 0.42], [0.47, 0.42]],
  ])
  stamp('sat-debris', [
    [[0.3, 0.3], [0.55, 0.22], [0.7, 0.4], [0.62, 0.68], [0.4, 0.74], [0.24, 0.52]],
  ])

  stamp('ico-storm', [
    ellipse(0.5, 0.48, 0.34, 0.28),
    [[0.5, 0.48], [0.78, 0.3], [0.7, 0.22], [0.48, 0.4]],
  ])
  stamp('ico-quake', [], ring(0.5, 0.5, 0.36, 0.08))
  stamp('ico-launch', [
    [[0.5, 0.06], [0.62, 0.28], [0.56, 0.28], [0.56, 0.72], [0.68, 0.92], [0.5, 0.78], [0.32, 0.92], [0.44, 0.72], [0.44, 0.28], [0.38, 0.28]],
  ])
  stamp('ico-fire', [
    [[0.5, 0.08], [0.7, 0.55], [0.58, 0.5], [0.64, 0.92], [0.36, 0.92], [0.44, 0.48], [0.3, 0.55]],
  ])
  stamp('ico-volcano', [
    [[0.5, 0.12], [0.86, 0.88], [0.14, 0.88]],
    [[0.42, 0.4], [0.58, 0.4], [0.52, 0.55], [0.48, 0.55]],
  ])
  stamp('ico-event', [
    [[0.5, 0.12], [0.86, 0.5], [0.5, 0.88], [0.14, 0.5]],
  ])
}

function hull(id: string, half: number, deck: Pt[][]) {
  const bow: Pt[] = [
    [0.5, 0.06],
    [0.5 + half, 0.28],
    [0.5 + half * 0.85, 0.86],
    [0.5, 0.96],
    [0.5 - half * 0.85, 0.86],
    [0.5 - half, 0.28],
  ]
  stamp(id, [bow, ...deck])
}
