import { registerSprite } from '../../core/sprites'

function picture(id: string, art: string) {
  const rows = art.trim().split('\n').map((row) => row.trimEnd())
  const width = Math.max(...rows.map((row) => row.length))
  registerSprite(id, rows.map((row) => row.padEnd(width, '.')))
}

picture('ship-cargo', `
....#....
...###...
...###...
..#####..
..#####..
..#####..
..#####..
...###...
....#....
`)

picture('ship-tanker', `
....#....
...###...
..#####..
.#######.
.#######.
.#######.
..#####..
...###...
....#....
`)

picture('ship-pax', `
.....#.....
....###....
...#####...
..##.#.##..
..##.#.##..
...#####...
....###....
.....#.....
`)

picture('ship-fish', `
....#....
...###...
..#.#.#..
...###...
....#....
...###...
....#....
`)

picture('ship-mil', `
....#....
...###...
..#####..
.#.###.#.
..#####..
...###...
..#.#.#..
....#....
`)

picture('ship-tug', `
...#...
..###..
.#####.
..###..
...#...
..###..
`)

picture('ship-sail', `
....#....
...#.#...
..#...#..
.#.....#.
....#....
...###...
....#....
`)

picture('ship-unk', `
....#....
...###...
..#####..
...###...
....#....
`)

const NAMES: Record<string, string> = {
  'ship-cargo': 'CARGO',
  'ship-tanker': 'TANKER',
  'ship-pax': 'PASSENGER',
  'ship-fish': 'FISHING',
  'ship-mil': 'MILITARY',
  'ship-tug': 'TUG',
  'ship-sail': 'SAILING',
  'ship-unk': 'VESSEL',
}

export function classifyShip(shipType: number): { sprite: string; name: string } {
  let sprite = 'ship-unk'
  if (shipType >= 70 && shipType <= 79) sprite = 'ship-cargo'
  else if (shipType >= 80 && shipType <= 89) sprite = 'ship-tanker'
  else if (shipType >= 60 && shipType <= 69) sprite = 'ship-pax'
  else if (shipType === 30) sprite = 'ship-fish'
  else if (shipType === 35) sprite = 'ship-mil'
  else if (shipType === 36) sprite = 'ship-sail'
  else if (shipType === 31 || shipType === 32 || shipType === 52) sprite = 'ship-tug'
  return { sprite, name: NAMES[sprite] ?? 'VESSEL' }
}

const MID: Record<string, string> = {
  '211': 'DE', '219': 'DK', '224': 'ES', '226': 'FR', '227': 'FR', '228': 'FR',
  '230': 'FI', '232': 'GB', '233': 'GB', '234': 'GB', '235': 'GB',
  '244': 'NL', '246': 'NL', '255': 'PT', '257': 'NO', '261': 'PL',
  '265': 'SE', '273': 'RU', '275': 'LV', '276': 'EE', '277': 'LT',
  '303': 'US', '338': 'US', '366': 'US', '367': 'US', '368': 'US', '369': 'US',
  '412': 'CN', '413': 'CN', '414': 'CN', '431': 'JP', '477': 'HK',
}

export function flagFromMmsi(mmsi: number): string {
  const mid = String(Math.trunc(mmsi)).padStart(9, '0').slice(0, 3)
  return MID[mid] ?? ''
}
