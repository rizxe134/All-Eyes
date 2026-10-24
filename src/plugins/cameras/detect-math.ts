/** Classes drawn on a traffic camera. Other COCO labels are ignored. */
export const DETECT_CLASSES = ['car', 'truck', 'bus', 'motorcycle', 'bicycle', 'person'] as const

export type DetectClass = (typeof DETECT_CLASSES)[number]

export interface DetBox {
  class: DetectClass
  score: number
  x: number
  y: number
  w: number
  h: number
}

const ALIAS: Record<string, DetectClass> = {
  person: 'person',
  bicycle: 'bicycle',
  bike: 'bicycle',
  car: 'car',
  motorcycle: 'motorcycle',
  motorbike: 'motorcycle',
  bus: 'bus',
  truck: 'truck',
}

export function filterDetections(
  rows: readonly { class: string; score: number; bbox: readonly [number, number, number, number] }[],
  threshold: number,
): DetBox[] {
  const min = Number.isFinite(threshold) ? threshold : 1
  const out: DetBox[] = []
  for (const row of rows) {
    const cls = ALIAS[row.class.trim().toLowerCase()]
    if (!cls || !(row.score >= min)) continue
    const [x, y, w, h] = row.bbox
    if (![x, y, w, h].every((n) => Number.isFinite(n))) continue
    out.push({ class: cls, score: row.score, x, y, w, h })
  }
  return out
}

export function countClasses(boxes: readonly { class: string }[]): Record<DetectClass, number> {
  const out: Record<DetectClass, number> = {
    car: 0,
    truck: 0,
    bus: 0,
    motorcycle: 0,
    bicycle: 0,
    person: 0,
  }
  for (const box of boxes) {
    if (box.class in out) out[box.class as DetectClass] += 1
  }
  return out
}

export interface FrameMap {
  scale: number
  offX: number
  offY: number
}

/**
 * object-fit: contain. The frame is scaled uniformly and centered, with bars on the short axis.
 */
export function letterbox(srcW: number, srcH: number, dstW: number, dstH: number): FrameMap {
  if (!(srcW > 0) || !(srcH > 0) || !(dstW > 0) || !(dstH > 0)) return { scale: 0, offX: 0, offY: 0 }
  const scale = Math.min(dstW / srcW, dstH / srcH)
  return {
    scale,
    offX: (dstW - srcW * scale) / 2,
    offY: (dstH - srcH * scale) / 2,
  }
}

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

export function mapBox(box: Box, srcW: number, srcH: number, dstW: number, dstH: number): Box {
  const { scale, offX, offY } = letterbox(srcW, srcH, dstW, dstH)
  if (!(scale > 0)) return { x: 0, y: 0, w: 0, h: 0 }
  return {
    x: box.x * scale + offX,
    y: box.y * scale + offY,
    w: box.w * scale,
    h: box.h * scale,
  }
}

export const DETECT_CREDIT = 'SSDLite MobileNet v2 (TensorFlow.js COCO-SSD), Apache-2.0'
