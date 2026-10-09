import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// 32×32 phosphor pixel eye. Five greens plus near-black. Every mark is a
// whole pixel: shapes are filled or left empty, never blended.
const PALETTE = {
  '.': [7, 20, 12],
  d: [14, 58, 34],
  m: [28, 138, 66],
  b: [61, 255, 122],
  h: [200, 255, 216],
}

const GRID = 32

const SPRITE = [
  '................................',
  '.bb..........................bb.',
  '.b............................b.',
  '.b............................b.',
  '................................',
  '................................',
  '.......bbbbbbbbbbbbbbbbb........',
  '......bmmmmmmmmmmmmmmmmmmb......',
  '.....bmmmmmmmmmmmmmmmmmmmmb.....',
  '....bmmmddddddddddddddddmmmb....',
  '....bmddddddddddddddddddddmb....',
  '...bmdddmmmmmmmmmmmmmmmmdddmb...',
  '...bmddmmmmmmmmmmmmmmmmmmddmb...',
  '..bmddmmbbbbbbbbbbbbbbbbmmddmb..',
  '..bmddmmbddddddddddddddbmmddmb..',
  '..bmddmmbddddddhhddddddbmmddmb..',
  '..bmddmmbddddddddddddddbmmddmb..',
  '..bmddmmbbbbbbbbbbbbbbbbmmddmb..',
  '..bmddmmbddddddddddddddbmmddmb..',
  '..bmddmmbddddddddddddddbmmddmb..',
  '..bmddmmbbbbbbbbbbbbbbbbmmddmb..',
  '...bmddmmmmmmmmmmmmmmmmmmddmb...',
  '...bmdddmmmmmmmmmmmmmmmmdddmb...',
  '....bmddddddddddddddddddddmb....',
  '....bmmmddddddddddddddddmmmb....',
  '.....bmmmmmmmmmmmmmmmmmmmmb.....',
  '......bmmmmmmmmmmmmmmmmmmb......',
  '.......bbbbbbbbbbbbbbbbb........',
  '................................',
  '.b............................b.',
  '.b............................b.',
  '.bb..........................bb.',
]

if (SPRITE.length !== GRID) throw new Error(`sprite rows ${SPRITE.length}`)
for (const row of SPRITE) {
  if (row.length !== GRID) throw new Error(`sprite row length ${row.length}: ${row}`)
  for (const ch of row) if (!(ch in PALETTE)) throw new Error(`unknown pixel ${ch}`)
}

function spritePixels() {
  const pixels = []
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) pixels.push(PALETTE[SPRITE[y][x]])
  }
  return pixels
}

const MASTER = spritePixels()

function sample(size) {
  const out = []
  for (let y = 0; y < size; y++) {
    const sy = Math.floor((y * GRID) / size)
    for (let x = 0; x < size; x++) {
      const sx = Math.floor((x * GRID) / size)
      out.push(MASTER[sy * GRID + sx])
    }
  }
  return out
}

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
      const [r, g, b] = pixels[y * size + x]
      const i = row + 1 + x * 4
      raw[i] = r
      raw[i + 1] = g
      raw[i + 2] = b
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

function icns(images) {
  const chunks = images.map(({ osType, png: bytes }) => {
    const head = Buffer.alloc(8)
    head.write(osType, 0, 4, 'ascii')
    head.writeUInt32BE(8 + bytes.length, 4)
    return Buffer.concat([head, bytes])
  })
  const body = Buffer.concat(chunks)
  const head = Buffer.alloc(8)
  head.write('icns', 0, 4, 'ascii')
  head.writeUInt32BE(8 + body.length, 4)
  return Buffer.concat([head, body])
}

const here = dirname(fileURLToPath(import.meta.url))
const root = dirname(here)
const iconsDir = join(here, 'icons')
mkdirSync(iconsDir, { recursive: true })
mkdirSync(join(root, 'public'), { recursive: true })

const pngSizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024]
const encoded = new Map(pngSizes.map((size) => [size, png(size, sample(size))]))

for (const size of pngSizes) writeFileSync(join(iconsDir, `${size}x${size}.png`), encoded.get(size))
writeFileSync(join(here, 'icon.png'), encoded.get(1024))
writeFileSync(
  join(here, 'icon.ico'),
  ico([16, 24, 32, 48, 64, 128, 256].map((size) => ({ size, png: encoded.get(size) }))),
)
writeFileSync(
  join(here, 'icon.icns'),
  icns([
    ['icp4', 16],
    ['icp5', 32],
    ['icp6', 64],
    ['ic07', 128],
    ['ic08', 256],
    ['ic09', 512],
    ['ic10', 1024],
    ['ic11', 32],
    ['ic12', 64],
    ['ic13', 256],
    ['ic14', 512],
  ].map(([osType, size]) => ({ osType, png: encoded.get(size) }))),
)
writeFileSync(join(root, 'public', 'favicon.png'), encoded.get(32))
writeFileSync(join(root, 'public', 'icon.png'), encoded.get(256))

console.log('wrote pixel icon png, ico, icns, and favicon')
