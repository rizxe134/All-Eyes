import type { SimClock as SimClockApi } from './types'

export class SimClock implements SimClockApi {
  offsetMs = 0
  private listeners = new Set<(now: number) => void>()

  now(): number {
    return Date.now() + this.offsetMs
  }

  setOffsetMs(ms: number): void {
    this.offsetMs = ms
    const now = this.now()
    for (const fn of this.listeners) fn(now)
  }

  subscribe(cb: (now: number) => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  live(): boolean {
    return Math.abs(this.offsetMs) < 1500
  }
}
