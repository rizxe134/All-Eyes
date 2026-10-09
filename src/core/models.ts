import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/** How a marker mesh animates. Yaw and rotor spin around local up. Prop spins around the nose. */
export type ModelSpin = 'none' | 'yaw' | 'rotor' | 'prop'

export interface ModelPart {
  id: string
  spin: ModelSpin
}

const cache = new Map<string, THREE.BufferGeometry>()

/** Local axes: +X wing, +Y nose, +Z up. */
function part(w: number, len: number, h: number, x: number, y: number, z: number, yaw = 0): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(w, len, h)
  if (yaw) geo.rotateZ(yaw)
  geo.translate(x, y, z)
  return geo
}

function disc(radius: number, x: number, y: number, z: number, axis: 'y' | 'z'): THREE.BufferGeometry {
  const geo = new THREE.CylinderGeometry(radius, radius, 0.03, 8)
  if (axis === 'z') geo.rotateX(Math.PI / 2)
  geo.translate(x, y, z)
  return geo
}

function fuse(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts, false)
  for (const geo of parts) geo.dispose()
  if (!merged) return new THREE.BoxGeometry(0.2, 0.2, 0.2)
  return merged
}

function airbusNarrow(): THREE.BufferGeometry {
  return fuse([
    part(0.18, 1.28, 0.18, 0, 0.02, 0),
    part(0.12, 0.22, 0.12, 0, 0.72, 0),
    part(1.55, 0.26, 0.04, 0, 0.02, -0.05),
    part(0.045, 0.12, 0.18, 0.78, 0.0, 0.08),
    part(0.045, 0.12, 0.18, -0.78, 0.0, 0.08),
    part(0.1, 0.28, 0.1, 0.32, 0.06, -0.14),
    part(0.1, 0.28, 0.1, -0.32, 0.06, -0.14),
    part(0.04, 0.22, 0.32, 0, -0.58, 0.2),
    part(0.52, 0.08, 0.03, 0, -0.64, 0.06),
  ])
}

function boeingNarrow(): THREE.BufferGeometry {
  return fuse([
    part(0.17, 1.16, 0.17, 0, 0, 0),
    part(0.11, 0.16, 0.11, 0, 0.64, 0),
    part(1.48, 0.24, 0.035, 0, -0.02, -0.04),
    part(0.11, 0.32, 0.11, 0.5, 0.12, -0.15),
    part(0.11, 0.32, 0.11, -0.5, 0.12, -0.15),
    part(0.035, 0.2, 0.38, 0, -0.52, 0.22),
    part(0.48, 0.08, 0.03, 0, -0.58, 0.05),
  ])
}

function airbusQuad(): THREE.BufferGeometry {
  return fuse([
    part(0.32, 1.55, 0.34, 0, 0, 0.02),
    part(0.2, 0.24, 0.2, 0, 0.86, 0.02),
    part(2.15, 0.32, 0.05, 0, 0.05, -0.08),
    part(0.05, 0.16, 0.22, 1.08, 0.02, 0.08),
    part(0.05, 0.16, 0.22, -1.08, 0.02, 0.08),
    part(0.11, 0.3, 0.11, 0.38, 0.08, -0.2),
    part(0.11, 0.3, 0.11, -0.38, 0.08, -0.2),
    part(0.11, 0.3, 0.11, 0.72, 0.04, -0.2),
    part(0.11, 0.3, 0.11, -0.72, 0.04, -0.2),
    part(0.05, 0.26, 0.4, 0, -0.7, 0.26),
    part(0.7, 0.1, 0.04, 0, -0.76, 0.08),
  ])
}

function boeingQuad(): THREE.BufferGeometry {
  return fuse([
    part(0.28, 1.62, 0.26, 0, 0, 0),
    part(0.22, 0.62, 0.14, 0, 0.38, 0.18),
    part(0.16, 0.2, 0.14, 0, 0.86, 0.02),
    part(2.05, 0.34, 0.05, 0, -0.05, -0.06),
    part(0.12, 0.32, 0.12, 0.36, 0.02, -0.18),
    part(0.12, 0.32, 0.12, -0.36, 0.02, -0.18),
    part(0.12, 0.32, 0.12, 0.7, -0.02, -0.18),
    part(0.12, 0.32, 0.12, -0.7, -0.02, -0.18),
    part(0.05, 0.28, 0.42, 0, -0.74, 0.26),
    part(0.72, 0.1, 0.04, 0, -0.8, 0.06),
  ])
}

