import type { DetectedObject, ObjectDetection } from '@tensorflow-models/coco-ssd'

export interface LoadedDetector {
  model: ObjectDetection
  backend: string
}

let pending: Promise<LoadedDetector> | null = null
let backendName = ''

async function prepareBackend(): Promise<string> {
  const tf = await import('@tensorflow/tfjs')
  const base = import.meta.env.BASE_URL || '/'
  try {
    await import('@tensorflow/tfjs-backend-webgpu')
    if (await tf.setBackend('webgpu')) {
      await tf.ready()
      if (tf.getBackend() === 'webgpu') return 'webgpu'
    }
  } catch {
    /* This browser has no WebGPU device. */
  }
  try {
    const wasm = await import('@tensorflow/tfjs-backend-wasm')
    wasm.setThreadsCount(1)
    wasm.setWasmPaths(`${base}tfjs/`)
    if (await tf.setBackend('wasm')) {
      await tf.ready()
      if (tf.getBackend() === 'wasm') return 'wasm'
    }
  } catch {
    /* WASM binaries failed to compile. Try WebGL next. */
  }
  try {
    if (await tf.setBackend('webgl')) {
      await tf.ready()
      if (tf.getBackend() === 'webgl') return 'webgl'
    }
  } catch {
    /* WebGL is unavailable. */
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
