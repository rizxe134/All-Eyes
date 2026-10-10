import * as THREE from 'three'

/**
 * Original detailed models for families that do not have a small, freely licensed mesh.
 * Smooth shading and standard materials. These are not copies of any tracker model.
 */

const paint = new THREE.MeshStandardMaterial({ color: 0xf2f5f8, metalness: 0.62, roughness: 0.28 })
const glass = new THREE.MeshStandardMaterial({ color: 0x163044, metalness: 0.15, roughness: 0.06 })
const metal = new THREE.MeshStandardMaterial({ color: 0x3a4048, metalness: 0.82, roughness: 0.32 })
const dark = new THREE.MeshStandardMaterial({ color: 0x1c1e22, metalness: 0.4, roughness: 0.55 })
const tire = new THREE.MeshStandardMaterial({ color: 0x141414, metalness: 0.05, roughness: 0.9 })
const gear = new THREE.MeshStandardMaterial({ color: 0x8d939a, metalness: 0.55, roughness: 0.4 })
const solar = new THREE.MeshStandardMaterial({ color: 0x1a3f86, metalness: 0.45, roughness: 0.22 })
const gold = new THREE.MeshStandardMaterial({ color: 0xc6a15a, metalness: 0.72, roughness: 0.28 })
const hullRed = new THREE.MeshStandardMaterial({ color: 0x7d1d22, metalness: 0.25, roughness: 0.48 })
const hullWhite = new THREE.MeshStandardMaterial({ color: 0xe7ecec, metalness: 0.2, roughness: 0.4 })
const deck = new THREE.MeshStandardMaterial({ color: 0x5c6560, metalness: 0.15, roughness: 0.72 })
const grayShip = new THREE.MeshStandardMaterial({ color: 0x6e767c, metalness: 0.35, roughness: 0.45 })

function solid(geo: THREE.BufferGeometry, mat: THREE.Material): THREE.Mesh {
  geo.computeVertexNormals()
  const mesh = new THREE.Mesh(geo, mat)
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

function tube(radius: number, length: number, mat: THREE.Material, axis: 'x' | 'y' | 'z' = 'z'): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(radius, radius, length, 20, 1)
  if (axis === 'z') geo.rotateX(Math.PI / 2)
  if (axis === 'x') geo.rotateZ(Math.PI / 2)
  return solid(geo, mat)
}

function fuselage(length: number, radius: number, nose = 0.15): THREE.Mesh {
  const pts: THREE.Vector2[] = []
  const steps = 18
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    let r = radius
    if (t < 0.14) r = radius * (0.15 + 0.85 * Math.sin((t / 0.14) * Math.PI * 0.5))
    else if (t > 0.78) {
      const u = (t - 0.78) / 0.22
      r = radius * (1 - u * 0.72)
    }
    pts.push(new THREE.Vector2(Math.max(0.02, r), (t - 0.5) * length))
  }
  const geo = new THREE.LatheGeometry(pts, 28)
  geo.rotateX(Math.PI / 2)
  geo.translate(0, 0, nose)
  return solid(geo, paint)
}

function wing(span: number, root: number, tip: number, sweep: number, thick: number): THREE.Mesh {
  const shape = new THREE.Shape()
  shape.moveTo(0, 0)
  shape.lineTo(span, -sweep)
  shape.lineTo(span, -sweep - tip)
  shape.lineTo(0, -root)
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: thick,
    bevelEnabled: true,
    bevelThickness: thick * 0.45,
    bevelSize: Math.min(0.04, thick),
    bevelSegments: 3,
  })
  geo.translate(0, 0, -thick / 2)
  geo.rotateX(-Math.PI / 2)
  return solid(geo, paint)
}

