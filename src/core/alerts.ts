import type { AlertBoard as AlertApi, AlertItem, WatchRule } from './types'

const KEY = 'alleyes.watches.v1'
const DEDUPE_MS = 10 * 60 * 1000

export class AlertBoard implements AlertApi {
  rules: WatchRule[] = []
  items: AlertItem[] = []
  private seen = new Map<string, number>()
  private listeners = new Set<() => void>()

  constructor() {
    try {
      const raw = localStorage.getItem(KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as WatchRule[]
      if (Array.isArray(parsed)) this.rules = parsed.filter(isRule)
    } catch {
      this.rules = []
    }
  }

  add(rule: WatchRule): void {
    this.rules = [...this.rules, rule]
    this.persist()
    this.emit()
  }

  remove(id: string): void {
    this.rules = this.rules.filter((rule) => rule.id !== id)
    this.persist()
    this.emit()
  }

  clearRules(): void {
    this.rules = []
    this.persist()
    this.emit()
  }

  raise(key: string, title: string, detail: string): boolean {
    const prev = this.seen.get(key) ?? 0
    const now = Date.now()
    if (now - prev < DEDUPE_MS) return false
    this.seen.set(key, now)
    this.items = [{ id: `${key}:${now}`, at: now, title, detail }, ...this.items].slice(0, 40)
    this.emit()
    return true
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  private persist(): void {
    localStorage.setItem(KEY, JSON.stringify(this.rules))
  }

  private emit(): void {
    for (const fn of this.listeners) fn()
  }
}

function isRule(value: unknown): value is WatchRule {
  if (!value || typeof value !== 'object') return false
  const rule = value as WatchRule
  return (
    typeof rule.id === 'string' &&
    (rule.kind === 'quake' || rule.kind === 'flight' || rule.kind === 'pass') &&
    typeof rule.value === 'string'
  )
}