function airbusTwin(): THREE.BufferGeometry {
  return fuse([
    part(0.24, 1.5, 0.24, 0, 0, 0),
    part(0.14, 0.22, 0.14, 0, 0.82, 0),
    part(1.85, 0.28, 0.04, 0, 0.04, -0.06),
    part(0.08, 0.28, 0.16, 0.9, -0.08, 0.06, 0.5),
    part(0.08, 0.28, 0.16, -0.9, -0.08, 0.06, -0.5),
    part(0.12, 0.34, 0.12, 0.4, 0.08, -0.16),
    part(0.12, 0.34, 0.12, -0.4, 0.08, -0.16),
    part(0.04, 0.22, 0.34, 0, -0.68, 0.22),
    part(0.58, 0.08, 0.03, 0, -0.74, 0.06),
  ])
}

function boeingTwin(): THREE.BufferGeometry {
  return fuse([
    part(0.24, 1.58, 0.22, 0, 0, 0),
    part(0.14, 0.2, 0.13, 0, 0.86, 0),
    part(1.9, 0.3, 0.04, 0, 0.02, -0.05),
    part(0.1, 0.26, 0.08, 0.92, -0.1, 0.02, 0.35),
    part(0.1, 0.26, 0.08, -0.92, -0.1, 0.02, -0.35),
    part(0.16, 0.4, 0.16, 0.48, 0.1, -0.16),
    part(0.16, 0.4, 0.16, -0.48, 0.1, -0.16),
    part(0.04, 0.24, 0.4, 0, -0.72, 0.24),
    part(0.62, 0.09, 0.03, 0, -0.78, 0.05),
  ])
}

function regional(): THREE.BufferGeometry {
  return fuse([
    part(0.16, 0.95, 0.16, 0, 0.05, 0),
    part(0.1, 0.16, 0.1, 0, 0.56, 0),
    part(1.15, 0.2, 0.035, 0, 0.05, -0.04),
    part(0.1, 0.22, 0.1, 0.14, -0.38, 0.02),
    part(0.1, 0.22, 0.1, -0.14, -0.38, 0.02),
    part(0.03, 0.12, 0.22, 0, -0.42, 0.24),
    part(0.42, 0.07, 0.03, 0, -0.42, 0.32),
  ])
}

function turboprop(): THREE.BufferGeometry {
  return fuse([
    part(0.16, 1.05, 0.16, 0, 0, 0),
    part(0.1, 0.16, 0.1, 0, 0.58, 0),
    part(1.35, 0.18, 0.04, 0, 0.08, 0.1),
    part(0.1, 0.2, 0.1, 0.32, 0.1, 0.02),
    part(0.1, 0.2, 0.1, -0.32, 0.1, 0.02),
    part(0.03, 0.12, 0.24, 0, -0.46, 0.22),
    part(0.4, 0.07, 0.03, 0, -0.46, 0.32),
  ])
}

function lightProp(): THREE.BufferGeometry {
  return fuse([
    part(0.14, 0.7, 0.12, 0, 0, 0),
    part(0.08, 0.14, 0.08, 0, 0.4, 0),
    part(1.05, 0.12, 0.03, 0, 0.02, 0.1),
    part(0.02, 0.16, 0.16, 0, -0.3, 0.16),
    part(0.32, 0.05, 0.02, 0, -0.32, 0.08),
  ])
}

function heliBody(): THREE.BufferGeometry {
  return fuse([
    part(0.22, 0.48, 0.2, 0, 0.08, 0),
    part(0.08, 0.55, 0.06, 0, -0.38, 0.04),
    part(0.03, 0.1, 0.16, 0, -0.62, 0.1),
    part(0.08, 0.08, 0.06, 0, 0.05, 0.16),
  ])
}

