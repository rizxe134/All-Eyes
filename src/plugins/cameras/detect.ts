import type { DetectedObject, ObjectDetection } from '@tensorflow-models/coco-ssd'

export interface LoadedDetector {
  model: ObjectDetection
  backend: string
}

let pending: Promise<LoadedDetector> | null = null
let backendName = ''

function first<T>(promise: Promise<T>, ms: number): Promise<T> {
  promise.catch(() => undefined)
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('backend timeout')), ms)
    promise.then((value) => {
      clearTimeout(timer)
      resolve(value)
    }, (err: unknown) => {
      clearTimeout(timer)
      reject(err)
    })
  })
}

async function prepareBackend(): Promise<string> {
  const tf = await import('@tensorflow/tfjs')
  const base = import.meta.env.BASE_URL || '/'
  try {
    await first(import('@tensorflow/tfjs-backend-webgpu'), 4000)
    if (await first(tf.setBackend('webgpu'), 4000)) {
      await first(tf.ready(), 4000)
      if (tf.getBackend() === 'webgpu') return 'webgpu'
    }
  } catch {
    /* This browser has no WebGPU device. */
  }
  try {
    const wasm = await first(import('@tensorflow/tfjs-backend-wasm'), 8000)
    wasm.setThreadsCount(1)
    wasm.setWasmPaths(`${base}tfjs/`)
    if (await first(tf.setBackend('wasm'), 15000)) {
      await first(tf.ready(), 15000)
      if (tf.getBackend() === 'wasm') return 'wasm'
    }
  } catch {
    /* WASM binaries failed to compile. WebGL is next. */
  }
  try {
    if (await first(tf.setBackend('webgl'), 8000)) {
      await first(tf.ready(), 8000)
      if (tf.getBackend() === 'webgl') return 'webgl'
    }
  } catch {
    /* WebGL could not start. The CPU backend is last. */
  }
  await tf.setBackend('cpu')
  await tf.ready()
  return tf.getBackend() || 'cpu'
}

/** Load the bundled COCO-SSD model once. A failed load can be retried. */
export function loadDetector(): Promise<LoadedDetector> {
  if (!pending) {
    pending = (async () => {
      const backend = await prepareBackend()
      backendName = backend
      const coco = await import('@tensorflow-models/coco-ssd')
      const model = await coco.load({
        base: 'lite_mobilenet_v2',
        modelUrl: `${import.meta.env.BASE_URL}models/ssdlite/model.json`,
      })
      return { model, backend }
    })().catch((err: unknown) => {
      pending = null
      backendName = ''
      throw err
    })
  }
  return pending
}

export function detectorBackend(): string {
  return backendName
}

/** Drop the loaded graph so a closed viewer does not keep the weights alive. */
export async function disposeDetector(): Promise<void> {
  const job = pending
  pending = null
  backendName = ''
  if (!job) return
  try {
    const loaded = await job
    loaded.model.dispose()
  } catch {
    /* The load already failed. */
  }
}

export type { DetectedObject }
