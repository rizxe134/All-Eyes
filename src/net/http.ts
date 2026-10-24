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
  if (url.includes('/api/traffic/tomtom') && current.tomtomKey) headers['x-tomtom-key'] = current.tomtomKey
  if (url.includes('/api/traffic/here') && current.hereKey) headers['x-here-key'] = current.hereKey
  if (url.includes('/api/geocode/maptiler') && current.maptilerKey) headers['x-maptiler-key'] = current.maptilerKey
  if (url.includes('/api/geocode/mapbox') && current.mapboxKey) headers['x-mapbox-key'] = current.mapboxKey
  if (url.includes('/api/cams/windy') && current.windyKey) headers['x-windy-key'] = current.windyKey
  if (url.includes('/api/cams/wsdot') && current.wsdotKey) headers['x-wsdot-key'] = current.wsdotKey
  if (url.includes('/api/cams/ohgo') && current.ohgoKey) headers['x-ohgo-key'] = current.ohgoKey
  if (url.includes('/api/desk/newsapi') && current.newsApiKey) headers['x-newsapi-key'] = current.newsApiKey
  if (url.includes('/api/desk/gnews') && current.gnewsKey) headers['x-gnews-key'] = current.gnewsKey
  if (url.includes('/api/desk/finnhub') && current.finnhubKey) headers['x-finnhub-key'] = current.finnhubKey
  if (url.includes('/api/desk/twelve') && current.twelveKey) headers['x-twelve-key'] = current.twelveKey
  if (url.includes('/api/desk/alpha') && current.alphaKey) headers['x-alpha-key'] = current.alphaKey
  if (url.includes('/api/desk/polygon') && current.polygonKey) headers['x-polygon-key'] = current.polygonKey
  if (url.includes('/api/desk/fmp') && current.fmpKey) headers['x-fmp-key'] = current.fmpKey
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

export async function getJson(url: string, settings: SettingsStore, parent?: AbortSignal, timeoutMs = 20000): Promise<unknown> {
  const linked = linkTimeout(parent, timeoutMs)
  try {
    const res = await fetch(url, { signal: linked.signal, headers: authHeaders(url, settings) })
    if (!res.ok) throw new Error(`${res.status} ${url}`)
    return await res.json()
  } finally {
    linked.done()
  }
}

export async function getText(url: string, settings: SettingsStore, parent?: AbortSignal, timeoutMs = 20000): Promise<string> {
  const linked = linkTimeout(parent, timeoutMs)
  try {
    const res = await fetch(url, { signal: linked.signal, headers: authHeaders(url, settings) })
    if (!res.ok) throw new Error(`${res.status} ${url}`)
    return await res.text()
  } finally {
    linked.done()
  }
}