function heliRotor(): THREE.BufferGeometry {
  return fuse([
    part(0.08, 0.08, 0.04, 0, 0, 0.2),
    part(1.15, 0.06, 0.02, 0, 0, 0.24),
    part(0.06, 1.15, 0.02, 0, 0, 0.24),
  ])
}

function fighter(): THREE.BufferGeometry {
  return fuse([
    part(0.12, 0.85, 0.08, 0, 0.05, 0),
    part(0.06, 0.2, 0.05, 0, 0.52, 0),
    part(0.95, 0.42, 0.03, 0, -0.05, 0, 0.15),
    part(0.08, 0.16, 0.1, 0, -0.4, 0.06),
    part(0.28, 0.08, 0.02, 0, -0.38, 0.02),
  ])
}

function bizjet(): THREE.BufferGeometry {
  return fuse([
    part(0.15, 0.9, 0.14, 0, 0.04, 0),
    part(0.08, 0.16, 0.08, 0, 0.52, 0),
    part(1.05, 0.2, 0.03, 0, 0.02, -0.03),
    part(0.09, 0.2, 0.09, 0.12, -0.32, 0.02),
    part(0.09, 0.2, 0.09, -0.12, -0.32, 0.02),
    part(0.03, 0.1, 0.2, 0, -0.38, 0.2),
    part(0.36, 0.06, 0.025, 0, -0.38, 0.28),
  ])
}

function cargo(): THREE.BufferGeometry {
  return fuse([
    part(0.34, 1.45, 0.32, 0, 0, 0),
    part(0.22, 0.2, 0.18, 0, 0.78, 0),
    part(1.9, 0.28, 0.05, 0, 0.05, 0.16),
    part(0.12, 0.3, 0.12, 0.4, 0.08, 0.04),
    part(0.12, 0.3, 0.12, -0.4, 0.08, 0.04),
    part(0.12, 0.3, 0.12, 0.72, 0.02, 0.04),
    part(0.12, 0.3, 0.12, -0.72, 0.02, 0.04),
    part(0.05, 0.24, 0.4, 0, -0.66, 0.28),
    part(0.7, 0.1, 0.04, 0, -0.72, 0.08),
  ])
}

function satStation(): THREE.BufferGeometry {
  return fuse([
    part(0.28, 0.55, 0.28, 0, 0, 0),
    part(1.15, 0.08, 0.42, 0.85, 0, 0),
    part(1.15, 0.08, 0.42, -0.85, 0, 0),
  ])
}

function satNav(): THREE.BufferGeometry {
  return fuse([
    part(0.32, 0.32, 0.32, 0, 0, 0),
    part(0.55, 0.08, 0.28, 0.5, 0, 0),
    part(0.55, 0.08, 0.28, -0.5, 0, 0),
    part(0.08, 0.55, 0.28, 0, 0.5, 0),
    part(0.08, 0.55, 0.28, 0, -0.5, 0),
  ])
}

function satWx(): THREE.BufferGeometry {
  return fuse([
    part(0.22, 0.22, 0.7, 0, 0, 0),
    disc(0.42, 0, 0.15, 0.15, 'z'),
  ])
}

function satComms(): THREE.BufferGeometry {
  return fuse([
    part(0.3, 0.3, 0.3, 0, 0, 0),
    part(0.04, 0.04, 0.45, 0.12, 0.12, 0.32),
    part(0.04, 0.04, 0.45, -0.12, -0.12, 0.32),
    disc(0.16, 0.12, 0.12, 0.56, 'z'),
    disc(0.16, -0.12, -0.12, 0.56, 'z'),
  ])
}

function satScience(): THREE.BufferGeometry {
  return fuse([
    part(0.2, 0.7, 0.2, 0, 0, 0),
    disc(0.28, 0, 0.42, 0.12, 'y'),
    part(0.5, 0.06, 0.22, 0.4, -0.1, 0),
  ])
}

