/**
 * Left-dock shape for a window. At 720 px tall or 900 px wide the radar sits beside the
 * layer list and the list uses two columns, so a layer button is never covered.
 */
export interface DockLayout {
  columns: 1 | 2
  radarPx: number
  radarSide: boolean
  menuScrolls: boolean
}

export function dockLayout(width: number, height: number): DockLayout {
  const two = height <= 720 || width <= 900
  const side = height <= 720 || width <= 900
  return {
    columns: two ? 2 : 1,
    radarPx: side ? 96 : 148,
    radarSide: side,
    menuScrolls: true,
  }
}
