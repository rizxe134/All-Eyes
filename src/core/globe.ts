import * as THREE from 'three'
import {
  EARTH_KM,
  clamp,
  latLonToVec,
  lerpLon,
  sunDirection,
  vecToLatLon,
  type Vec3,
} from './geo'
import { declutterCellDeg, declutterMarkers, markerScreenPx } from './markers'
import { chooseHit } from './pick'
import { MARKER_MAX, MARKER_DEFAULT, MARKER_MIN } from './settings'
import { spriteRows } from './sprites'
import type { GeoPoint, GlobeApi, GlobeClick, GlobeTheme, Marker, ViewState } from './types'

const R = 100
/** Silhouettes only once the view is close enough that contacts are separated. */
const SPRITE_RANGE = 640
const HIT_PX = 12

interface DrawItem {
  layerId: string
  marker: Marker
}

interface Pool {
  id: string
  mesh: THREE.InstancedMesh | null
  capacity: number
  items: DrawItem[]
  aspect: number
}

interface Flight {
  fromLat: number
  fromLon: number
  fromRange: number
  toLat: number
  toLon: number
  toRange: number
  t0: number
  dur: number
}

function ease(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2
}

const EARTH_VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorld;
void main() {
  vUv = uv;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`

const EARTH_FRAG = /* glsl */ `
varying vec2 vUv;
varying vec3 vNormal;
uniform vec3 uSun;
uniform sampler2D uDay;
uniform sampler2D uNight;
uniform float uHasTex;
uniform float uTheme;

float bayer(vec2 pix) {
  vec2 p = floor(mod(pix, 4.0));
  float v = 0.0;
  if (p.y < 1.0) {
    if (p.x < 1.0) v = 0.0;
    else if (p.x < 2.0) v = 8.0;
    else if (p.x < 3.0) v = 2.0;
    else v = 10.0;
  } else if (p.y < 2.0) {
    if (p.x < 1.0) v = 12.0;
    else if (p.x < 2.0) v = 4.0;
    else if (p.x < 3.0) v = 14.0;
    else v = 6.0;
  } else if (p.y < 3.0) {
    if (p.x < 1.0) v = 3.0;
    else if (p.x < 2.0) v = 11.0;
    else if (p.x < 3.0) v = 1.0;
    else v = 9.0;
  } else {
    if (p.x < 1.0) v = 15.0;
    else if (p.x < 2.0) v = 7.0;
    else if (p.x < 3.0) v = 13.0;
    else v = 5.0;
  }
  return v / 16.0;
}

void main() {
  vec3 day = texture2D(uDay, vUv).rgb;
  vec3 night = texture2D(uNight, vUv).rgb;
  float dayL = dot(day, vec3(0.299, 0.587, 0.114));
  float nightL = dot(night, vec3(0.299, 0.587, 0.114));
  float fake = smoothstep(0.25, 0.85, sin(vUv.x * 17.0) * sin(vUv.y * 8.0) * 0.5 + 0.5);
  float luma = mix(fake * 0.45 + 0.12, mix(nightL * 1.15, dayL, 1.0), uHasTex);
  float ndl = dot(normalize(vNormal), normalize(uSun));
  float light = smoothstep(-0.15, 0.35, ndl);
  luma = mix(luma * 0.22 + nightL * uHasTex * 0.85, luma, light);
  luma = clamp(luma + (bayer(gl_FragCoord.xy) - 0.5) * 0.06, 0.0, 1.0);
  luma = floor(luma * 5.0) / 5.0;
  float lonF = fract(vUv.x * 12.0);
  float latF = fract(vUv.y * 6.0);
  float grid = 1.0 - smoothstep(0.0, 0.006, min(min(lonF, 1.0 - lonF), min(latF, 1.0 - latF)));
  float equator = 1.0 - smoothstep(0.0, 0.0022, abs(vUv.y - 0.5));
  vec3 green = vec3(0.05, 0.42, 0.16) * luma + vec3(0.012, 0.05, 0.02);
  green += vec3(0.25, 0.95, 0.45) * grid * 0.12;
  green += vec3(0.45, 1.0, 0.62) * equator * 0.16;
  green += vec3(0.55, 1.0, 0.72) * nightL * (1.0 - light) * uHasTex * 0.55;
  float limb = pow(1.0 - abs(ndl), 6.0);
  green += vec3(0.2, 0.7, 0.35) * limb * 0.06;
  vec3 natural = mix(vec3(0.05, 0.12, 0.28), day, uHasTex);
  natural *= mix(0.2, 1.0, light);
  natural += night * (1.0 - light) * uHasTex * 0.9;
  natural += vec3(0.8, 0.92, 0.9) * grid * 0.05;
  natural += vec3(0.9, 0.96, 0.94) * equator * 0.06;
  gl_FragColor = vec4(mix(green, natural, uTheme), 1.0);
}
`

const ATMOS_FRAG = /* glsl */ `
varying vec3 vNormal;
varying vec3 vWorld;
uniform vec3 uCam;
uniform vec3 uSun;
uniform float uTheme;
void main() {
  vec3 n = normalize(vNormal);
  vec3 viewDir = normalize(uCam - vWorld);
  float fres = pow(1.0 - abs(dot(n, viewDir)), 2.8);
  float sun = pow(max(dot(n, normalize(uSun)), 0.0), 1.4);
  float alpha = fres * mix(0.28 + sun * 0.4, 0.18 + sun * 0.28, uTheme);
  vec3 tint = mix(vec3(0.35, 1.0, 0.55), vec3(0.45, 0.72, 1.0), uTheme);
  gl_FragColor = vec4(tint, alpha);
}
`

const RADAR_FRAG = /* glsl */ `
varying vec2 vUv;
uniform sampler2D uMap;
void main() {
  float v = texture2D(uMap, vUv).a;
  if (v < 0.06) discard;
  gl_FragColor = vec4(0.45, 1.0, 0.78, 1.0) * (v * 0.34);
}
`

const plane = new THREE.PlaneGeometry(1, 1)

function bakeSprite(id: string): { texture: THREE.CanvasTexture; aspect: number } {
  const rows = spriteRows(id)
  const height = Math.max(1, rows.length)
  const width = Math.max(1, rows[0]?.length ?? 1)
  const pixel = 4
  // Far dots are a solid block. A 1 px halo rounds a 2 px speck down to nothing.
  const pad = id === 'dot' ? 0 : 1
  const canvas = document.createElement('canvas')
  canvas.width = width * pixel + pad * 2
  canvas.height = height * pixel + pad * 2
  const ctx = canvas.getContext('2d')
  const lit: Array<[number, number]> = []
  for (let y = 0; y < height; y++) {
    const row = rows[y] ?? ''
    for (let x = 0; x < width; x++) {
      const ch = row[x]
      if (!ch || ch === '.' || ch === ' ') continue
      lit.push([x, y])
    }
  }
  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (pad > 0) {
      ctx.fillStyle = '#07140c'
      for (const [x, y] of lit) ctx.fillRect(x * pixel, y * pixel, pixel + pad * 2, pixel + pad * 2)
    }
    ctx.fillStyle = '#ffffff'
    for (const [x, y] of lit) ctx.fillRect(x * pixel + pad, y * pixel + pad, pixel, pixel)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.magFilter = THREE.NearestFilter
  texture.minFilter = THREE.NearestFilter
  texture.generateMipmaps = false
  texture.colorSpace = THREE.NoColorSpace
  texture.needsUpdate = true
  return { texture, aspect: width / height }
}

function markerTint(id: string, lift: number): [number, number, number] {
  if (id === 'ico-quake' || id === 'ico-fire' || id === 'ico-launch') return [lift, lift * 0.84, lift * 0.38]
  if (id === 'ico-storm') return [lift * 0.5, lift, lift]
  if (id === 'sel-ring') return [lift, lift, lift * 0.9]
  return [lift * 0.9, lift, lift * 0.92]
}

function graticule(): THREE.LineSegments {
  const positions: number[] = []
  const push = (a: Vec3, b: Vec3) => {
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z)
  }
  const radius = R * 1.002
  for (let lon = -180; lon < 180; lon += 30) {
    let prev = latLonToVec(-80, lon, 0, radius)
    for (let lat = -75; lat <= 80; lat += 5) {
      const next = latLonToVec(lat, lon, 0, radius)
      push(prev, next)
      prev = next
    }
  }
  for (let lat = -60; lat <= 60; lat += 30) {
    let prev = latLonToVec(lat, -180, 0, radius)
    for (let lon = -170; lon <= 180; lon += 10) {
      const next = latLonToVec(lat, lon, 0, radius)
      push(prev, next)
      prev = next
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  return new THREE.LineSegments(
    geo,
    new THREE.LineBasicMaterial({ color: 0x9eb8b4, transparent: true, opacity: 0.14, toneMapped: false }),
  )
}

export class Globe implements GlobeApi {
  readonly canvas: HTMLCanvasElement
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera: THREE.PerspectiveCamera
  private earth: THREE.Mesh
  private radarMesh: THREE.Mesh
  private radarTex: THREE.CanvasTexture | null = null
  private earthUniforms: {
    uSun: { value: THREE.Vector3 }
    uDay: { value: THREE.Texture }
    uNight: { value: THREE.Texture }
    uHasTex: { value: number }
    uTheme: { value: number }
  }
  private atmosUniforms: { uCam: { value: THREE.Vector3 }; uSun: { value: THREE.Vector3 }; uTheme: { value: number } }
  private gratMat: THREE.LineBasicMaterial
  private starMat!: THREE.PointsMaterial
  private layers = new Map<string, Marker[]>()
  private pools = new Map<string, Pool>()
  private mats = new Map<string, THREE.MeshBasicMaterial>()
  private aspects = new Map<string, number>()
  private orbit = new THREE.Group()
  private history = new THREE.Group()
  private route = new THREE.Group()
  private raycaster = new THREE.Raycaster()
  private pointer = new THREE.Vector2()
  private view: ViewState = { lat: 14, lon: 12, rangeKm: 9800 }
  private flight: Flight | null = null
  private follow: { lat: number; lon: number; altKm: number } | null = null
  private followRange = 1400
  private highlightId: string | null = null
  private hoverId: string | null = null
  private markerSize = MARKER_DEFAULT
  private theme: GlobeTheme = 'color'
  private hitKey = ''
  private hitIndex = 0
  private bucket = -1
  private lodRange = 0
  private dirty = true
  private dragging = false
  private moved = 0
  private velLat = 0
  private velLon = 0
  private lastX = 0
  private lastY = 0
  private clickers = new Set<(hit: GlobeClick) => void>()
  private movers = new Set<(hit: { lat: number; lon: number } | null) => void>()
  private hoverers = new Set<(hit: { marker: Marker; layerId: string; x: number; y: number } | null) => void>()
  private releasers = new Set<() => void>()
  private scratch = {
    pos: new THREE.Vector3(),
    right: new THREE.Vector3(),
    forward: new THREE.Vector3(),
    up: new THREE.Vector3(),
    matrix: new THREE.Matrix4(),
    color: new THREE.Color(),
    target: new THREE.Vector3(),
    north: new THREE.Vector3(),
    camUp: new THREE.Vector3(),
  }

  constructor(
    canvas: HTMLCanvasElement,
    private time: () => number,
  ) {
    this.canvas = canvas
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    })
    this.renderer.setClearColor(0x02060c, 1)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.NoToneMapping
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.05, 4000)
    const blank = new THREE.DataTexture(new Uint8Array([8, 40, 18, 255]), 1, 1)
    blank.needsUpdate = true
    this.earthUniforms = {
      uSun: { value: new THREE.Vector3(1, 0, 0) },
      uDay: { value: blank },
      uNight: { value: blank },
      uHasTex: { value: 0 },
      uTheme: { value: 1 },
    }
    this.earth = new THREE.Mesh(
      new THREE.SphereGeometry(R, 96, 64),
      new THREE.ShaderMaterial({
        uniforms: this.earthUniforms,
        vertexShader: EARTH_VERT,
        fragmentShader: EARTH_FRAG,
        toneMapped: false,
      }),
    )
    this.scene.add(this.earth)
    const grat = graticule()
    this.gratMat = grat.material as THREE.LineBasicMaterial
    this.scene.add(grat)
    this.atmosUniforms = {
      uCam: { value: new THREE.Vector3() },
      uSun: { value: this.earthUniforms.uSun.value },
      uTheme: { value: 1 },
    }
    const atmos = new THREE.Mesh(
      new THREE.SphereGeometry(R * 1.055, 64, 48),
      new THREE.ShaderMaterial({
        uniforms: this.atmosUniforms,
        vertexShader: EARTH_VERT,
        fragmentShader: ATMOS_FRAG,
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    )
    this.scene.add(atmos)
    this.radarMesh = new THREE.Mesh(
      new THREE.SphereGeometry(R * 1.012, 64, 48),
      new THREE.ShaderMaterial({
        uniforms: { uMap: { value: blank } },
        vertexShader: EARTH_VERT,
        fragmentShader: RADAR_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    )
    this.radarMesh.visible = false
    this.scene.add(this.radarMesh)
    this.scene.add(this.orbit)
    this.scene.add(this.history)
    this.scene.add(this.route)
    this.addStars()
    this.loadTextures()
    this.resize()
    window.addEventListener('resize', this.resize)
    canvas.addEventListener('pointerdown', this.onDown)
    canvas.addEventListener('pointermove', this.pointerMove)
    window.addEventListener('pointerup', this.onUp)
    canvas.addEventListener('wheel', this.onWheel, { passive: false })
    this.renderer.setAnimationLoop(this.frame)
  }

  setMarkers(layerId: string, markers: Marker[]): void {
    this.layers.set(layerId, markers)
    this.dirty = true
  }

  setRadarCanvas(canvas: HTMLCanvasElement | null): void {
    if (!canvas) {
      this.radarMesh.visible = false
      return
    }
    if (!this.radarTex) {
      this.radarTex = new THREE.CanvasTexture(canvas)
      this.radarTex.colorSpace = THREE.NoColorSpace
      const mat = this.radarMesh.material as THREE.ShaderMaterial
      mat.uniforms.uMap.value = this.radarTex
    } else {
      this.radarTex.image = canvas
    }
    this.radarTex.needsUpdate = true
    this.radarMesh.visible = true
  }

  setOrbit(points: GeoPoint[] | null): void {
    this.drawPath(this.orbit, points, false, 0x3dff7a, 0.38)
  }

  setHistory(points: GeoPoint[] | null): void {
    this.drawPath(this.history, points, false, 0xb6ffd0, 0.92)
  }

  setRoute(points: GeoPoint[] | null): void {
    this.drawPath(this.route, points, true, 0xd8ffe8, 0.85)
  }

  private drawPath(group: THREE.Group, points: GeoPoint[] | null, dashed: boolean, color: number, opacity: number) {
    for (const child of group.children) {
      const line = child as THREE.Line
      line.geometry.dispose()
      const mat = line.material
      if (!Array.isArray(mat)) mat.dispose()
    }
    group.clear()
    if (!points || points.length < 2) return
    let chunk: number[] = []
    const prev = new THREE.Vector3()
    const cur = new THREE.Vector3()
    let hasPrev = false
    const flush = () => {
      if (chunk.length < 6) {
        chunk = []
        return
      }
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.Float32BufferAttribute(chunk, 3))
      const mat = dashed
        ? new THREE.LineDashedMaterial({ color, dashSize: 0.85, gapSize: 0.5, transparent: true, opacity, toneMapped: false })
        : new THREE.LineBasicMaterial({ color, transparent: true, opacity, toneMapped: false })
      const line = new THREE.Line(geo, mat)
      if (dashed) line.computeLineDistances()
      group.add(line)
      chunk = []
    }
    for (const point of points) {
      this.place(cur, point.lat, point.lon, point.altKm, 0.8)
      if (hasPrev && prev.distanceTo(cur) >= R * 0.45) flush()
      chunk.push(cur.x, cur.y, cur.z)
      prev.copy(cur)
      hasPrev = true
    }
    flush()
  }

  setHighlight(id: string | null): void {
    if (id === this.highlightId) return
    this.highlightId = id
    this.dirty = true
  }

  setMarkerSize(scale: number): void {
    this.markerSize = clamp(scale, MARKER_MIN, MARKER_MAX)
  }

  setTheme(theme: GlobeTheme): void {
    this.theme = theme === 'green' ? 'green' : 'color'
    const color = this.theme === 'color' ? 1 : 0
    this.earthUniforms.uTheme.value = color
    this.atmosUniforms.uTheme.value = color
    if (color) {
      this.gratMat.color.setHex(0x9eb8b4)
      this.gratMat.opacity = 0.14
      this.starMat.color.setHex(0xe7f1ff)
      this.starMat.opacity = 0.7
      this.renderer.setClearColor(0x02060c, 1)
    } else {
      this.gratMat.color.setHex(0x1f8f45)
      this.gratMat.opacity = 0.22
      this.starMat.color.setHex(0xc8ffd4)
      this.starMat.opacity = 0.55
      this.renderer.setClearColor(0x010a06, 1)
    }
  }

  flyTo(lat: number, lon: number, rangeKm = 1800): void {
    this.flight = {
      fromLat: this.view.lat,
      fromLon: this.view.lon,
      fromRange: this.view.rangeKm,
      toLat: clamp(lat, -85, 85),
      toLon: lon,
      toRange: clamp(rangeKm, 180, 70000),
      t0: performance.now(),
      dur: 1200,
    }
  }

  setView(lat: number, lon: number, rangeKm: number): void {
    this.flight = null
    this.view.lat = clamp(lat, -85, 85)
    this.view.lon = lon
    this.view.rangeKm = clamp(rangeKm, 180, 70000)
  }

  getView(): ViewState {
    return { ...this.view }
  }

  setFollow(target: { lat: number; lon: number; altKm: number } | null): void {
    const starting = !this.follow && !!target
    this.follow = target
    if (target && starting) this.followRange = clamp(360 + target.altKm * 0.35, 260, 9000)
  }

  project(lat: number, lon: number, altKm: number): { x: number; y: number; visible: boolean } {
    this.place(this.scratch.pos, lat, lon, altKm, 0.3)
    const world = this.scratch.pos.clone()
    const facing = world.normalize().dot(this.camera.position.clone().normalize())
    world.copy(this.scratch.pos).project(this.camera)
    const w = this.canvas.clientWidth || 1
    const h = this.canvas.clientHeight || 1
    return {
      x: (world.x * 0.5 + 0.5) * w,
      y: (-world.y * 0.5 + 0.5) * h,
      visible: facing > 0.08 && world.z < 1,
    }
  }

  onClick(cb: (hit: GlobeClick) => void): () => void {
    this.clickers.add(cb)
    return () => this.clickers.delete(cb)
  }

  onMove(cb: (hit: { lat: number; lon: number } | null) => void): () => void {
    this.movers.add(cb)
    return () => this.movers.delete(cb)
  }

  onHover(cb: (hit: { marker: Marker; layerId: string; x: number; y: number } | null) => void): () => void {
    this.hoverers.add(cb)
    return () => this.hoverers.delete(cb)
  }

  onRelease(cb: () => void): () => void {
    this.releasers.add(cb)
    return () => this.releasers.delete(cb)
  }

  private resize = () => {
    const w = window.innerWidth
    const h = window.innerHeight
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / Math.max(1, h)
    this.camera.updateProjectionMatrix()
  }

  private loadTextures() {
    const loader = new THREE.TextureLoader()
    let loaded = 0
    const done = (tex: THREE.Texture, slot: 'uDay' | 'uNight') => {
      // Raw sRGB bytes. A custom shader has no colorspace chunk, so decoding here would display the globe too dark.
      tex.colorSpace = THREE.NoColorSpace
      tex.anisotropy = 4
      this.earthUniforms[slot].value = tex
      loaded += 1
      if (loaded === 2) this.earthUniforms.uHasTex.value = 1
    }
    loader.load('/textures/earth-day.jpg', (tex) => done(tex, 'uDay'))
    loader.load('/textures/earth-night.jpg', (tex) => done(tex, 'uNight'))
  }

  private addStars() {
    const count = 1400
    const positions = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      const radius = 520 + Math.random() * 180
      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta)
      positions[i * 3 + 1] = radius * Math.cos(phi)
      positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta)
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    this.starMat = new THREE.PointsMaterial({
      color: 0xe7f1ff,
      size: 1.35,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      toneMapped: false,
    })
    this.scene.add(new THREE.Points(geo, this.starMat))
  }

  private place(out: THREE.Vector3, lat: number, lon: number, altKm: number, lift: number) {
    const phi = ((90 - lat) * Math.PI) / 180
    const theta = ((lon + 180) * Math.PI) / 180
    const radius = R * (1 + altKm / EARTH_KM) + lift
    const sinPhi = Math.sin(phi)
    out.set(-radius * sinPhi * Math.cos(theta), radius * Math.cos(phi), radius * sinPhi * Math.sin(theta))
  }

  private orient(lat: number, lon: number, heading: number, scale: number) {
    const phi = ((90 - lat) * Math.PI) / 180
    const theta = ((lon + 180) * Math.PI) / 180
    const sinPhi = Math.sin(phi)
    const cosPhi = Math.cos(phi)
    const cosT = Math.cos(theta)
    const sinT = Math.sin(theta)
    const ux = -sinPhi * cosT
    const uy = cosPhi
    const uz = sinPhi * sinT
    const lat2 = Math.min(89.7, lat + 0.05)
    const phi2 = ((90 - lat2) * Math.PI) / 180
    let nx = -Math.sin(phi2) * cosT - ux
    let ny = Math.cos(phi2) - uy
    let nz = Math.sin(phi2) * sinT - uz
    let len = Math.hypot(nx, ny, nz) || 1
    nx /= len
    ny /= len
    nz /= len
    const along = nx * ux + ny * uy + nz * uz
    nx -= ux * along
    ny -= uy * along
    nz -= uz * along
    len = Math.hypot(nx, ny, nz) || 1
    nx /= len
    ny /= len
    nz /= len
    let ex = ny * uz - nz * uy
    let ey = nz * ux - nx * uz
    let ez = nx * uy - ny * ux
    len = Math.hypot(ex, ey, ez) || 1
    ex /= len
    ey /= len
    ez /= len
    const nnx = uy * ez - uz * ey
    const nny = uz * ex - ux * ez
    const nnz = ux * ey - uy * ex
    len = Math.hypot(nnx, nny, nnz) || 1
    nx = nnx / len
    ny = nny / len
    nz = nnz / len
    const h = (heading * Math.PI) / 180
    const c = Math.cos(h)
    const s = Math.sin(h)
    this.scratch.right.set(ex * c - nx * s, ey * c - ny * s, ez * c - nz * s).multiplyScalar(scale)
    this.scratch.forward.set(nx * c + ex * s, ny * c + ey * s, nz * c + ez * s).multiplyScalar(scale)
    this.scratch.up.set(ux, uy, uz).multiplyScalar(scale)
  }

  private frame = () => {
    const now = performance.now()
    if (this.flight) {
      const t = clamp((now - this.flight.t0) / this.flight.dur, 0, 1)
      const e = ease(t)
      this.view.lat = this.flight.fromLat + (this.flight.toLat - this.flight.fromLat) * e
      this.view.lon = lerpLon(this.flight.fromLon, this.flight.toLon, e)
      this.view.rangeKm = this.flight.fromRange + (this.flight.toRange - this.flight.fromRange) * e
      if (t >= 1) this.flight = null
    } else if (this.follow) {
      this.view.lat += (this.follow.lat - this.view.lat) * 0.08
      this.view.lon = lerpLon(this.view.lon, this.follow.lon, 0.08)
      this.view.rangeKm += (this.followRange - this.view.rangeKm) * 0.06
    } else if (Math.abs(this.velLat) + Math.abs(this.velLon) > 0.0008) {
      this.view.lat = clamp(this.view.lat + this.velLat, -85, 85)
      this.view.lon += this.velLon
      this.velLat *= 0.9
      this.velLon *= 0.9
    }
    this.placeCamera()
    const sun = sunDirection(this.time())
    this.earthUniforms.uSun.value.set(sun.x, sun.y, sun.z)
    this.atmosUniforms.uCam.value.copy(this.camera.position)
    this.writeMarkers(now)
    this.renderer.render(this.scene, this.camera)
  }

  private placeCamera() {
    const { target, north, camUp } = this.scratch
    this.place(target, this.view.lat, this.view.lon, 0, 0)
    const normal = target.clone().normalize()
    const dist = R + (this.view.rangeKm / EARTH_KM) * R
    this.camera.position.copy(normal).multiplyScalar(dist)
    this.place(north, Math.min(89.2, this.view.lat + 0.35), this.view.lon, 0, 0)
    camUp.copy(north).sub(target)
    if (camUp.lengthSq() < 1e-6) camUp.set(0, 1, 0)
    this.camera.up.copy(camUp.normalize())
    this.camera.lookAt(target)
  }

  private spriteMaterial(id: string): THREE.MeshBasicMaterial {
    const hit = this.mats.get(id)
    if (hit) return hit
    const baked = bakeSprite(id)
    this.aspects.set(id, baked.aspect)
    const mat = new THREE.MeshBasicMaterial({
      map: baked.texture,
      color: 0xffffff,
      transparent: true,
      alphaTest: 0.4,
      depthWrite: false,
      depthTest: true,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      // The heading basis can face either way. Both sides stay drawn; depth hides the far hemisphere.
      side: THREE.DoubleSide,
      toneMapped: false,
    })
    this.mats.set(id, mat)
    return mat
  }

  private drawSprite(marker: Marker): string {
    if (this.view.rangeKm > SPRITE_RANGE) return 'dot'
    return marker.shape || 'dot'
  }

  private rebuildPools() {
    const range = this.view.rangeKm
    const cell = declutterCellDeg(range)
    const grouped = new Map<string, DrawItem[]>()
    const keep = new Set<string>()
    if (this.highlightId) keep.add(this.highlightId)
    if (this.hoverId) keep.add(this.hoverId)
    for (const [layerId, markers] of this.layers) {
      const extras = declutterMarkers(markers, cell, keep)
      for (const marker of extras) {
        const sprite = this.drawSprite(marker)
        const list = grouped.get(sprite) ?? []
        list.push({ layerId, marker })
        grouped.set(sprite, list)
        if (marker.id === this.highlightId && (sprite.startsWith('air-') || sprite === 'dot')) {
          const ring = grouped.get('sel-ring') ?? []
          ring.push({ layerId, marker })
          grouped.set('sel-ring', ring)
        }
      }
    }
    for (const [id, pool] of this.pools) {
      if (!grouped.has(id)) {
        pool.items = []
        if (pool.mesh) pool.mesh.visible = false
      }
    }
    for (const [id, items] of grouped) {
      let pool = this.pools.get(id)
      if (!pool) {
        pool = { id, mesh: null, capacity: 0, items: [], aspect: 1 }
        this.pools.set(id, pool)
      }
      pool.items = items
      this.ensurePool(pool, items.length)
    }
    this.bucket = range > SPRITE_RANGE ? 1 : 0
    this.lodRange = range
  }

  private ensurePool(pool: Pool, count: number) {
    if (count === 0) {
      if (pool.mesh) pool.mesh.visible = false
      return
    }
    if (pool.mesh && pool.capacity >= count) {
      pool.mesh.count = count
      pool.mesh.visible = true
      return
    }
    if (pool.mesh) {
      this.scene.remove(pool.mesh)
      pool.mesh.dispose()
    }
    const capacity = Math.max(64, 2 ** Math.ceil(Math.log2(count)))
    const mesh = new THREE.InstancedMesh(plane, this.spriteMaterial(pool.id), capacity)
    mesh.count = count
    mesh.frustumCulled = false
    mesh.renderOrder = 4
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.scene.add(mesh)
    pool.mesh = mesh
    pool.capacity = capacity
    pool.aspect = this.aspects.get(pool.id) ?? 1
  }

  private writeMarkers(now: number) {
    const range = this.view.rangeKm
    const bucket = range > SPRITE_RANGE ? 1 : 0
    const drift = bucket === 1 ? 240 : 36
    if (this.dirty || bucket !== this.bucket || Math.abs(range - this.lodRange) > drift) {
      this.rebuildPools()
      this.dirty = false
    }
    const dist = this.camera.position.length()
    const height = this.canvas.clientHeight || 800
    const tan = Math.tan((38 * Math.PI) / 360)
    for (const pool of this.pools.values()) {
      const mesh = pool.mesh
      if (!mesh || !mesh.visible) continue
      const airy = pool.id.startsWith('air-')
      const ring = pool.id === 'sel-ring'
      const far = range > SPRITE_RANGE
      const pixels = markerScreenPx(far, ring, airy, this.markerSize)
      const world = clamp((pixels * dist * tan) / (height * 0.5), 0.02, 12)
      const pulseBase = pool.id === 'ico-quake' || pool.id === 'ico-storm'
      for (let i = 0; i < pool.items.length; i++) {
        const marker = pool.items[i]!.marker
        const hot = marker.id === this.highlightId || marker.id === this.hoverId
        const pulse = pulseBase ? 1 + Math.sin(now / 280 + i) * 0.08 : 1
        const scale = world * marker.scale * pulse * (ring ? 1 : hot ? 1.12 : 1)
        this.place(this.scratch.pos, marker.lat, marker.lon, marker.altKm, 0.9)
        this.orient(marker.lat, marker.lon, marker.heading || 0, scale)
        this.scratch.right.multiplyScalar(pool.aspect)
        this.scratch.matrix.makeBasis(this.scratch.right, this.scratch.forward, this.scratch.up)
        this.scratch.matrix.setPosition(this.scratch.pos)
        mesh.setMatrixAt(i, this.scratch.matrix)
        const lift = hot ? 1 : 0.9 + clamp(marker.brightness, 0, 1) * 0.1
        const tint = markerTint(pool.id, lift)
        this.scratch.color.setRGB(tint[0], tint[1], tint[2])
        mesh.setColorAt(i, this.scratch.color)
      }
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    }
  }

  private ndc(event: PointerEvent) {
    const rect = this.canvas.getBoundingClientRect()
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
  }

  private ground(event: PointerEvent): { lat: number; lon: number } | null {
    this.ndc(event)
    this.raycaster.setFromCamera(this.pointer, this.camera)
    const hits = this.raycaster.intersectObject(this.earth, false)
    const hit = hits[0]
    if (!hit) return null
    return vecToLatLon({ x: hit.point.x, y: hit.point.y, z: hit.point.z })
  }

  private collectHits(event: PointerEvent): { marker: Marker; layerId: string; id: string; d: number }[] {
    const rect = this.canvas.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    const camN = this.camera.position.clone().normalize()
    const hits: { marker: Marker; layerId: string; id: string; d: number }[] = []
    for (const pool of this.pools.values()) {
      if (pool.id === 'sel-ring') continue
      for (const item of pool.items) {
        const marker = item.marker
        const v = latLonToVec(marker.lat, marker.lon, marker.altKm, R)
        const facing = (v.x * camN.x + v.y * camN.y + v.z * camN.z) / (Math.hypot(v.x, v.y, v.z) || 1)
        if (facing < 0.05) continue
        const projected = this.project(marker.lat, marker.lon, marker.altKm)
        if (!projected.visible) continue
        const d = Math.hypot(projected.x - x, projected.y - y)
        if (d <= HIT_PX) hits.push({ marker, layerId: item.layerId, id: marker.id, d })
      }
    }
    return hits
  }

  private pickMarker(event: PointerEvent, cycle: boolean): { marker: Marker; layerId: string } | null {
    const hits = this.collectHits(event)
    const chosen = chooseHit(hits, cycle ? this.hitKey : '', cycle ? this.hitIndex : -1)
    if (!cycle) return chosen ? { marker: chosen.item.marker, layerId: chosen.item.layerId } : null
    if (!chosen) {
      this.hitKey = ''
      this.hitIndex = 0
      return null
    }
    this.hitKey = chosen.key
    this.hitIndex = chosen.index
    return { marker: chosen.item.marker, layerId: chosen.item.layerId }
  }

  private onDown = (event: PointerEvent) => {
    this.dragging = true
    this.moved = 0
    this.lastX = event.clientX
    this.lastY = event.clientY
    this.velLat = 0
    this.velLon = 0
    this.canvas.setPointerCapture(event.pointerId)
  }

  private pointerMove = (event: PointerEvent) => {
    if (!this.dragging) {
      const ground = this.ground(event)
      for (const fn of this.movers) fn(ground)
      const picked = this.pickMarker(event, false)
      const id = picked?.marker.id ?? null
      const changed = id !== this.hoverId
      if (changed) {
        this.hoverId = id
        this.dirty = true
      }
      if (picked) {
        const rect = this.canvas.getBoundingClientRect()
        for (const fn of this.hoverers) {
          fn({ marker: picked.marker, layerId: picked.layerId, x: event.clientX - rect.left, y: event.clientY - rect.top })
        }
      } else if (changed) {
        for (const fn of this.hoverers) fn(null)
      }
      return
    }
    const dx = event.clientX - this.lastX
    const dy = event.clientY - this.lastY
    this.lastX = event.clientX
    this.lastY = event.clientY
    this.moved += Math.abs(dx) + Math.abs(dy)
    const sens = 0.11 * (this.view.rangeKm / 12000)
    this.velLon = dx * sens
    this.velLat = dy * sens
    if (this.moved > 4 && (this.follow || this.flight)) {
      this.follow = null
      this.flight = null
      for (const fn of this.releasers) fn()
    }
    this.view.lon += this.velLon
    this.view.lat = clamp(this.view.lat + this.velLat, -85, 85)
  }

  private onUp = (event: PointerEvent) => {
    if (!this.dragging) return
    this.dragging = false
    if (this.moved > 5) return
    const markerHit = this.pickMarker(event, true)
    const ground = this.ground(event)
    if (!ground && !markerHit) return
    const hit: GlobeClick = {
      lat: markerHit?.marker.lat ?? ground?.lat ?? this.view.lat,
      lon: markerHit?.marker.lon ?? ground?.lon ?? this.view.lon,
      marker: markerHit?.marker ?? null,
      layerId: markerHit?.layerId ?? null,
    }
    if (event.detail >= 2 && ground && !markerHit) {
      this.flyTo(ground.lat, ground.lon, Math.max(280, this.view.rangeKm * 0.42))
    }
    for (const fn of this.clickers) fn(hit)
  }

  private onWheel = (event: WheelEvent) => {
    event.preventDefault()
    const factor = event.deltaY > 0 ? 1.1 : 0.9
    if (this.follow) this.followRange = clamp(this.followRange * factor, 220, 22000)
    else this.view.rangeKm = clamp(this.view.rangeKm * factor, 180, 70000)
  }
}