function engine(length: number, radius: number): THREE.Group {
  const group = new THREE.Group()
  const nacelle = tube(radius, length, metal, 'z')
  const intake = solid(new THREE.TorusGeometry(radius * 0.92, radius * 0.16, 10, 18), metal)
  intake.position.z = length * 0.48
  const fan = solid(new THREE.CircleGeometry(radius * 0.72, 16), dark)
  fan.position.z = length * 0.47
  const cone = solid(new THREE.ConeGeometry(radius * 0.28, radius * 0.7, 12), metal)
  cone.rotateX(Math.PI / 2)
  cone.position.z = length * 0.2
  const exhaust = solid(new THREE.ConeGeometry(radius * 0.55, radius * 0.5, 12), dark)
  exhaust.rotateX(-Math.PI / 2)
  exhaust.position.z = -length * 0.48
  group.add(nacelle, intake, fan, cone, exhaust)
  return group
}

function gearLeg(y: number, z: number, twin = false): THREE.Group {
  const group = new THREE.Group()
  const strut = tube(0.025, 0.28, gear, 'y')
  strut.position.set(0, y - 0.14, z)
  group.add(strut)
  const xs = twin ? [-0.06, 0.06] : [0]
  for (const x of xs) {
    const wheel = solid(new THREE.CylinderGeometry(0.055, 0.055, 0.03, 14), tire)
    wheel.rotateZ(Math.PI / 2)
    wheel.position.set(x, y - 0.28, z)
    group.add(wheel)
  }
  return group
}

export interface JetOpts {
  length: number
  radius: number
  span: number
  sweep: number
  wingAt: number
  engines: number
  engineAt: 'wing' | 'rear'
  tail: number
  windows?: boolean
  hump?: boolean
  highWing?: boolean
  prop?: boolean
  fighter?: boolean
  cargo?: boolean
}

export function buildJet(opt: JetOpts): THREE.Group {
  const root = new THREE.Group()
  const body = fuselage(opt.length, opt.radius)
  root.add(body)
  const wingY = opt.highWing ? opt.radius * 0.85 : -opt.radius * 0.15
  const wingZ = (opt.wingAt - 0.5) * opt.length
  const left = wing(opt.span, opt.length * 0.28, opt.length * 0.12, opt.sweep, opt.radius * 0.18)
  left.position.set(0, wingY, wingZ)
  const right = left.clone()
  right.scale.x = -1
  root.add(left, right)
  const fin = wing(opt.radius * 1.3, opt.length * 0.16, opt.length * 0.06, opt.length * 0.04, opt.radius * 0.08)
  fin.rotation.z = Math.PI / 2
  fin.position.set(0, opt.radius * 0.2, -opt.length * 0.42)
  root.add(fin)
  const tail = wing(opt.tail, opt.length * 0.12, opt.length * 0.06, opt.length * 0.02, opt.radius * 0.06)
  tail.position.set(0, opt.radius * 0.15, -opt.length * 0.4)
  const tailR = tail.clone()
  tailR.scale.x = -1
  root.add(tail, tailR)
  const canopy = solid(new THREE.SphereGeometry(opt.radius * 0.72, 16, 12), glass)
  canopy.scale.set(0.7, 0.45, opt.fighter ? 1.1 : 0.85)
  canopy.position.set(0, opt.radius * 0.55, opt.length * (opt.fighter ? 0.28 : 0.36))
  root.add(canopy)
  if (opt.windows !== false && !opt.fighter && !opt.cargo) {
    const band = solid(new THREE.BoxGeometry(opt.radius * 0.08, opt.radius * 0.16, opt.length * 0.55), glass)
    band.position.set(opt.radius * 0.92, opt.radius * 0.25, opt.length * 0.05)
    const bandL = band.clone()
    bandL.position.x *= -1
    root.add(band, bandL)
  }
  if (opt.hump) {
    const hump = solid(new THREE.SphereGeometry(opt.radius * 0.72, 16, 12), paint)
    hump.scale.set(0.85, 0.55, 1.4)
    hump.position.set(0, opt.radius * 0.85, opt.length * 0.18)
    root.add(hump)
  }
  const count = Math.max(0, opt.engines)
  const places = count === 4 ? [-0.62, -0.34, 0.34, 0.62] : count === 2 ? [-0.42, 0.42] : count === 1 ? [0] : []
  for (const side of places) {
    const nacelle = engine(opt.length * 0.18, opt.radius * (opt.prop ? 0.28 : 0.34))
    if (opt.engineAt === 'rear') {
      nacelle.position.set(side * opt.radius * 1.3, opt.radius * 0.15, -opt.length * 0.32)
    } else if (count === 1) {
      nacelle.position.set(0, -opt.radius * 0.1, -opt.length * 0.42)
    } else {
      nacelle.position.set(side * opt.span, wingY - opt.radius * 0.05, wingZ - opt.sweep * Math.abs(side) * 0.5)
    }
    if (opt.prop) {
      const prop = new THREE.Group()
      prop.userData.spin = 'prop'
      prop.userData.spinAxis = 'z'
      for (let b = 0; b < 4; b++) {
        const blade = solid(new THREE.BoxGeometry(0.03, opt.radius * 0.9, 0.015), dark)
        blade.rotation.z = (b / 4) * Math.PI * 2
        prop.add(blade)
      }
      prop.position.z = opt.length * 0.1
      nacelle.add(prop)
    }
    root.add(nacelle)
  }
  if (!opt.fighter) {
    root.add(gearLeg(-opt.radius, opt.length * 0.22, true))
    root.add(gearLeg(-opt.radius, -opt.length * 0.28))
  }
  return root
}

