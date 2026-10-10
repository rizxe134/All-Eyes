export interface ScreenHit {
  id: string
  d: number
}

/**
 * Nearest contact wins. A repeated click on the same set cycles through the
 * overlaps so a sprite underneath can still be selected.
 */
export function chooseHit<T extends ScreenHit>(
  hits: readonly T[],
  previousKey: string,
  previousIndex: number,
): { item: T; key: string; index: number } | null {
  if (hits.length === 0) return null
  const sorted = [...hits].sort((a, b) => a.d - b.d || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const key = sorted.map((hit) => hit.id).join('|')
  const index = key === previousKey && sorted.length > 1 ? (previousIndex + 1) % sorted.length : 0
  const item = sorted[index]
  if (!item) return null
  return { item, key, index }
}
