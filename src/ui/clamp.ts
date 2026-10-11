/** Keep a box inside the window. Used by the hover tooltip and the opt-in pin card. */

export function clampBox(
  x: number,
  y: number,
  width: number,
  height: number,
  viewW: number,
  viewH: number,
  margin = 8,
): { left: number; top: number } {
  const maxLeft = Math.max(margin, viewW - width - margin)
  const maxTop = Math.max(margin, viewH - height - margin)
  return {
    left: Math.min(maxLeft, Math.max(margin, x)),
    top: Math.min(maxTop, Math.max(margin, y)),
  }
}

/** Tooltip prefers the lower-right of the cursor, then flips, then clamps. */
export function placeTip(
  anchorX: number,
  anchorY: number,
  tipW: number,
  tipH: number,
  viewW: number,
  viewH: number,
  margin = 8,
): { left: number; top: number } {
  let left = anchorX + 14
  let top = anchorY + 14
  if (left + tipW > viewW - margin) left = anchorX - tipW - 14
  if (top + tipH > viewH - margin) top = anchorY - tipH - 14
  return clampBox(left, top, tipW, tipH, viewW, viewH, margin)
}
