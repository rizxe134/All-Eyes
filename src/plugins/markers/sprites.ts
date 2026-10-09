import { registerSprite } from '../../core/sprites'

function picture(id: string, art: string) {
  const rows = art.trim().split('\n').map((row) => row.trimEnd())
  const width = Math.max(...rows.map((row) => row.length))
  registerSprite(id, rows.map((row) => row.padEnd(width, '.')))
}

picture('ico-quake', `
....#....
...###...
..#.#.#..
.#..#..#.
...###...
..#.#.#..
....#....
`)

picture('ico-storm', `
..#####..
.#..#..#.
#..#.#..#
.#..#..#.
..#.#.#..
...#.#...
....#....
`)

picture('ico-event', `
....#....
...###...
..#####..
...###...
....#....
`)

picture('ico-fire', `
....#....
...#.#...
..#.#.#..
.#.###.#.
..#####..
...###...
`)

picture('ico-volcano', `
....#....
...###...
..##.##..
.#######.
###...###
`)

picture('ico-launch', `
....#....
...###...
....#....
...###...
..#.#.#..
.#.....#.
..#...#..
`)

export function eventSprite(category: string): string {
  if (/volcano/i.test(category)) return 'ico-volcano'
  if (/fire|wildfire/i.test(category)) return 'ico-fire'
  if (/storm|cyclone|hurricane/i.test(category)) return 'ico-storm'
  return 'ico-event'
}
