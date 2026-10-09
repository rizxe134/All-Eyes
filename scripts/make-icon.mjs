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

function ico(images) {
  const count = images.length
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(count, 4)
  const entries = Buffer.alloc(16 * count)
  const parts = [header, entries]
  let offset = 6 + entries.length
  for (let i = 0; i < count; i++) {
    const { size, png: bytes } = images[i]
    const at = i * 16
    const dim = size >= 256 ? 0 : size
    entries[at] = dim
    entries[at + 1] = dim
    entries.writeUInt16LE(1, at + 4)
    entries.writeUInt16LE(32, at + 6)
    entries.writeUInt32LE(bytes.length, at + 8)
    entries.writeUInt32LE(offset, at + 12)
    offset += bytes.length
    parts.push(bytes)
  }
  return Buffer.concat(parts)
}

const sizes = [16, 24, 32, 48, 64, 128, 256, 512]
mkdirSync('build/icons', { recursive: true })
mkdirSync('public', { recursive: true })
const pngs = new Map(sizes.map((size) => [size, png(size, eye)]))
for (const size of sizes) writeFileSync(`build/icons/${size}x${size}.png`, pngs.get(size))
writeFileSync('build/icon.png', pngs.get(512))
writeFileSync(
  'build/icon.ico',
  ico([16, 24, 32, 48, 64, 128, 256].map((size) => ({ size, png: pngs.get(size) }))),
)
writeFileSync('public/favicon.png', pngs.get(32))
writeFileSync('public/icon.png', pngs.get(256))
console.log('wrote build/icon.png, build/icon.ico, build/icons/*, public/favicon.png, public/icon.png')
