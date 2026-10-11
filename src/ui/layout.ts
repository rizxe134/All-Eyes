/**
 * Left-dock shape for a window. Below 800 px tall the radar sits beside the
 * list so it cannot cover a layer button. Short windows also use two columns.
 */
export interface DockLayout {
  columns: 1 | 2
  radarPx: number
  radarSide: boolean
  menuScrolls: boolean
}

export function dockLayout(width: number, height: number): DockLayout {
  const two = height <= 720 || width <= 900
  const side = height <= 800 || width <= 900
  return {
    columns: two ? 2 : 1,
    radarPx: side ? 96 : 148,
    radarSide: side,
    menuScrolls: true,
  }
}
