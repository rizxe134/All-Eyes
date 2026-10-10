/** Pixel glyphs. `#` is a lit pixel. Plugins register more with `registerSprite`. */

export interface SpriteDef {
  id: string
  rows: string[]
}

const registry = new Map<string, SpriteDef>()

export function registerSprite(id: string, rows: string[]): void {
  if (!rows.length || rows.some((row) => row.length !== rows[0]?.length)) {
    throw new Error(`sprite ${id} is not a rectangle`)
  }
  registry.set(id, { id, rows })
}

export function spriteRows(id: string): string[] {
  return registry.get(id)?.rows ?? registry.get('dot')?.rows ?? ['#']
}

export function knownSprites(): string[] {
  return [...registry.keys()]
}

function glyph(picture: string): string[] {
  const lines = picture.trim().split('\n').map((row) => row.trimEnd())
  const width = Math.max(...lines.map((row) => row.length))
  return lines.map((row) => row.padEnd(width, '.'))
}

registerSprite('dot', glyph(`
####
####
####
####
`))

registerSprite('dot-gnd', glyph(`
###
###
###
`))

registerSprite('chevron', glyph(`
....#....
...###...
..##.##..
.##...##.
#.......#
`))

registerSprite('diamond', glyph(`
...#...
..###..
.#####.
..###..
...#...
`))

registerSprite('ring', glyph(`
.#####.
#.....#
#.....#
#.....#
.#####.
`))

registerSprite('box', glyph(`
#######
#.....#
#.....#
#.....#
#######
`))

registerSprite('drop', glyph(`
...#...
..###..
.#####.
.#####.
..###..
...#...
`))
