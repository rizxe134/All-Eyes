import { registerSprite } from '../../core/sprites'

function picture(id: string, art: string) {
  const rows = art.trim().split('\n').map((row) => row.trimEnd())
  const width = Math.max(...rows.map((row) => row.length))
  registerSprite(id, rows.map((row) => row.padEnd(width, '.')))
}

picture('news', `
.##..##.
.######.
.#....#.
.######.
.#....#.
.######.
.#....#.
.######.
`)

picture('exchange', `
..####..
.######.
.#.##.#.
.######.
.#.##.#.
.######.
.#.##.#.
########
`)
