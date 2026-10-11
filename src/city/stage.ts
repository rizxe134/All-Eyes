/** City tiles, extruded footprints, road lines, and moving traffic. Owned by the globe. */

import * as THREE from 'three'
import { EARTH_KM, enuBasis, latLonToVec } from '../core/geo'
import type { ViewState } from '../core/types'
import { OSM_CREDIT, basemapCredit, effectiveSource, tileStack, type BasemapKeys, type BasemapMode, type BasemapSource } from './basemap'
import { tileCacheGet, tileCachePut } from './cache'
import { tileBounds, tilesForView, type TileId } from './mercator'
import type { CityBuilding, CityRoad, CityVectors } from './overpass'
import { simulateTraffic } from './traffic'

const R = 100
const METER = R / (EARTH_KM * 1000)
const TILE_LIFT_M = 8

export interface CityDraw {
  imagery: boolean
  roads: boolean
  buildings: boolean
  traffic: boolean
  flowRatio: number | null
}

export class CityStage {
  private group = new THREE.Group()
  private tileRoot = new THREE.Group()
  private tiles = new Map<string, THREE.Mesh>()
  private textures = new Map<string, THREE.Texture>()
  private loading = new Set<string>()
  private queue: string[] = []
  private active = 0
  private failed = new Map<string, number>()
  private roadLine: THREE.LineSegments | null = null
  private buildingMesh: THREE.Mesh | null = null
  private trafficMesh: THREE.InstancedMesh | null = null
  private dummy = new THREE.Object3D()
  private color = new THREE.Color()
  private vectors: CityVectors = { roads: [], rails: [], buildings: [], pois: [] }
  private vectorKey = ''
  private builtKey = ''
  private tileKey = ''
  private draw: CityDraw = { imagery: true, roads: true, buildings: true, traffic: true, flowRatio: null }
  private mode: BasemapMode = 'hybrid'
  private source: BasemapSource = 'free'
  private keys: BasemapKeys = { maptiler: '', mapbox: '' }
  private misses = 0
  note = 'MAP IDLE'

  constructor(scene: THREE.Scene) {
    this.group.add(this.tileRoot)
    scene.add(this.group)
  }

  setBasemap(mode: BasemapMode, source: BasemapSource, keys: BasemapKeys): void {
    if (this.mode === mode && this.source === source && this.keys.maptiler === keys.maptiler && this.keys.mapbox === keys.mapbox) return
    this.mode = mode
    this.source = source
    this.keys = { maptiler: keys.maptiler, mapbox: keys.mapbox }
    this.tileKey = ''
  }

  setDraw(draw: CityDraw): void {
    this.draw = draw
  }

  setVectors(data: CityVectors | null): void {
    this.vectors = data ?? { roads: [], rails: [], buildings: [], pois: [] }
    this.vectorKey = ''
    this.builtKey = ''
  }

  clearGpu(): void {
    for (const tex of this.textures.values()) tex.dispose()
    this.textures.clear()
    this.failed.clear()
    this.queue = []
    for (const mesh of this.tiles.values()) {
      mesh.geometry.dispose()
      const mat = mesh.material
      if (!Array.isArray(mat)) mat.dispose()
    }
    this.tiles.clear()
    this.tileRoot.clear()
    this.tileKey = ''
    this.note = 'MAP CACHE CLEARED'
  }

  update(view: ViewState, unixMs: number): void {
    const showTiles = this.draw.imagery && view.rangeKm < 1600
    this.tileRoot.visible = showTiles
    if (showTiles) this.syncTiles(view)
    else this.note = view.rangeKm < 1600 ? 'MAP OFF' : 'MAP ABOVE CITY'
    this.syncRoads(view)
    this.syncBuildings(view)
    this.syncTraffic(view, unixMs)
  }

