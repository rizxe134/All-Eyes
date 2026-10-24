/** Top-level desk. Switching tabs changes only `tab`. */

export type TabId = 'globe' | 'cameras' | 'news' | 'stocks'

export const TAB_ORDER: readonly TabId[] = ['globe', 'cameras', 'news', 'stocks']

export interface DeskState {
  tab: TabId
  cameraId: string | null
  newsQuery: string
  watchlist: string[]
}

export function switchTab(state: DeskState, tab: TabId): DeskState {
  if (state.tab === tab) return state
  return { ...state, tab }
}

/** Cmd/Ctrl+1..4. Plain digits are not shortcuts. */
export function tabFromShortcut(key: string): TabId | null {
  if (key === '1') return 'globe'
  if (key === '2') return 'cameras'
  if (key === '3') return 'news'
  if (key === '4') return 'stocks'
  return null
}
