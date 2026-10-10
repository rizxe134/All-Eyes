import * as THREE from 'three'
import { buildProcedural } from './studio-models'

/**
 * Realistic viewer meshes. GLB files load on demand. Families without a small
 * freely licensed file use the original procedural builders.
 */

export interface ModelCredit {
  text: string
  href: string
  license: string
  licenseHref: string
}

interface GlbSource {
  url: string
  yaw: number
  credit: ModelCredit
}

const REPO = 'https://github.com/rizxe134/All-Eyes'
const MIT = 'https://opensource.org/license/mit'
const AMV = 'https://github.com/amvlab/aircraft-models'
const CC_BY = 'https://creativecommons.org/licenses/by/4.0/'
const NASA = 'https://github.com/nasa/NASA-3D-Resources'
const PD = 'https://creativecommons.org/publicdomain/mark/1.0/'

function amv(text: string): ModelCredit {
  return { text, href: AMV, license: 'CC BY 4.0', licenseHref: CC_BY }
}

function nasa(text: string): ModelCredit {
  return { text, href: NASA, license: 'Public domain', licenseHref: PD }
}

const GLB: Record<string, GlbSource> = {
  'air-a320': { url: '/models/air-a320.glb', yaw: Math.PI, credit: amv('A320 model by amvlab') },
  'air-b737': { url: '/models/air-b737.glb', yaw: Math.PI, credit: amv('737 model by amvlab') },
  'air-a350': { url: '/models/air-a350.glb', yaw: Math.PI, credit: amv('A350 model by amvlab') },
  'air-b777': {
    url: '/models/air-b777.glb',
    yaw: Math.PI,
    credit: amv('787 model by amvlab (widebody twin)'),
  },
  'air-a380': { url: '/models/air-a380.glb', yaw: Math.PI, credit: amv('A380 model by amvlab') },
  'air-heli': { url: '/models/air-heli.glb', yaw: 0, credit: nasa('Ingenuity helicopter by NASA') },
  'sat-wx': { url: '/models/sat-wx.glb', yaw: 0, credit: nasa('Aqua satellite by NASA') },
  'sat-nav': { url: '/models/sat-nav.glb', yaw: 0, credit: nasa('CYGNSS satellite by NASA') },
  'sat-science': { url: '/models/sat-science.glb', yaw: 0, credit: nasa('CubeSat model by NASA') },
}

const NAMES: Record<string, string> = {
  'air-b747': '747',
  'air-rj': 'regional jet',
  'air-prop': 'turboprop',
  'air-light': 'light aircraft',
  'air-fighter': 'fighter',
  'air-biz': 'business jet',
  'air-cargo': 'freighter',
  'air-unk': 'aircraft',
  'air-heli': 'helicopter',
  'ship-cargo': 'cargo ship',
  'ship-tanker': 'tanker',
  'ship-pax': 'passenger ship',
  'ship-fish': 'fishing vessel',
  'ship-mil': 'naval ship',
  'ship-tug': 'tug',
  'ship-sail': 'sailing vessel',
  'ship-unk': 'ship',
  'sat-station': 'space station',
  'sat-comms': 'communications satellite',
  'sat-debris': 'debris',
}

function originalCredit(id: string): ModelCredit {
  const name = NAMES[id] || 'model'
  return {
    text: `Original ${name} model by All Eyes contributors`,
    href: REPO,
    license: 'MIT',
    licenseHref: MIT,
  }
}

export function modelCredit(id: string): ModelCredit {
  return GLB[id]?.credit ?? originalCredit(id)
}

export function viewModelUrl(id: string): string | null {
  return GLB[id]?.url ?? null
}

interface Built {
  object: THREE.Object3D
  credit: ModelCredit
}

const cache = new Map<string, Promise<Built>>()
let gltfLoader: {
  loadAsync(url: string): Promise<{ scene: THREE.Group }>
} | null = null

async function gltf(): Promise<NonNullable<typeof gltfLoader>> {
  if (gltfLoader) return gltfLoader
  const [{ GLTFLoader }, { DRACOLoader }] = await Promise.all([
    import('three/examples/jsm/loaders/GLTFLoader.js'),
    import('three/examples/jsm/loaders/DRACOLoader.js'),
  ])
  const draco = new DRACOLoader()
  draco.setDecoderPath(`${import.meta.env.BASE_URL}draco/gltf/`)
  const loader = new GLTFLoader()
  loader.setDRACOLoader(draco)
  gltfLoader = loader
  return loader
}