  private syncTiles(view: ViewState): void {
    const tiles = tilesForView(view.lat, view.lon, view.rangeKm, 12)
    const key = `${this.mode}|${this.source}|${this.keys.maptiler ? 1 : 0}|${this.keys.mapbox ? 1 : 0}|${tiles.map((tile) => `${tile.z}/${tile.x}/${tile.y}`).join(',')}`
    if (key === this.tileKey) {
      this.pump()
      return
    }
    this.tileKey = key
    const keep = new Set<string>()
    for (const tile of tiles) {
      const stack = tileStack(this.mode, this.source, this.keys, tile.z, tile.x, tile.y)
      keep.add(this.ensureTile(`${tile.z}/${tile.x}/${tile.y}`, tile, stack.base, false))
      if (stack.overlay) keep.add(this.ensureTile(`${tile.z}/${tile.x}/${tile.y}/ov`, tile, stack.overlay, true))
    }
    for (const [id, mesh] of this.tiles) {
      if (keep.has(id)) continue
      this.tileRoot.remove(mesh)
      mesh.geometry.dispose()
      const mat = mesh.material
      if (!Array.isArray(mat)) mat.dispose()
      this.tiles.delete(id)
    }
    this.pruneTextures(keep)
    this.pump()
    const credit = `${basemapCredit(this.mode, effectiveSource(this.source, this.keys))} · ${OSM_CREDIT}`
    this.note = this.misses > 2 ? `MAP OFFLINE · ${credit}` : credit
  }

  private ensureTile(id: string, tile: TileId, url: string, overlay: boolean): string {
    let mesh = this.tiles.get(id)
    if (!mesh) {
      mesh = new THREE.Mesh(tileGeometry(tile), tileMaterial(overlay))
      mesh.renderOrder = overlay ? 3 : 2
      mesh.frustumCulled = false
      mesh.userData.url = url
      this.tileRoot.add(mesh)
      this.tiles.set(id, mesh)
    }
    const mat = mesh.material as THREE.MeshBasicMaterial
    const tex = this.textures.get(url)
    if (tex) {
      if (mat.map !== tex) {
        mat.map = tex
        mat.needsUpdate = true
      }
    } else this.enqueue(url)
    return id
  }

  private enqueue(url: string): void {
    const fail = this.failed.get(url)
    if (fail && fail > Date.now()) return
    if (this.textures.has(url) || this.loading.has(url) || this.queue.includes(url)) return
    this.queue.push(url)
  }

  private pump(): void {
    while (this.active < 4 && this.queue.length) {
      const url = this.queue.shift()
      if (!url || this.textures.has(url) || this.loading.has(url)) continue
      this.loading.add(url)
      this.active += 1
      void this.fetchTex(url).finally(() => {
        this.loading.delete(url)
        this.active -= 1
        this.pump()
      })
    }
  }

  private async fetchTex(url: string): Promise<void> {
    try {
      let blob = await tileCacheGet(url)
      if (!blob) {
        const res = await fetch(url)
        if (!res.ok) throw new Error(String(res.status))
        blob = await res.blob()
        if (blob.size < 32) throw new Error('empty')
        void tileCachePut(url, blob)
      }
      const bitmap = await createImageBitmap(blob)
      const tex = new THREE.Texture(bitmap)
      tex.colorSpace = THREE.SRGBColorSpace
      tex.magFilter = THREE.LinearFilter
      tex.minFilter = THREE.LinearFilter
      tex.generateMipmaps = false
      tex.needsUpdate = true
      this.textures.set(url, tex)
      this.failed.delete(url)
      this.misses = 0
      for (const mesh of this.tiles.values()) {
        if (mesh.userData.url !== url) continue
        const mat = mesh.material as THREE.MeshBasicMaterial
        mat.map = tex
        mat.needsUpdate = true
      }
    } catch {
      this.misses += 1
      this.failed.set(url, Date.now() + 20_000)
    }
  }

  private pruneTextures(keep: Set<string>): void {
    if (this.textures.size < 140) return
    const used = new Set<string>()
    for (const id of keep) {
      const mesh = this.tiles.get(id)
      const map = (mesh?.material as THREE.MeshBasicMaterial | undefined)?.map
      if (map) {
        for (const [url, tex] of this.textures) if (tex === map) used.add(url)
      }
    }
    for (const [url, tex] of this.textures) {
      if (used.has(url)) continue
      tex.dispose()
      this.textures.delete(url)
      if (this.textures.size < 96) break
    }
  }

