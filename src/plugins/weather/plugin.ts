import type { AllEyesPlugin } from '../../core/types'
import { getJson } from '../../net/http'

const LAYER = 'weather'

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('tile'))
    image.src = url
  })
}

function latToMercator(latDeg: number): number {
  const lat = Math.max(-85.05112878, Math.min(85.05112878, latDeg)) * Math.PI / 180
  const merc = Math.log(Math.tan(Math.PI / 4 + lat / 2))
  return (1 - merc / Math.PI) / 2
}

export function stitchRadar(source: HTMLCanvasElement, width = 720, height = 360): HTMLCanvasElement {
  const src = source.getContext('2d', { willReadFrequently: true })
  const out = document.createElement('canvas')
  out.width = width
  out.height = height
  const dst = out.getContext('2d')
  if (!src || !dst) return out
  const image = src.getImageData(0, 0, source.width, source.height)
  const pixels = dst.createImageData(width, height)
  const sw = source.width
  const sh = source.height
  for (let y = 0; y < height; y++) {
    const lat = 90 - (y / (height - 1)) * 180
    const gy = latToMercator(lat)
    if (gy < 0 || gy > 1) continue
    const sy = Math.min(sh - 1, Math.max(0, Math.floor(gy * (sh - 1))))
    for (let x = 0; x < width; x++) {
      const sx = Math.min(sw - 1, Math.floor((x / width) * sw))
      const si = (sy * sw + sx) * 4
      const di = (y * width + x) * 4
      const r = image.data[si] ?? 0
      const g = image.data[si + 1] ?? 0
      const b = image.data[si + 2] ?? 0
      const max = Math.max(r, g, b)
      const alpha = max < 18 ? 0 : Math.min(255, 80 + max)
      pixels.data[di] = max
      pixels.data[di + 1] = max
      pixels.data[di + 2] = max
      pixels.data[di + 3] = alpha
    }
  }
  dst.putImageData(pixels, 0, 0)
  return out
}

async function buildOverlay(path: string): Promise<HTMLCanvasElement> {
  const zoom = 2
  const n = 2 ** zoom
  const tile = 256
  const merc = document.createElement('canvas')
  merc.width = n * tile
  merc.height = n * tile
  const ctx = merc.getContext('2d')
  if (!ctx) return merc
  const jobs: Promise<void>[] = []
  for (let x = 0; x < n; x++) {
    for (let y = 0; y < n; y++) {
      const url = `/api/rain/tile?path=${encodeURIComponent(path)}&z=${zoom}&x=${x}&y=${y}`
      jobs.push(
        loadImage(url)
          .then((image) => { ctx.drawImage(image, x * tile, y * tile) })
          .catch(() => undefined),
      )
    }
  }
  await Promise.all(jobs)
  return stitchRadar(merc)
}

export const weatherPlugin: AllEyesPlugin = {
  id: 'weather',
  name: 'Weather',
  version: '1.0.0',
  layers: [
    {
      id: LAYER,
      label: 'WX',
      description: 'Global precipitation radar from RainViewer, graded phosphor.',
      defaultOn: true,
      create(ctx) {
        let timer = 0
        let on = false
        const tick = async () => {
          if (!on || ctx.signal.aborted) return
          try {
            const meta = await getJson('/api/rain/meta', ctx.settings, ctx.signal) as {
              radar?: { past?: { path?: string }[] }
            }
            const past = meta.radar?.past ?? []
            const path = past[past.length - 1]?.path
            if (!path) throw new Error('no radar frame')
            const canvas = await buildOverlay(path)
            if (!on) return
            ctx.globe.setRadarCanvas(canvas)
            ctx.publish(LAYER, [])
            ctx.log(LAYER, '')
          } catch (err) {
            ctx.log(LAYER, err instanceof Error ? err.message : 'RADAR FAULT')
          }
        }
        return {
          setEnabled(next) {
            if (next === on) return
            on = next
            if (!next) {
              window.clearInterval(timer)
              ctx.globe.setRadarCanvas(null)
              return
            }
            void tick()
            timer = window.setInterval(() => void tick(), 5 * 60_000)
          },
          dispose() {
            on = false
            window.clearInterval(timer)
            ctx.globe.setRadarCanvas(null)
          },
        }
      },
    },
  ],
  panels: [
    {
      id: 'wx-radar',
      title: 'RADAR',
      mount(host) {
        host.textContent = 'RAINVIEWER\nGLOBAL PRECIP\nDIM OVERLAY'
        return () => {}
      },
    },
  ],
}
