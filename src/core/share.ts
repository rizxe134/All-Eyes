export interface ShareState {
  lat: number
  lon: number
  range: number
  layers: string[]
  track: string | null
}

export function encodeShare(state: ShareState): string {
  const params = new URLSearchParams()
  params.set('lat', state.lat.toFixed(4))
  params.set('lon', state.lon.toFixed(4))
  params.set('z', Math.round(state.range).toString())
  params.set('ly', state.layers.join(','))
  if (state.track) params.set('tr', state.track)
  return params.toString()
}

export function decodeShare(hash: string): Partial<ShareState> | null {
  const raw = hash.replace(/^#/, '').trim()
  if (!raw) return null
  const params = new URLSearchParams(raw)
  const lat = Number(params.get('lat'))
  const lon = Number(params.get('lon'))
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  const range = Number(params.get('z'))
  const layers = (params.get('ly') || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  const track = params.get('tr')
  return {
    lat,
    lon,
    range: Number.isFinite(range) ? range : undefined,
    layers,
    track: track || null,
  }
}
