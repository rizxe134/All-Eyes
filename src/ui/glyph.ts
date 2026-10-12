/** Draw a globe sprite into a canvas so the dock uses the same pixels. */

import { spriteRows } from '../core/sprites'

export function paintGlyph(canvas: HTMLCanvasElement, spriteId: string, hex: string): void {
  const rows = spriteRows(spriteId)
  const height = rows.length || 1
  const width = rows[0]?.length || 1
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = hex
  for (let y = 0; y < height; y++) {
    const row = rows[y] ?? ''
    for (let x = 0; x < width; x++) {
      if (row[x] === '#') ctx.fillRect(x, y, 1, 1)
    }
  }
}
