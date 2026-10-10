import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { createViewModel, disposeViewModels, modelCredit, type ModelCredit } from './view-models'

export interface ModelViewer {
  root: HTMLElement
  canvas: HTMLCanvasElement
  body: HTMLElement
  title: HTMLElement
  card: HTMLElement
  speed: HTMLButtonElement
  toggle: HTMLButtonElement
  show(shape: string, pitch: number): void
  idle(): void
  setOpen(open: boolean): void
  isOpen(): boolean
  dispose(): void
}

const TURN = 0.35

export function mountViewer(): ModelViewer {
  const root = document.createElement('aside')
  root.className = 'ae-viewer'
  const head = document.createElement('header')
  head.className = 'ae-viewer-head'
  const title = document.createElement('span')
  title.textContent = 'MODEL VIEWER'
  const speed = document.createElement('button')
  speed.type = 'button'
  speed.className = 'ae-btn'
  speed.textContent = 'KT'
  speed.title = 'Toggle KT / MPH / KM/H'
  const toggle = document.createElement('button')
  toggle.type = 'button'
  toggle.className = 'ae-btn'
  toggle.textContent = 'HIDE'
  head.append(title, speed, toggle)
  const body = document.createElement('div')
  body.className = 'ae-viewer-body'
  const canvas = document.createElement('canvas')
  canvas.className = 'ae-viewer-canvas'
  canvas.width = 560
  canvas.height = 340
  const credit = document.createElement('p')
  credit.className = 'ae-viewer-credit'
  credit.hidden = true
  const card = document.createElement('pre')
  card.textContent = 'NO CONTACT SELECTED'
  body.append(canvas, credit, card)
  root.append(head, body)

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'low-power',
  })
  renderer.setClearColor(0x12161c, 1)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap

  const scene = new THREE.Scene()
  const pmrem = new THREE.PMREMGenerator(renderer)
  const env = new RoomEnvironment()
  const envMap = pmrem.fromScene(env, 0.04).texture
  scene.environment = envMap
  pmrem.dispose()
  env.traverse((node) => {
    const mesh = node as THREE.Mesh
    if (mesh.geometry) mesh.geometry.dispose()
    const material = mesh.material
    if (Array.isArray(material)) material.forEach((item) => item.dispose())
    else if (material) material.dispose()
  })

  const camera = new THREE.PerspectiveCamera(30, 560 / 340, 0.05, 40)
  camera.position.set(2.15, 1.05, 2.25)
  camera.lookAt(0, 0.38, 0)

  scene.add(new THREE.HemisphereLight(0xf4f7fb, 0x1a1e24, 0.45))
  const key = new THREE.DirectionalLight(0xfff8f0, 2.4)
  key.position.set(3.2, 5.4, 2.4)
  key.castShadow = true
  key.shadow.mapSize.set(1024, 1024)
  key.shadow.camera.near = 0.5
  key.shadow.camera.far = 14
  key.shadow.camera.left = -2.2
  key.shadow.camera.right = 2.2
  key.shadow.camera.top = 2.2
  key.shadow.camera.bottom = -2.2
  key.shadow.bias = -0.0004
  scene.add(key)
  const fill = new THREE.DirectionalLight(0xb7c6d6, 0.55)
  fill.position.set(-2.4, 1.6, -1.2)
  scene.add(fill)

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(1.22, 48),
    new THREE.MeshStandardMaterial({ color: 0x23282e, metalness: 0.28, roughness: 0.78 }),
  )
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  ground.position.y = -0.002
  scene.add(ground)

  const pad = new THREE.LineLoop(
    ringGeometry(1.18, 64),
    new THREE.LineBasicMaterial({ color: 0x1f8f45, toneMapped: false }),
  )
  pad.rotation.x = Math.PI / 2
  pad.position.y = 0.004
  scene.add(pad)

  const turntable = new THREE.Group()
  scene.add(turntable)

  let shape = ''
  let open = true
  let disposed = false
  let generation = 0

  function resize() {
    const width = Math.max(120, canvas.clientWidth || 260)
    const height = Math.max(90, canvas.clientHeight || 168)
    const ratio = Math.min(window.devicePixelRatio || 1, 1.75)
    renderer.setPixelRatio(ratio)
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
  }

  function clearModel() {
    for (const child of [...turntable.children]) turntable.remove(child)
  }

  function paintCredit(info: ModelCredit | null) {
    credit.replaceChildren()
    if (!info) {
      credit.hidden = true
      return
    }
    credit.hidden = false
    const author = document.createElement('a')
    author.href = info.href
    author.target = '_blank'
    author.rel = 'noreferrer'
    author.textContent = info.text
    const license = document.createElement('a')
    license.href = info.licenseHref
    license.target = '_blank'
    license.rel = 'noreferrer'
    license.textContent = info.license
    credit.append(author, document.createTextNode(' · '), license)
  }

  function applyPitch(nextPitch: number) {
    const rig = turntable.children[0]
    if (rig) rig.rotation.x = -THREE.MathUtils.degToRad(nextPitch)
  }

  function mount(nextShape: string, nextPitch: number) {
    const ticket = ++generation
    shape = nextShape
    paintCredit(modelCredit(nextShape))
    void createViewModel(nextShape).then((model) => {
      if (disposed || ticket !== generation || shape !== nextShape) return
      clearModel()
      const rig = new THREE.Group()
      rig.rotation.x = -THREE.MathUtils.degToRad(nextPitch)
      rig.add(model.root)
      turntable.add(rig)
      paintCredit(model.credit)
    }).catch(() => {
      if (ticket === generation) paintCredit(modelCredit(nextShape))
    })
  }

  function frame(now: number) {
    if (!open || disposed) return
    const t = now / 1000
    turntable.rotation.y = t * TURN
    turntable.traverse((node) => {
      const spin = node.userData.spin as string | undefined
      if (spin !== 'rotor' && spin !== 'prop') return
      const axis = (node.userData.spinAxis as 'x' | 'y' | 'z' | undefined) ?? (spin === 'rotor' ? 'y' : 'z')
      node.rotation[axis] = t * (spin === 'rotor' ? 8 : 16)
    })
    renderer.render(scene, camera)
  }

  function setLoop(running: boolean) {
    renderer.setAnimationLoop(running ? frame : null)
  }

  const observer = new ResizeObserver(() => resize())

  const api: ModelViewer = {
    root,
    canvas,
    body,
    title,
    card,
    speed,
    toggle,
    show(nextShape, nextPitch) {
      turntable.visible = true
      if (nextShape !== shape || turntable.children.length === 0) mount(nextShape, nextPitch)
      else applyPitch(nextPitch)
    },
    idle() {
      generation += 1
      clearModel()
      shape = ''
      turntable.visible = false
      paintCredit(null)
    },
    setOpen(next) {
      open = next
      body.hidden = !next
      toggle.textContent = next ? 'HIDE' : 'SHOW'
      root.classList.toggle('is-shut', !next)
      if (next) {
        resize()
        setLoop(true)
      } else {
        setLoop(false)
      }
    },
    isOpen: () => open,
    dispose() {
      if (disposed) return
      disposed = true
      generation += 1
      renderer.setAnimationLoop(null)
      observer.disconnect()
      window.removeEventListener('resize', resize)
      clearModel()
      ground.geometry.dispose()
      ;(ground.material as THREE.Material).dispose()
      pad.geometry.dispose()
      ;(pad.material as THREE.Material).dispose()
      envMap.dispose()
      void disposeViewModels()
      renderer.dispose()
      renderer.forceContextLoss()
    },
  }

  api.idle()
  observer.observe(canvas)
  window.addEventListener('resize', resize)
  resize()
  setLoop(true)
  return api
}

function ringGeometry(radius: number, steps: number): THREE.BufferGeometry {
  const points: THREE.Vector3[] = []
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2
    points.push(new THREE.Vector3(Math.cos(a) * radius, Math.sin(a) * radius, 0))
  }
  return new THREE.BufferGeometry().setFromPoints(points)
}