function satDebris(): THREE.BufferGeometry {
  return fuse([
    part(0.22, 0.1, 0.12, 0, 0, 0, 0.4),
    part(0.1, 0.28, 0.08, 0.12, 0.08, 0.06, -0.6),
    part(0.14, 0.08, 0.16, -0.08, -0.06, 0.04, 0.8),
  ])
}

function shipCargo(): THREE.BufferGeometry {
  return fuse([
    part(0.28, 1.15, 0.12, 0, 0, 0),
    part(0.22, 0.22, 0.16, 0, 0.2, 0.12),
    part(0.22, 0.22, 0.16, 0, -0.05, 0.12),
    part(0.22, 0.22, 0.16, 0, -0.3, 0.12),
    part(0.16, 0.18, 0.16, 0, 0.48, 0.12),
  ])
}

function shipTanker(): THREE.BufferGeometry {
  return fuse([
    part(0.26, 1.35, 0.1, 0, 0, 0),
    part(0.22, 0.28, 0.14, 0, 0.28, 0.1),
    part(0.22, 0.28, 0.14, 0, -0.05, 0.1),
    part(0.22, 0.28, 0.14, 0, -0.38, 0.1),
    part(0.14, 0.16, 0.18, 0, 0.58, 0.12),
  ])
}

function shipPax(): THREE.BufferGeometry {
  return fuse([
    part(0.26, 1.2, 0.12, 0, 0, 0),
    part(0.22, 0.7, 0.16, 0, 0.05, 0.12),
    part(0.16, 0.28, 0.12, 0, 0.12, 0.24),
  ])
}

function shipFish(): THREE.BufferGeometry {
  return fuse([
    part(0.18, 0.7, 0.1, 0, 0, 0),
    part(0.04, 0.04, 0.35, 0, 0.05, 0.22),
    part(0.14, 0.16, 0.1, 0, -0.22, 0.08),
  ])
}

function shipMil(): THREE.BufferGeometry {
  return fuse([
    part(0.22, 1.05, 0.1, 0, 0, 0),
    part(0.16, 0.16, 0.1, 0, 0.15, 0.1),
    part(0.08, 0.28, 0.06, 0, 0.42, 0.08),
  ])
}

function shipTug(): THREE.BufferGeometry {
  return fuse([
    part(0.32, 0.55, 0.14, 0, 0, 0),
    part(0.18, 0.2, 0.16, 0, -0.05, 0.14),
  ])
}

function shipSail(): THREE.BufferGeometry {
  return fuse([
    part(0.16, 0.85, 0.08, 0, 0, 0),
    part(0.03, 0.03, 0.55, 0, 0.05, 0.3),
    part(0.04, 0.28, 0.32, 0.08, 0.08, 0.28),
  ])
}

function storm(): THREE.BufferGeometry {
  const bits: THREE.BufferGeometry[] = []
  for (let i = 0; i < 6; i++) {
    const a = i * 0.85
    const r = 0.12 + i * 0.08
    bits.push(part(0.1, 0.2, 0.05, Math.cos(a) * r, Math.sin(a) * r, i * 0.015, a))
  }
  return fuse(bits)
}

function rocket(): THREE.BufferGeometry {
  return fuse([
    part(0.16, 0.16, 0.55, 0, 0, 0.15),
    part(0.1, 0.1, 0.18, 0, 0, 0.48),
    part(0.08, 0.2, 0.08, 0.12, 0, 0.02),
    part(0.08, 0.2, 0.08, -0.12, 0, 0.02),
  ])
}

function flame(): THREE.BufferGeometry {
  return fuse([
    part(0.16, 0.16, 0.12, 0, 0, 0.04),
    part(0.1, 0.1, 0.16, 0, 0, 0.16),
    part(0.05, 0.05, 0.12, 0, 0, 0.28),
  ])
}