  private syncRoads(view: ViewState): void {
    const on = this.draw.roads && view.rangeKm <= 55 && this.vectors.roads.length + this.vectors.rails.length > 0
    if (!on) {
      if (this.roadLine) this.roadLine.visible = false
      return
    }
    const key = `r${this.vectors.roads.length}:${this.vectors.rails.length}:${this.vectors.roads[0]?.id ?? ''}`
    if (this.roadLine && this.vectorKey === key) {
      this.roadLine.visible = true
      return
    }
    this.vectorKey = key
    this.roadLine?.geometry.dispose()
    ;(this.roadLine?.material as THREE.Material | undefined)?.dispose()
    if (this.roadLine) this.group.remove(this.roadLine)
    this.roadLine = roadLines([...this.vectors.roads, ...this.vectors.rails])
    this.group.add(this.roadLine)
  }

  private syncBuildings(view: ViewState): void {
    const on = this.draw.buildings && view.rangeKm <= 16 && this.vectors.buildings.length > 0
    if (!on) {
      if (this.buildingMesh) this.buildingMesh.visible = false
      return
    }
    const key = `b${this.vectors.buildings.length}:${this.vectors.buildings[0]?.id ?? ''}`
    if (this.buildingMesh && this.builtKey === key) {
      this.buildingMesh.visible = true
      return
    }
    this.builtKey = key
    this.buildingMesh?.geometry.dispose()
    ;(this.buildingMesh?.material as THREE.Material | undefined)?.dispose()
    if (this.buildingMesh) this.group.remove(this.buildingMesh)
    this.buildingMesh = buildingMesh(this.vectors.buildings)
    this.group.add(this.buildingMesh)
  }

  private syncTraffic(view: ViewState, unixMs: number): void {
    const on = this.draw.traffic && view.rangeKm <= 40 && (this.vectors.roads.length > 0 || this.vectors.rails.length > 0)
    if (!on) {
      if (this.trafficMesh) this.trafficMesh.visible = false
      return
    }
    const vehicles = simulateTraffic(this.vectors.roads, this.vectors.rails, unixMs, this.draw.flowRatio)
    if (!this.trafficMesh) {
      const geo = new THREE.BoxGeometry(1, 1, 1)
      const mat = new THREE.MeshBasicMaterial({ toneMapped: false, vertexColors: false })
      this.trafficMesh = new THREE.InstancedMesh(geo, mat, 240)
      this.trafficMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      this.trafficMesh.frustumCulled = false
      this.trafficMesh.renderOrder = 5
      this.group.add(this.trafficMesh)
    }
    this.trafficMesh.visible = true
    this.trafficMesh.count = vehicles.length
    vehicles.forEach((vehicle, index) => {
      const length = vehicle.kind === 'train' ? 18 : vehicle.kind === 'bus' ? 8 : 4.4
      const width = vehicle.kind === 'train' ? 2.6 : 1.8
      placeVehicle(this.dummy, vehicle.lat, vehicle.lon, vehicle.heading, length, width, vehicle.kind === 'train' ? 3.2 : 1.5)
      this.trafficMesh?.setMatrixAt(index, this.dummy.matrix)
      this.color.set(vehicle.color)
      this.trafficMesh?.setColorAt(index, this.color)
    })
    this.trafficMesh.instanceMatrix.needsUpdate = true
    if (this.trafficMesh.instanceColor) this.trafficMesh.instanceColor.needsUpdate = true
  }
}

function tileMaterial(overlay: boolean): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: overlay,
    opacity: overlay ? 0.95 : 1,
    depthWrite: !overlay,
    polygonOffset: true,
    polygonOffsetFactor: overlay ? -2 : -1,
    polygonOffsetUnits: overlay ? -4 : -2,
    toneMapped: false,
  })
}

