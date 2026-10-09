import * as THREE from 'three'
import { markerGeometry, markerParts } from '../core/models'

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

const TURN = 0.42

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
  canvas.width = 520
  canvas.height = 300
  const card = document.createElement('pre')
  card.textContent = 'NO CONTACT SELECTED'
  body.append(canvas, card)
  root.append(head, body)

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: true,
    powerPreference: 'low-power',
  })
  renderer.setClearColor(0x000000, 0)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.NoToneMapping
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(32, 520 / 300, 0.05, 40)
  camera.position.set(2.1, 1.25, 2.35)
  camera.lookAt(0, 0.05, 0)
  scene.add(new THREE.HemisphereLight(0xd8ffe8, 0x02140a, 0.9))
  const key = new THREE.DirectionalLight(0xf4fff8, 1.25)
  key.position.set(2.4, 3.2, 1.6)
  scene.add(key)
  const fill = new THREE.DirectionalLight(0x143322, 0.35)
  fill.position.set(-2, 0.4, -1)
  scene.add(fill)

  const pad = new THREE.LineLoop(
    ringGeometry(1.25, 40),
    new THREE.LineBasicMaterial({ color: 0x1f8f45, toneMapped: false }),
  )
  pad.rotation.x = Math.PI / 2
  scene.add(pad)

  const idleSpin = new THREE.Group()
  const idleSphere = new THREE.SphereGeometry(0.72, 10, 8)
  const wire = new THREE.WireframeGeometry(idleSphere)
  idleSphere.dispose()
  const idleLines = new THREE.LineSegments(
    wire,
    new THREE.LineBasicMaterial({ color: 0x3dff7a, transparent: true, opacity: 0.85, toneMapped: false }),
  )
  idleSpin.add(idleLines)
  scene.add(idleSpin)

  const turntable = new THREE.Group()
  scene.add(turntable)
  const material = new THREE.MeshLambertMaterial({
    color: 0xb6ffd2,
    emissive: 0x0a3d1c,
    emissiveIntensity: 0.42,
    flatShading: true,
    toneMapped: false,
  })
  const edgeMat = new THREE.LineBasicMaterial({ color: 0xe9fff2, toneMapped: false })
  const owned = new Set<THREE.BufferGeometry>()
  let shape = ''
  let open = true
  let disposed = false

  function resize() {
    const width = Math.max(120, canvas.clientWidth || 260)
    const height = Math.max(80, canvas.clientHeight || 148)
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5)
    renderer.setPixelRatio(ratio)
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
  }

  function clearModel() {
    for (const child of [...turntable.children]) {
      turntable.remove(child)
      child.traverse((node) => {
        const mesh = node as THREE.Mesh
        if (mesh.geometry && owned.has(mesh.geometry)) {
          mesh.geometry.dispose()
          owned.delete(mesh.geometry)
        }
      })
    }
  }

  function build(nextShape: string, nextPitch: number) {
    clearModel()
    shape = nextShape
    const rig = new THREE.Group()
    rig.rotation.x = THREE.MathUtils.degToRad(nextPitch)
    for (const part of markerParts(nextShape || 'dot')) {
      const geo = markerGeometry(part.id)
      const holder = new THREE.Group()
      holder.add(new THREE.Mesh(geo, material))
      const edges = new THREE.EdgesGeometry(geo, 18)
      owned.add(edges)
      holder.add(new THREE.LineSegments(edges, edgeMat))
      holder.userData.spin = part.spin
      rig.add(holder)
    }
    const fit = new THREE.Group()
    fit.rotation.x = -Math.PI / 2
    fit.add(rig)
    fit.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(fit)
    const size = box.getSize(new THREE.Vector3())
    const span = Math.max(size.x, size.y, size.z, 0.2)
    fit.scale.setScalar(1.55 / span)
    fit.updateMatrixWorld(true)
    box.setFromObject(fit)
    const center = box.getCenter(new THREE.Vector3())
    fit.position.sub(center)
    fit.position.y += 0.02
    turntable.add(fit)
  }

  function frame(now: number) {
    if (!open || disposed) return
    const t = now / 1000
    if (turntable.visible) {
      turntable.rotation.y = t * TURN
      for (const fit of turntable.children) {
        const rig = fit.children[0]
        if (!rig) continue
        for (const holder of rig.children) {
          const spin = (holder as THREE.Object3D).userData.spin as string
          if (spin === 'rotor') holder.rotation.z = t * 8
          else if (spin === 'prop') holder.rotation.y = t * 14
        }
      }
    } else {
      idleSpin.rotation.y = t * 0.35
    }
    renderer.render(scene, camera)
  }

  function setLoop(running: boolean) {
    renderer.setAnimationLoop(running ? frame : null)
  }

  function applyPitch(nextPitch: number) {
    const fit = turntable.children[0]
    const rig = fit?.children[0]
    if (rig) rig.rotation.x = THREE.MathUtils.degToRad(nextPitch)
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
      idleSpin.visible = false
      turntable.visible = true
      pad.visible = true
      if (nextShape !== shape) build(nextShape, nextPitch)
      else applyPitch(nextPitch)
    },
    idle() {
      clearModel()
      shape = ''
      turntable.visible = false
      idleSpin.visible = true
      pad.visible = true
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
      renderer.setAnimationLoop(null)
      observer.disconnect()
      window.removeEventListener('resize', resize)
      clearModel()
      wire.dispose()
      ;(idleLines.material as THREE.Material).dispose()
      material.dispose()
      edgeMat.dispose()
      ;(pad.geometry as THREE.BufferGeometry).dispose()
      ;(pad.material as THREE.Material).dispose()
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
