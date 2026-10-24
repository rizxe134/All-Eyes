/**
 * ALPR camera locations from OpenStreetMap, as crowdsourced by DeFlock (deflock.me).
 * Location only. Nothing here ever requests a Flock feed, image, or portal.
 */
const UA = 'AllEyes/4.1.0 (local educational globe; https://github.com/rizxe134/All-Eyes)'

/** DeFlock's own Overpass first, then the public mirrors. */
export const OVERPASS_MIRRORS = [
  'https://overpass.deflock.org/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
]
/** DeFlock's public, keyless daily GeoJSON of every US ALPR point (OSM-derived). */
export const DEFLOCK_ALL = 'https://data.dontgetflocked.com/cameras.geojson.gz'

const TILE_TTL = 30 * 60 * 1000
const ALL_TTL = 6 * 60 * 60 * 1000
const MIN_GAP_MS = 1100
const MAX_SPAN = 1.0

/** @type {Map<string, { exp: number, status: number, type: string, body: Buffer }>} */
const cache = new Map()
let chain = Promise.resolve()
let lastAt = 0

function json(status, value) {
  return { status, type: 'application/json; charset=utf-8', body: Buffer.from(JSON.stringify(value)) }
}

async function remember(key, ttl, load) {
  const hit = cache.get(key)
  if (hit && hit.exp > Date.now()) return hit
  try {
    const result = await load()
    const entry = { ...result, exp: Date.now() + (result.status === 200 ? ttl : 20000) }
    cache.set(key, entry)
    return entry
  } catch (err) {
    const entry = { ...json(502, { error: err instanceof Error ? err.message : 'fetch failed' }), exp: Date.now() + 20000 }
    cache.set(key, entry)
    return entry
  }
}

/** One Overpass request at a time, at least MIN_GAP_MS apart. */
function polite(task) {
  const run = chain.then(async () => {
    const wait = lastAt + MIN_GAP_MS - Date.now()
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    try {
      return await task()
    } finally {
      lastAt = Date.now()
    }
  })
  chain = run.catch(() => undefined)
  return run
}

/**
 * @param {number} s @param {number} w @param {number} n @param {number} e
 */
export function alprQuery(s, w, n, e) {
  const box = `${s.toFixed(4)},${w.toFixed(4)},${n.toFixed(4)},${e.toFixed(4)}`
  return `[out:json][timeout:25];(node["man_made"="surveillance"]["surveillance:type"="ALPR"](${box});way["man_made"="surveillance"]["surveillance:type"="ALPR"](${box}););out center tags;`
}

/** @param {unknown} body */
export function overpassFailed(body) {
  if (!body || typeof body !== 'object') return true
  const remark = typeof body.remark === 'string' ? body.remark : ''
  return !Array.isArray(body.elements) || /timed out|out of memory|rate_limited|runtime error/i.test(remark)
}

async function overpass(query) {
  let last = 'no mirror answered'
  for (const mirror of OVERPASS_MIRRORS) {
    try {
      const res = await polite(() =>
        fetch(mirror, {
          method: 'POST',
          headers: { 'user-agent': UA, accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ data: query }),
          signal: AbortSignal.timeout(30000),
        }),
      )
      if (!res.ok) {
        last = `${new URL(mirror).host} ${res.status}`
        continue
      }
      const body = await res.json()
      if (overpassFailed(body)) {
        last = `${new URL(mirror).host} ${body?.remark || 'bad body'}`
        continue
      }
      return { ...body, mirror: new URL(mirror).host }
    } catch (err) {
      last = `${new URL(mirror).host} ${err instanceof Error ? err.message : 'failed'}`
    }
  }
  throw new Error(last)
}

/** @param {unknown} geo */
export function compactDeflock(geo) {
  const feats = geo && typeof geo === 'object' && Array.isArray(geo.features) ? geo.features : []
  const brands = []
  const index = new Map()
  const points = []
  for (const f of feats) {
    const c = f?.geometry?.type === 'Point' ? f.geometry.coordinates : null
    if (!Array.isArray(c)) continue
    const lon = Number(c[0])
    const lat = Number(c[1])
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || (Math.abs(lat) < 1e-6 && Math.abs(lon) < 1e-6)) continue
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) continue
    const p = f.properties || {}
    const brand = typeof p.brand === 'string' && p.brand ? p.brand : typeof p.manufacturer === 'string' ? p.manufacturer : ''
    let b = index.get(brand)
    if (b == null) {
      b = brands.length
      brands.push(brand)
      index.set(brand, b)
    }
    const type = p.osmType === 'way' ? 'w' : 'n'
    points.push([Math.round(lat * 1e5) / 1e5, Math.round(lon * 1e5) / 1e5, b, Number(p.osmId) || 0, type])
  }
  return { brands, points }
}

/**
 * @param {import('node:http').IncomingMessage} _req
 * @param {URL} url
 */
export async function routeFlock(_req, url) {
  const path = url.pathname
  if (path === '/api/flock/area') {
    const s = Number(url.searchParams.get('s'))
    const w = Number(url.searchParams.get('w'))
    const n = Number(url.searchParams.get('n'))
    const e = Number(url.searchParams.get('e'))
    if (![s, w, n, e].every(Number.isFinite) || s >= n || w >= e || n - s > MAX_SPAN || e - w > MAX_SPAN || s < -90 || n > 90 || w < -180 || e > 180) {
      return json(400, { error: 'bad box' })
    }
    const key = `area:${s.toFixed(2)},${w.toFixed(2)},${n.toFixed(2)},${e.toFixed(2)}`
    return remember(key, TILE_TTL, async () => json(200, await overpass(alprQuery(s, w, n, e))))
  }
  if (path === '/api/flock/all') {
    return remember('all', ALL_TTL, async () => {
      const res = await fetch(DEFLOCK_ALL, { headers: { 'user-agent': UA, accept: 'application/geo+json,application/json' }, signal: AbortSignal.timeout(90000) })
      if (!res.ok) return json(res.status, { error: `deflock ${res.status}` })
      return json(200, { ...compactDeflock(await res.json()), source: 'DeFlock daily GeoJSON (OpenStreetMap)' })
    })
  }
  return json(404, { error: 'unknown flock route' })
}
