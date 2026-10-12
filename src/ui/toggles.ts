/** Top-bar panels and the radar/sound/viewer switches. */

export type PanelName = 'cfg' | 'link' | 'shot' | 'legend' | 'more'

export interface ChromeState {
  panel: PanelName | null
  radar: boolean
  sound: boolean
  viewer: boolean
}

export function togglePanel(state: ChromeState, name: PanelName): ChromeState {
  return { ...state, panel: state.panel === name ? null : name }
}

export function toggleRadar(state: ChromeState): ChromeState {
  return { ...state, radar: !state.radar }
}

export function toggleSound(state: ChromeState): ChromeState {
  return { ...state, sound: !state.sound }
}

export function toggleViewer(state: ChromeState): ChromeState {
  return { ...state, viewer: !state.viewer }
}

export function escapePanels(state: ChromeState): ChromeState {
  return { ...state, panel: null }
}

export type PointerHit = 'panel' | 'button' | 'globe' | 'away'

/**
 * A click outside a transient popover closes it.
 * The settings panel stays up (it has its own close control).
 * A click on the globe is a selection, so it leaves the open panel alone.
 */
export function pointerPanels(state: ChromeState, hit: PointerHit): ChromeState {
  if (hit === 'panel' || hit === 'button' || hit === 'globe') return state
  if (state.panel === 'cfg') return state
  return { ...state, panel: null }
}