export function buildHelicopter(): THREE.Group {
  const root = new THREE.Group()
  const cabin = solid(new THREE.SphereGeometry(0.34, 24, 16), paint)
  cabin.scale.set(0.85, 0.72, 1.25)
  root.add(cabin)
  const glassNose = solid(new THREE.SphereGeometry(0.22, 16, 12), glass)
  glassNose.scale.set(0.9, 0.7, 0.8)
  glassNose.position.set(0, 0.02, 0.28)
  root.add(glassNose)
  const boom = tube(0.06, 0.85, paint, 'z')
  boom.position.set(0, 0.05, -0.7)
  root.add(boom)
  const fin = solid(new THREE.BoxGeometry(0.03, 0.22, 0.16), paint)
  fin.position.set(0, 0.16, -1.08)
  root.add(fin)
  const tailRotor = new THREE.Group()
  tailRotor.userData.spin = 'prop'
  tailRotor.userData.spinAxis = 'x'
  for (let i = 0; i < 2; i++) {
    const blade = solid(new THREE.BoxGeometry(0.02, 0.22, 0.03), dark)
    blade.rotation.z = i * Math.PI / 2
    tailRotor.add(blade)
  }
  tailRotor.position.set(0.08, 0.16, -1.08)
  root.add(tailRotor)
  for (const x of [-0.16, 0.16]) {
    const skid = tube(0.018, 0.7, gear, 'z')
    skid.position.set(x, -0.32, 0.02)
    const legA = tube(0.015, 0.16, gear, 'y')
    legA.position.set(x, -0.22, 0.16)
    const legB = legA.clone()
    legB.position.z = -0.16
    root.add(skid, legA, legB)
  }
  const mast = tube(0.03, 0.12, metal, 'y')
  mast.position.y = 0.28
  root.add(mast)
  const rotor = new THREE.Group()
  rotor.userData.spin = 'rotor'
  rotor.userData.spinAxis = 'y'
  rotor.position.y = 0.34
  for (let i = 0; i < 4; i++) {
    const blade = solid(new THREE.BoxGeometry(0.9, 0.012, 0.07), dark)
    blade.rotation.y = (i / 4) * Math.PI * 2
    rotor.add(blade)
  }
  const hub = solid(new THREE.SphereGeometry(0.05, 12, 8), metal)
  rotor.add(hub)
  root.add(rotor)
  return root
}

