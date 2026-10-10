/** Invisible pick radius in CSS pixels. Independent of how small the sprite is. */
export const HIT_PX = 14
/** Touch and other coarse pointers get a larger pad. */
export const HIT_PX_COARSE = 22
/** Contacts this close are a tie. Priority, then id, decides. */
export const HIT_TIE_PX = 4

export interface ScreenHit {
  id: string
  d: number
  /** Lower wins a near-tie. Aircraft outrank ships, which outrank faint dots. */
  priority?: number
}

export function hitRadiusPx(coarse: boolean): number {
  return coarse ? HIT_PX_COARSE : HIT_PX
}

/** Lower is easier to pick when two markers sit on the same pixels. */
export function layerPriority(layerId: string): number {
  if (layerId === 'aircraft' || layerId === 'airground') return 0
  if (layerId === 'ships') return 1
  if (layerId === 'storms') return 2
  if (layerId === 'quakes') return 3
  if (layerId === 'launches') return 4
  if (layerId === 'events') return 5
  if (layerId === 'beacons') return 8
  return 6
}

export function compareHits(a: ScreenHit, b: ScreenHit): number {
  if (Math.abs(a.d - b.d) <= HIT_TIE_PX) {
    const priority = (a.priority ?? 0) - (b.priority ?? 0)
    if (priority !== 0) return priority
  }
  if (a.d !== b.d) return a.d - b.d
  if (a.id < b.id) return -1
  if (a.id > b.id) return 1
  return 0
}

/**
 * Nearest contact wins. A near-tie breaks toward the higher-priority kind, then
 * the id. A repeated click on the same set cycles through the overlaps.
 */
export function chooseHit<T extends ScreenHit>(
  hits: readonly T[],
  previousKey: string,
  previousIndex: number,
): { item: T; key: string; index: number } | null {
  if (hits.length === 0) return null
  const sorted = [...hits].sort(compareHits)
  const key = sorted.map((hit) => hit.id).join('|')
  const index = key === previousKey && sorted.length > 1 ? (previousIndex + 1) % sorted.length : 0
  const item = sorted[index]
  if (!item) return null
  return { item, key, index }
}
