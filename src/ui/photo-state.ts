/** Photo frame phases. The placeholder is only for none and failed. */

export type PhotoPhase = 'none' | 'pending' | 'shown' | 'failed'

export interface PhotoFrame {
  url: string
  /** Bumped on every new request so a late load or error cannot revive another plane. */
  token: number
  phase: PhotoPhase
}

export function emptyPhoto(): PhotoFrame {
  return { url: '', token: 0, phase: 'none' }
}

export function requestPhoto(frame: PhotoFrame, url: string): PhotoFrame {
  const next = url.trim()
  if (!next) return { url: '', token: frame.token + 1, phase: 'none' }
  if (next === frame.url && (frame.phase === 'shown' || frame.phase === 'pending')) return frame
  return { url: next, token: frame.token + 1, phase: 'pending' }
}

export function settlePhoto(frame: PhotoFrame, token: number, ok: boolean): PhotoFrame {
  if (token !== frame.token || !frame.url) return frame
  return { ...frame, phase: ok ? 'shown' : 'failed' }
}

/** Colour bars and the NO PHOTO label. False while a photo is pending or on screen. */
export function showPlaceholder(frame: PhotoFrame): boolean {
  return frame.phase === 'none' || frame.phase === 'failed'
}