function shipHull(length: number, beam: number, depth: number): THREE.Mesh {
  const stations = 16
  const rings = 8
  const positions: number[] = []
  const indices: number[] = []
  const grid: number[][] = []
  for (let s = 0; s < stations; s++) {
    const t = s / (stations - 1)
    const bow = t > 0.78 ? 1 - (t - 0.78) / 0.22 : 1
    const stern = t < 0.08 ? t / 0.08 : 1
    const flare = Math.min(bow, stern)
    const row: number[] = []
    for (let r = 0; r <= rings; r++) {
      const v = r / rings
      const half = (beam / 2) * flare * Math.sin(v * Math.PI * 0.92)
      const y = -depth / 2 + v * depth
      const z = (t - 0.5) * length
      row.push(positions.length / 3)
      positions.push(half, y, z)
    }
    grid.push(row)
  }
  for (let s = 0; s < stations - 1; s++) {
    for (let r = 0; r < rings; r++) {
      const a = grid[s]![r]!
      const b = grid[s]![r + 1]!
      const c = grid[s + 1]![r + 1]!
      const d = grid[s + 1]![r]!
      indices.push(a, b, c, a, c, d)
    }
  }
  const mirrored: number[] = []
  for (let i = 0; i < positions.length; i += 3) {
    mirrored.push(positions[i]!, positions[i + 1]!, positions[i + 2]!)
  }
  const half = positions.length / 3
  for (let i = 0; i < positions.length; i += 3) {
    mirrored.push(-positions[i]!, positions[i + 1]!, positions[i + 2]!)
  }
  const idx: number[] = []
  for (let i = 0; i < indices.length; i += 3) {
    idx.push(indices[i]!, indices[i + 1]!, indices[i + 2]!)
    idx.push(indices[i]! + half, indices[i + 2]! + half, indices[i + 1]! + half)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(mirrored, 3))
  geo.setIndex(idx)
  return solid(geo, hullRed)
}

export function buildShip(kind: string): THREE.Group {
  const root = new THREE.Group()
  const long = kind === 'ship-tug' || kind === 'ship-fish' ? 1.3 : kind === 'ship-sail' ? 1.5 : 2.2
  const hull = shipHull(long, kind === 'ship-tanker' ? 0.42 : 0.5, 0.28)
  if (kind === 'ship-mil') hull.material = grayShip
  if (kind === 'ship-pax' || kind === 'ship-sail') hull.material = hullWhite
  root.add(hull)
  const deckMesh = solid(new THREE.BoxGeometry(0.46, 0.04, long * 0.72), deck)
  deckMesh.position.y = 0.12
  root.add(deckMesh)
  if (kind === 'ship-cargo') {
    const colors = [0xc4512c, 0x2c6cb0, 0xd8d4c8, 0x3d7a45]
    let i = 0
    for (const z of [-0.35, -0.05, 0.25]) {
      for (const x of [-0.12, 0.12]) {
        const box = solid(new THREE.BoxGeometry(0.2, 0.16, 0.26), new THREE.MeshStandardMaterial({
          color: colors[i % colors.length]!,
          metalness: 0.25,
          roughness: 0.5,
        }))
        box.position.set(x, 0.24, z)
        root.add(box)
        i += 1
      }
    }
  }
  if (kind === 'ship-tanker') {
    for (const z of [-0.3, 0.05, 0.35]) {
      const tank = tube(0.12, 0.42, grayShip, 'z')
      tank.position.set(0, 0.22, z)
      root.add(tank)
    }
  }
  if (kind === 'ship-pax') {
    const block = solid(new THREE.BoxGeometry(0.36, 0.28, long * 0.45), hullWhite)
    block.position.set(0, 0.28, -0.05)
    const windows = solid(new THREE.BoxGeometry(0.38, 0.06, long * 0.4), glass)
    windows.position.set(0, 0.3, -0.05)
    root.add(block, windows)
  }
  if (kind === 'ship-sail') {
    const mast = tube(0.02, 0.7, dark, 'y')
    mast.position.set(0, 0.45, 0.05)
    const sail = solid(new THREE.BoxGeometry(0.02, 0.42, 0.28), new THREE.MeshStandardMaterial({ color: 0xf4efe4, roughness: 0.8 }))
    sail.position.set(0.02, 0.48, 0.05)
    root.add(mast, sail)
  }
  const house = solid(new THREE.BoxGeometry(0.28, kind === 'ship-tug' ? 0.32 : 0.22, 0.28), hullWhite)
  house.position.set(0, 0.26, -long * 0.32)
  const bridge = solid(new THREE.BoxGeometry(0.3, 0.06, 0.22), glass)
  bridge.position.set(0, 0.36, -long * 0.32)
  if (kind !== 'ship-sail') root.add(house, bridge)
  const funnel = tube(0.05, 0.16, kind === 'ship-mil' ? grayShip : dark, 'y')
  funnel.position.set(0.1, 0.42, -long * 0.28)
  if (kind !== 'ship-sail') root.add(funnel)
  return root
}