function tileGeometry(tile: TileId): THREE.BufferGeometry {
  const bounds = tileBounds(tile.z, tile.x, tile.y)
  const rows = 4
  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  for (let r = 0; r <= rows; r++) {
    const lat = bounds.north + ((bounds.south - bounds.north) * r) / rows
    const v = 1 - r / rows
    for (let c = 0; c <= rows; c++) {
      const lon = bounds.west + ((bounds.east - bounds.west) * c) / rows
      const p = latLonToVec(lat, lon, TILE_LIFT_M / 1000, R)
      positions.push(p.x, p.y, p.z)
      uvs.push(c / rows, v)
    }
  }
  const stride = rows + 1
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < rows; c++) {
      const i = r * stride + c
      indices.push(i, i + stride, i + 1, i + 1, i + stride, i + stride + 1)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geo.setIndex(indices)
  return geo
}

function roadColor(cls: string): number {
  if (cls === 'motorway' || cls === 'motorway_link') return 0xffb020
  if (cls === 'trunk' || cls === 'primary') return 0x4da3ff
  if (cls.startsWith('rail') || cls === 'subway' || cls === 'tram' || cls === 'light_rail') return 0x7dffb3
  return 0x9ad4ff
}

function roadLines(roads: CityRoad[]): THREE.LineSegments {
  const positions: number[] = []
  const colors: number[] = []
  const color = new THREE.Color()
  for (const road of roads) {
    color.set(roadColor(road.cls))
    for (let i = 1; i < road.points.length; i++) {
      const a = latLonToVec(road.points[i - 1].lat, road.points[i - 1].lon, 0.012, R)
      const b = latLonToVec(road.points[i].lat, road.points[i].lon, 0.012, R)
      positions.push(a.x, a.y, a.z, b.x, b.y, b.z)
      colors.push(color.r, color.g, color.b, color.r, color.g, color.b)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  const mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, toneMapped: false })
  const line = new THREE.LineSegments(geo, mat)
  line.renderOrder = 4
  line.frustumCulled = false
  return line
}

function buildingMesh(buildings: CityBuilding[]): THREE.Mesh {
  const positions: number[] = []
  for (const building of buildings) {
    const ring = building.points
    if (ring.length < 3) continue
    const height = building.heightM
    const ground: THREE.Vector3[] = ring.map((p) => {
      const v = latLonToVec(p.lat, p.lon, 0.012, R)
      return new THREE.Vector3(v.x, v.y, v.z)
    })
    const roof: THREE.Vector3[] = ring.map((p) => {
      const v = latLonToVec(p.lat, p.lon, (12 + height) / 1000, R)
      return new THREE.Vector3(v.x, v.y, v.z)
    })
    const push = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => {
      positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z)
    }
    for (let i = 1; i < ground.length - 1; i++) push(roof[0], roof[i], roof[i + 1])
    for (let i = 0; i < ground.length; i++) {
      const j = (i + 1) % ground.length
      push(ground[i], ground[j], roof[j])
      push(ground[i], roof[j], roof[i])
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.computeVertexNormals()
  const mat = new THREE.MeshBasicMaterial({
    color: 0xd5dde6,
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
    toneMapped: false,
  })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.renderOrder = 4
  mesh.frustumCulled = false
  return mesh
}

function placeVehicle(obj: THREE.Object3D, lat: number, lon: number, heading: number, lengthM: number, widthM: number, heightM: number): void {
  const basis = enuBasis(lat, lon)
  const h = (heading * Math.PI) / 180
  const c = Math.cos(h)
  const s = Math.sin(h)
  const fx = basis.north.x * c + basis.east.x * s
  const fy = basis.north.y * c + basis.east.y * s
  const fz = basis.north.z * c + basis.east.z * s
  const rx = basis.east.x * c - basis.north.x * s
  const ry = basis.east.y * c - basis.north.y * s
  const rz = basis.east.z * c - basis.north.z * s
  const pos = latLonToVec(lat, lon, (14 + heightM) / 1000, R)
  obj.matrix.makeBasis(
    new THREE.Vector3(rx, ry, rz).multiplyScalar(widthM * METER),
    new THREE.Vector3(fx, fy, fz).multiplyScalar(lengthM * METER),
    new THREE.Vector3(basis.up.x, basis.up.y, basis.up.z).multiplyScalar(heightM * METER),
  )
  obj.matrix.setPosition(pos.x, pos.y, pos.z)
  obj.matrixAutoUpdate = false
}
