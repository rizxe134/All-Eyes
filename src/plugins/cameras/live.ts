/** Live-edge and clip-refresh rules for camera playback. Pure, so they are unit tested. */

export const HLS_LIVE_CONFIG = {
  enableWorker: false,
  lowLatencyMode: true,
  liveSyncDurationCount: 2,
  liveMaxLatencyDurationCount: 5,
  maxLiveSyncPlaybackRate: 1.5,
  backBufferLength: 10,
  manifestLoadingMaxRetry: 1,
  levelLoadingMaxRetry: 1,
  fragLoadingMaxRetry: 0,
  manifestLoadingTimeOut: 8000,
  levelLoadingTimeOut: 8000,
  fragLoadingTimeOut: 8000,
} as const

/** Seconds to wait after a clip ends before fetching a fresh one. */
export const CLIP_WAIT_SEC = 10
/** No playback progress for this long means the stream stalled. */
export const STALL_MS = 8000
/** Reloads tried before a stalled stream is reported as failed. */
export const MAX_STALL_RELOADS = 2
/** Behind the live edge by more than this, jump forward. */
export const MAX_LAG_SEC = 12

export function clipCountdownLabel(secLeft: number): string {
  const s = Math.max(0, Math.ceil(secLeft))
  return s > 0 ? `VIDEO CLIP · ENDED · NEW CLIP IN ${s}s` : 'VIDEO CLIP · LOADING NEW CLIP'
}

export function needsResync(currentTime: number, syncPosition: number | null | undefined, maxLag = MAX_LAG_SEC): boolean {
  if (syncPosition == null || !Number.isFinite(syncPosition) || !Number.isFinite(currentTime)) return false
  return syncPosition - currentTime > maxLag
}

/** Tracks playback progress; reports a stall when time has not advanced for `stallMs` while playing. */
export class StallWatch {
  private lastTime = -1
  private lastMove = 0
  constructor(private readonly stallMs = STALL_MS) {}
  reset(now: number): void {
    this.lastTime = -1
    this.lastMove = now
  }
  feed(currentTime: number, now: number, paused = false): boolean {
    if (paused || currentTime !== this.lastTime) {
      if (currentTime !== this.lastTime) this.lastTime = currentTime
      this.lastMove = now
      return false
    }
    return now - this.lastMove >= this.stallMs
  }
}