export function buildStation(): THREE.Group {
  const root = new THREE.Group()
  const truss = solid(new THREE.BoxGeometry(1.6, 0.06, 0.06), metal)
  root.add(truss)
  for (const x of [-0.35, 0, 0.35]) {
    const mod = tube(x === 0 ? 0.16 : 0.11, 0.38, x === 0 ? paint : gold, 'z')
    mod.position.set(x * 0.2, 0, 0)
    root.add(mod)
  }
  for (const side of [-1, 1]) {
    const panel = solid(new THREE.BoxGeometry(0.55, 0.015, 0.28), solar)
    panel.position.set(side * 0.7, 0, 0)
    const frame = solid(new THREE.BoxGeometry(0.58, 0.02, 0.02), gold)
    frame.position.copy(panel.position)
    root.add(panel, frame)
  }
  return root
}

export function buildCommsSat(): THREE.Group {
  const root = new THREE.Group()
  const bus = solid(new THREE.BoxGeometry(0.28, 0.22, 0.28), gold)
  root.add(bus)
  const dish = solid(new THREE.SphereGeometry(0.22, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.45), metal)
  dish.rotation.x = Math.PI
  dish.position.set(0, -0.05, 0.28)
  root.add(dish)
  for (const x of [-0.34, 0.34]) {
    const panel = solid(new THREE.BoxGeometry(0.28, 0.012, 0.16), solar)
    panel.position.set(x, 0, 0)
    root.add(panel)
  }
  return root
}

export function buildDebris(): THREE.Group {
  const root = new THREE.Group()
  const rock = solid(new THREE.IcosahedronGeometry(0.22, 1), metal)
  rock.scale.set(1.2, 0.7, 0.9)
  const shard = solid(new THREE.BoxGeometry(0.28, 0.02, 0.12), solar)
  shard.position.set(0.16, 0.08, 0)
  shard.rotation.z = 0.4
  root.add(rock, shard)
  return root
}

