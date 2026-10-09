import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'

function crc32(buf) {
  let c = ~0
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}

function chunk(type, data) {
  const t = Buffer.from(type)
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])))
  return Buffer.concat([len, t, data, crc])
}

function png(size, pixels) {
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1)
    raw[row] = 0
    for (let x = 0; x < size; x++) {
      const i = row + 1 + x * 4
      const p = pixels(x, y, size)
      raw[i] = p[0]
      raw[i + 1] = p[1]
      raw[i + 2] = p[2]
      raw[i + 3] = 255
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function eye(x, y, size) {
  const u = x / (size - 1)
  const v = y / (size - 1)
  const border = u < 0.06 || v < 0.06 || u > 0.94 || v > 0.94
  const nx = (u - 0.5) * 2.2
  const ny = (v - 0.5) * 2.6
  const e = nx * nx + ny * ny
  const pupil = (u - 0.5) ** 2 * 18 + (v - 0.48) ** 2 * 22 < 0.35
  const glint = u > 0.56 && u < 0.66 && v > 0.34 && v < 0.44
  if (border) return [61, 255, 122]
  if (glint) return [243, 255, 246]
  if (pupil) return [1, 10, 6]
  if (e < 1) {
    const shade = Math.floor(40 + (1 - e) * 180)
    return [Math.floor(shade * 0.25), shade, Math.floor(shade * 0.45)]
  }
  return [2, 18, 10]
}

mkdirSync('build', { recursive: true })
mkdirSync('public', { recursive: true })
writeFileSync('build/icon.png', png(512, eye))
writeFileSync('public/favicon.png', png(32, eye))
console.log('wrote build/icon.png and public/favicon.png')