const builders: Record<string, () => THREE.BufferGeometry> = {
  dot: () => new THREE.OctahedronGeometry(0.22, 0),
  chevron: () => fuse([part(0.16, 0.7, 0.08, 0, 0.1, 0), part(0.55, 0.16, 0.05, 0, -0.15, 0)]),
  diamond: () => new THREE.OctahedronGeometry(0.45, 0),
  ring: () => new THREE.TorusGeometry(0.42, 0.07, 4, 12),
  box: () => new THREE.BoxGeometry(0.4, 0.7, 0.25),
  drop: () => fuse([part(0.28, 0.28, 0.2, 0, 0, 0), part(0.14, 0.14, 0.22, 0, 0.05, 0.18)]),
  'air-a320': airbusNarrow,
  'air-b737': boeingNarrow,
  'air-a380': airbusQuad,
  'air-b747': boeingQuad,
  'air-a350': airbusTwin,
  'air-b777': boeingTwin,
  'air-rj': regional,
  'air-prop': turboprop,
  'air-light': lightProp,
  'air-heli': heliBody,
  'air-heli-rotor': heliRotor,
  'air-prop-prop': () => fuse([disc(0.16, 0.32, 0.22, 0.02, 'y'), disc(0.16, -0.32, 0.22, 0.02, 'y')]),
  'air-light-prop': () => disc(0.16, 0, 0.5, 0, 'y'),
  'air-fighter': fighter,
  'air-biz': bizjet,
  'air-cargo': cargo,
  'air-unk': () => fuse([part(0.14, 0.7, 0.1, 0, 0, 0), part(0.7, 0.16, 0.04, 0, 0, 0)]),
  'sat-station': satStation,
  'sat-nav': satNav,
  'sat-wx': satWx,
  'sat-comms': satComms,
  'sat-science': satScience,
  'sat-debris': satDebris,
  'ship-cargo': shipCargo,
  'ship-tanker': shipTanker,
  'ship-pax': shipPax,
  'ship-fish': shipFish,
  'ship-mil': shipMil,
  'ship-tug': shipTug,
  'ship-sail': shipSail,
  'ship-unk': () => part(0.22, 0.8, 0.12, 0, 0, 0),
  'ico-storm': storm,
  'ico-quake': () => new THREE.TorusGeometry(0.4, 0.07, 4, 10),
  'ico-launch': rocket,
  'ico-fire': flame,
  'ico-volcano': () => {
    const geo = new THREE.ConeGeometry(0.32, 0.45, 6)
    geo.rotateX(Math.PI / 2)
    return geo
  },
  'ico-event': () => new THREE.OctahedronGeometry(0.32, 0),
}

const spins: Record<string, ModelSpin> = {
  'air-heli-rotor': 'rotor',
  'air-prop-prop': 'prop',
  'air-light-prop': 'prop',
  'sat-station': 'yaw',
  'sat-nav': 'yaw',
  'sat-wx': 'yaw',
  'sat-comms': 'yaw',
  'sat-science': 'yaw',
  'sat-debris': 'yaw',
}

export function markerGeometry(id: string): THREE.BufferGeometry {
  const hit = cache.get(id)
  if (hit) return hit
  const build = builders[id] ?? builders.dot
  const geo = build ? build() : new THREE.OctahedronGeometry(0.22, 0)
  cache.set(id, geo)
  return geo
}

export function markerSpin(id: string): ModelSpin {
  return spins[id] ?? 'none'
}

/** Body plus a spinning companion, when the family has one. */
export function markerParts(id: string): ModelPart[] {
  if (id === 'air-heli') return [{ id, spin: 'none' }, { id: 'air-heli-rotor', spin: 'rotor' }]
  if (id === 'air-prop') return [{ id, spin: 'none' }, { id: 'air-prop-prop', spin: 'prop' }]
  if (id === 'air-light') return [{ id, spin: 'none' }, { id: 'air-light-prop', spin: 'prop' }]
  return [{ id, spin: markerSpin(id) }]
}

export function modelIds(): string[] {
  return Object.keys(builders)
}

/** Nose-up degrees from a climb rate and ground speed. */
export function pitchDeg(vertFpm: number, speedKt: number): number {
  const climb = vertFpm * 0.00508
  const gs = Math.max(30, Math.abs(speedKt) * 0.514444)
  const deg = Math.atan2(climb, gs) * 180 / Math.PI
  return Math.max(-16, Math.min(16, deg))
}