export function buildMarker(kind: string): THREE.Group {
  const root = new THREE.Group()
  if (kind === 'ico-storm') {
    for (const [x, y, z, s] of [[0, 0, 0, 0.28], [0.22, 0.05, 0.05, 0.18], [-0.2, 0.02, -0.04, 0.16]] as const) {
      const puff = solid(new THREE.SphereGeometry(s, 16, 12), new THREE.MeshStandardMaterial({ color: 0xd5dde2, roughness: 0.7 }))
      puff.position.set(x, y, z)
      root.add(puff)
    }
    return root
  }
  if (kind === 'ico-quake') {
    root.add(solid(new THREE.DodecahedronGeometry(0.28, 0), new THREE.MeshStandardMaterial({ color: 0x8a6244, roughness: 0.85 })))
    return root
  }
  if (kind === 'ico-launch') {
    const body = tube(0.08, 0.55, paint, 'y')
    body.position.y = 0.15
    const nose = solid(new THREE.ConeGeometry(0.08, 0.16, 16), paint)
    nose.position.y = 0.5
    const flame = solid(new THREE.ConeGeometry(0.06, 0.16, 12), new THREE.MeshStandardMaterial({ color: 0xe26a1a, emissive: 0xc2410c, emissiveIntensity: 0.6, roughness: 0.4 }))
    flame.rotateX(Math.PI)
    flame.position.y = -0.18
    root.add(body, nose, flame)
    return root
  }
  if (kind === 'ico-fire') {
    const flame = solid(new THREE.ConeGeometry(0.16, 0.4, 12), new THREE.MeshStandardMaterial({ color: 0xe25822, emissive: 0xb45309, emissiveIntensity: 0.5, roughness: 0.45 }))
    flame.position.y = 0.1
    root.add(flame)
    return root
  }
  if (kind === 'ico-volcano') {
    const cone = solid(new THREE.ConeGeometry(0.28, 0.4, 20), new THREE.MeshStandardMaterial({ color: 0x6b4a3a, roughness: 0.9 }))
    cone.position.y = 0.05
    const lava = solid(new THREE.CircleGeometry(0.06, 12), new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xdc2626, emissiveIntensity: 0.7 }))
    lava.rotation.x = -Math.PI / 2
    lava.position.y = 0.24
    root.add(cone, lava)
    return root
  }
  root.add(solid(new THREE.OctahedronGeometry(0.24, 1), new THREE.MeshStandardMaterial({ color: 0xd6a441, metalness: 0.6, roughness: 0.25 })))
  return root
}

export const JETS: Record<string, JetOpts> = {
  'air-b747': { length: 2.05, radius: 0.18, span: 0.95, sweep: 0.28, wingAt: 0.48, engines: 4, engineAt: 'wing', tail: 0.38, hump: true },
  'air-rj': { length: 1.45, radius: 0.14, span: 0.62, sweep: 0.14, wingAt: 0.5, engines: 2, engineAt: 'wing', tail: 0.26 },
  'air-prop': { length: 1.35, radius: 0.14, span: 0.72, sweep: 0.02, wingAt: 0.52, engines: 2, engineAt: 'wing', tail: 0.28, prop: true, highWing: true },
  'air-light': { length: 1.05, radius: 0.11, span: 0.7, sweep: 0, wingAt: 0.48, engines: 1, engineAt: 'wing', tail: 0.22, prop: true, highWing: true },
  'air-fighter': { length: 1.35, radius: 0.1, span: 0.55, sweep: 0.32, wingAt: 0.55, engines: 1, engineAt: 'wing', tail: 0.22, fighter: true, windows: false },
  'air-biz': { length: 1.4, radius: 0.12, span: 0.62, sweep: 0.18, wingAt: 0.5, engines: 2, engineAt: 'rear', tail: 0.26 },
  'air-cargo': { length: 1.9, radius: 0.22, span: 0.9, sweep: 0.16, wingAt: 0.5, engines: 2, engineAt: 'wing', tail: 0.36, cargo: true, highWing: true, windows: false },
  'air-unk': { length: 1.6, radius: 0.15, span: 0.75, sweep: 0.18, wingAt: 0.5, engines: 2, engineAt: 'wing', tail: 0.3 },
}

export function buildProcedural(id: string): THREE.Group {
  if (JETS[id]) return buildJet(JETS[id]!)
  if (id === 'air-heli') return buildHelicopter()
  if (id.startsWith('ship-')) return buildShip(id)
  if (id === 'sat-station') return buildStation()
  if (id === 'sat-comms') return buildCommsSat()
  if (id === 'sat-debris') return buildDebris()
  if (id.startsWith('ico-') || id === 'dot' || id === 'chevron' || id === 'diamond' || id === 'ring' || id === 'box' || id === 'drop') {
    return buildMarker(id)
  }
  return buildJet(JETS['air-unk']!)
}