function depth(node: THREE.Object3D): number {
  let count = 0
  let parent = node.parent
  while (parent) {
    count += 1
    parent = parent.parent
  }
  return count
}

function tagSpinners(root: THREE.Object3D): void {
  const hits: THREE.Object3D[] = []
  root.traverse((node) => {
    const name = node.name.toLowerCase()
    if (name.includes('rotor') || name.includes('propeller')) hits.push(node)
  })
  hits.sort((a, b) => depth(b) - depth(a))
  for (const node of hits) {
    const parent = node.parent
    if (!parent || parent.userData.spin) continue
    const spinner = new THREE.Group()
    spinner.name = `${node.name}__spin`
    spinner.userData.spin = 'rotor'
    spinner.userData.spinAxis = 'y'
    spinner.position.copy(node.position)
    spinner.quaternion.copy(node.quaternion)
    spinner.scale.copy(node.scale)
    parent.add(spinner)
    node.position.set(0, 0, 0)
    node.quaternion.identity()
    node.scale.set(1, 1, 1)
    spinner.add(node)
  }
}

function procedural(id: string): Built {
  return { object: buildProcedural(id), credit: originalCredit(id) }
}

function templateFor(id: string): Promise<Built> {
  const hit = cache.get(id)
  if (hit) return hit
  const glb = GLB[id]
  const pending = (async (): Promise<Built> => {
    if (!glb) return procedural(id)
    try {
      const loader = await gltf()
      const file = await loader.loadAsync(glb.url)
      tagSpinners(file.scene)
      return { object: file.scene, credit: glb.credit }
    } catch (error) {
      console.warn(`All Eyes: ${id} model failed, using a procedural stand-in`, error)
      return { object: buildProcedural(id), credit: originalCredit(id) }
    }
  })()
  cache.set(id, pending)
  return pending
}

function fitToPad(model: THREE.Object3D, yaw: number): THREE.Group {
  const fit = new THREE.Group()
  fit.name = 'fit'
  model.rotation.y += yaw
  fit.add(model)
  fit.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(fit)
  const size = box.getSize(new THREE.Vector3())
  const span = Math.max(size.x, size.y, size.z, 0.001)
  fit.scale.setScalar(1.7 / span)
  fit.updateMatrixWorld(true)
  const fitted = new THREE.Box3().setFromObject(fit)
  const center = fitted.getCenter(new THREE.Vector3())
  fit.position.x -= center.x
  fit.position.z -= center.z
  fit.position.y -= fitted.min.y
  return fit
}

export interface ViewModel {
  root: THREE.Group
  credit: ModelCredit
}

export async function createViewModel(id: string): Promise<ViewModel> {
  const built = await templateFor(id || 'dot')
  const clone = built.object.clone(true)
  clone.traverse((node) => {
    const mesh = node as THREE.Mesh
    if (!mesh.isMesh) return
    mesh.castShadow = true
    mesh.receiveShadow = true
  })
  const yaw = GLB[id]?.yaw ?? 0
  return { root: fitToPad(clone, yaw), credit: built.credit }
}

const dumped = new Set<THREE.BufferGeometry | THREE.Material | THREE.Texture>()

function disposeMaterial(material: THREE.Material): void {
  if (dumped.has(material)) return
  dumped.add(material)
  for (const value of Object.values(material)) {
    if (value instanceof THREE.Texture && !dumped.has(value)) {
      dumped.add(value)
      value.dispose()
    }
  }
  material.dispose()
}

export async function disposeViewModels(): Promise<void> {
  const pending = [...cache.values()]
  cache.clear()
  const built = await Promise.all(pending.map((item) => item.catch(() => null)))
  for (const entry of built) {
    if (!entry) continue
    entry.object.traverse((node) => {
      const mesh = node as THREE.Mesh
      if (mesh.geometry instanceof THREE.BufferGeometry && !dumped.has(mesh.geometry)) {
        dumped.add(mesh.geometry)
        mesh.geometry.dispose()
      }
      if (Array.isArray(mesh.material)) mesh.material.forEach(disposeMaterial)
      else if (mesh.material) disposeMaterial(mesh.material)
    })
  }
}
