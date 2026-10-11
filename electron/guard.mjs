/** Memory decisions shared by the Electron main process. No Node or Electron imports. */

export const SHED_HEAP_BYTES = 420 * 1024 * 1024
export const RELOAD_HEAP_BYTES = 900 * 1024 * 1024
export const SHED_HEAP_RATIO = 0.62
export const RELOAD_HEAP_RATIO = 0.82
export const SHED_RSS_KB = 1_200_000
export const RELOAD_RSS_KB = 2_000_000
export const MAX_RECOVERS = 3
export const RECOVER_WINDOW_MS = 120_000

/** `used` and `limit` are JS heap bytes. Missing numbers stay 'ok'. */
export function heapAction(used, limit) {
  if (!(used > 0) || !(limit > 0)) return 'ok'
  if (used >= RELOAD_HEAP_BYTES || used / limit >= RELOAD_HEAP_RATIO) return 'reload'
  if (used >= SHED_HEAP_BYTES || used / limit >= SHED_HEAP_RATIO) return 'shed'
  return 'ok'
}

/** `workingSetKb` is Electron ProcessMetric.memory.workingSetSize. */
export function rendererAction(workingSetKb) {
  if (!(workingSetKb > 0)) return 'ok'
  if (workingSetKb >= RELOAD_RSS_KB) return 'reload'
  if (workingSetKb >= SHED_RSS_KB) return 'shed'
  return 'ok'
}

/** At most MAX_RECOVERS reloads inside the window, so a crash loop stops. */
export function allowRecover(stamps, now) {
  const recent = stamps.filter((stamp) => now - stamp < RECOVER_WINDOW_MS)
  return { recent, ok: recent.length < MAX_RECOVERS }
}
