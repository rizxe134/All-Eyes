import type { SettingsStore } from '../core/types'

export function authHeaders(url: string, settings: SettingsStore): Record<string, string> {
  const headers: Record<string, string> = {}
  const current = settings.get()
  if (url.includes('/api/opensky/') && current.openskyId && current.openskySecret) {
    headers['x-opensky-client-id'] = current.openskyId
    headers['x-opensky-client-secret'] = current.openskySecret
  }
  if (url.includes('/api/firms/') && current.firmsKey) {
    headers['x-firms-map-key'] = current.firmsKey
  }
  return headers
}

export interface LinkedSignal {
  signal: AbortSignal
  done: () => void
}

export function linkTimeout(parent: AbortSignal | undefined, ms: number): LinkedSignal {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  const onAbort = () => controller.abort()
  parent?.addEventListener('abort', onAbort)
  return {
    signal: controller.signal,
    done() {
      clearTimeout(timer)
      parent?.removeEventListener('abort', onAbort)
    },
  }
}

export async function getJson(url: string, settings: SettingsStore, parent?: AbortSignal): Promise<unknown> {
  const linked = linkTimeout(parent, 20000)
  try {
    const res = await fetch(url, { signal: linked.signal, headers: authHeaders(url, settings) })
    if (!res.ok) throw new Error(`${res.status} ${url}`)
    return await res.json()
  } finally {
    linked.done()
  }
}

export async function getText(url: string, settings: SettingsStore, parent?: AbortSignal): Promise<string> {
  const linked = linkTimeout(parent, 20000)
  try {
    const res = await fetch(url, { signal: linked.signal, headers: authHeaders(url, settings) })
    if (!res.ok) throw new Error(`${res.status} ${url}`)
    return await res.text()
  } finally {
    linked.done()
  }
}
