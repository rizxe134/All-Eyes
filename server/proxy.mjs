import { existsSync, readFileSync } from 'node:fs'

const UA = 'AllEyes/1.4.1 (local educational globe)'

const CELESTRAK_GROUPS = new Set([
  'stations',
  'visual',
  'weather',
  'gps-ops',
  'science',
  'starlink',
  'amateur',
  'geo',
  'iridium-NEXT',
  'noaa',
  'resource',
])

const USGS_FEEDS = new Set(['2.5_day', '4.5_week', 'all_day'])

/** @type {Map<string, { exp: number, status: number, type: string, body: Buffer }>} */
const cache = new Map()

/** @type {{ id: string, token: string, exp: number }} */
let openskyAuth = { id: '', token: '', exp: 0 }
let lastNominatim = 0

/**
 * Load KEY=VALUE lines into process.env when the variable is still empty.
 * @param {string} file
 */
export function applyEnvFile(file) {
  if (!file || !existsSync(file)) return
  const text = readFileSync(file, 'utf8')
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = value
  }
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {string} name
 */
function header(req, name) {
  const value = req.headers[name]
  if (Array.isArray(value)) return value[0] ?? ''
  return value ?? ''
}

/**
 * @param {number} status
 * @param {string} message
 */
function jsonError(status, message) {
  return {
    status,
    type: 'application/json; charset=utf-8',
    body: Buffer.from(JSON.stringify({ error: message })),
    exp: Date.now() + 2000,
  }
}

/**
 * @param {string} key
 * @param {number} ttl
 * @param {() => Promise<{ status: number, type: string, body: Buffer }>} load
 */
async function cached(key, ttl, load) {
  const now = Date.now()
  const hit = cache.get(key)
  if (hit && hit.exp > now) return hit
  try {
    const result = await load()
    const entry = {
      status: result.status,
      type: result.type,
      body: result.body,
      exp: now + (result.status >= 200 && result.status < 300 ? ttl : 4000),
    }
    cache.set(key, entry)
    return entry
  } catch (err) {
    const entry = jsonError(502, err instanceof Error ? err.message : 'fetch failed')
    cache.set(key, entry)
    return entry
  }
}

/**
 * @param {string} url
 * @param {{ headers?: Record<string, string>, ttl?: number, key?: string, timeout?: number }} [opts]
 */
async function upstream(url, opts = {}) {
  const ttl = opts.ttl ?? 15000
  const key = opts.key || url
  const timeout = opts.timeout ?? 20000
  return cached(key, ttl, async () => {
    const res = await fetch(url, {
      headers: {
        'user-agent': UA,
        accept: 'application/json,text/plain,*/*',
        ...(opts.headers ?? {}),
      },
      signal: AbortSignal.timeout(timeout),
    })
    const body = Buffer.from(await res.arrayBuffer())
    return {
      status: res.status,
      type: res.headers.get('content-type') || 'application/octet-stream',
      body,
    }
  })
}

/**
 * @param {string} id
 * @param {string} secret
 */
async function openskyBearer(id, secret) {
  if (!id || !secret) return ''
  if (openskyAuth.id === id && openskyAuth.token && Date.now() < openskyAuth.exp - 20000) {
    return openskyAuth.token
  }
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: id,
    client_secret: secret,
  })
  const res = await fetch(
    'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'user-agent': UA,
      },
      body,
      signal: AbortSignal.timeout(12000),
    },
  )
  if (!res.ok) return ''
  const json = await res.json()
  const token = typeof json.access_token === 'string' ? json.access_token : ''
  openskyAuth = {
    id,
    token,
    exp: Date.now() + (Number(json.expires_in) || 1800) * 1000,
  }
  return token
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {URL} url
 */
async function route(req, url) {
  const path = url.pathname

  if (path === '/api/opensky/states') {
    const id = header(req, 'x-opensky-client-id') || process.env.OPENSKY_CLIENT_ID || ''
    const secret = header(req, 'x-opensky-client-secret') || process.env.OPENSKY_CLIENT_SECRET || ''
    const token = await openskyBearer(id, secret)
    const box = ['lamin', 'lomin', 'lamax', 'lomax'].map((key) => {
      const value = Number(url.searchParams.get(key))
      return Number.isFinite(value) ? `${key}=${value}` : ''
    }).filter(Boolean)
    const target = box.length === 4
      ? `https://opensky-network.org/api/states/all?${box.join('&')}`
      : 'https://opensky-network.org/api/states/all'
    const boxKey = box.length === 4 ? box.join(',') : 'all'
    if (token) {
      const authed = await upstream(target, {
        headers: { authorization: `Bearer ${token}` },
        ttl: 10000,
        key: `opensky:${id}:${boxKey}`,
        timeout: 4500,
      })
      if (authed.status !== 401 && authed.status !== 403) return authed
    }
    return upstream(target, { ttl: 10000, key: `opensky:anon:${boxKey}`, timeout: 4500 })
  }

  if (path === '/api/adsb/point') {
    const lat = Number(url.searchParams.get('lat'))
    const lon = Number(url.searchParams.get('lon'))
    const dist = Math.min(250, Math.max(10, Number(url.searchParams.get('dist')) || 220))
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      return jsonError(400, 'bad point')
    }
    const target = `https://api.adsb.lol/v2/lat/${lat.toFixed(2)}/lon/${lon.toFixed(2)}/dist/${Math.round(dist)}`
    return upstream(target, { ttl: 12000, timeout: 12000 })
  }

  if (path === '/api/adsb/mil') {
    return upstream('https://api.adsb.lol/v2/mil', { ttl: 15000, timeout: 12000 })
  }

  if (path === '/api/airplanes/point' || path === '/api/adsbfi/point') {
    const lat = Number(url.searchParams.get('lat'))
    const lon = Number(url.searchParams.get('lon'))
    const dist = Math.min(250, Math.max(10, Number(url.searchParams.get('dist')) || 220))
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      return jsonError(400, 'bad point')
    }
    const host = path === '/api/airplanes/point' ? 'https://api.airplanes.live' : 'https://opendata.adsb.fi/api'
    const target = `${host}/v2/lat/${lat.toFixed(2)}/lon/${lon.toFixed(2)}/dist/${Math.round(dist)}`
    return upstream(target, { ttl: 12000, timeout: 8000 })
  }

  if (path === '/api/celestrak') {
    const group = url.searchParams.get('group') || ''
    if (!CELESTRAK_GROUPS.has(group)) return jsonError(400, 'unknown satellite group')
    const target = `https://celestrak.org/NORAD/elements/gp.php?GROUP=${encodeURIComponent(group)}&FORMAT=tle`
    return upstream(target, {
      ttl: 2 * 60 * 60 * 1000,
      headers: { accept: 'text/plain' },
      timeout: 20000,
    })
  }

  if (path === '/api/usgs/quakes') {
    const feed = url.searchParams.get('feed') || '2.5_day'
    if (!USGS_FEEDS.has(feed)) return jsonError(400, 'unknown quake feed')
    const target = `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/${feed}.geojson`
    return upstream(target, { ttl: 60000 })
  }

  if (path === '/api/adsbdb') {
    const hex = (url.searchParams.get('hex') || '').toLowerCase()
    if (!/^[0-9a-f]{6}$/.test(hex)) return jsonError(400, 'bad hex')
    return upstream(`https://api.adsbdb.com/v0/aircraft/${hex}`, {
      ttl: 24 * 60 * 60 * 1000,
      timeout: 8000,
      key: `adsbdb:${hex}`,
    })
  }

  if (path === '/api/adsbdb/callsign') {
    const cs = (url.searchParams.get('cs') || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
    if (!/^[A-Z0-9]{3,8}$/.test(cs)) return jsonError(400, 'bad callsign')
    return upstream(`https://api.adsbdb.com/v0/callsign/${cs}`, {
      ttl: 6 * 60 * 60 * 1000,
      timeout: 8000,
      key: `adsbdbcs:${cs}`,
    })
  }

  if (path === '/api/spot') {
    const hex = (url.searchParams.get('hex') || '').toLowerCase()
    if (!/^[0-9a-f]{6}$/.test(hex)) return jsonError(400, 'bad hex')
    return upstream(`https://api.planespotters.net/pub/photos/hex/${hex}`, {
      ttl: 24 * 60 * 60 * 1000,
      timeout: 8000,
      key: `spot:${hex}`,
      headers: {
        accept: 'application/json',
        'user-agent': 'AllEyes/1.4.1 (+https://github.com/rizxe134/All-Eyes)',
      },
    })
  }

  if (path === '/api/ais/locations') {
    return upstream('https://meri.digitraffic.fi/api/ais/v1/locations', {
      ttl: 20000,
      headers: {
        accept: 'application/json',
        'digitraffic-user': UA,
      },
      timeout: 20000,
    })
  }

  if (path === '/api/ais/vessels') {
    return upstream('https://meri.digitraffic.fi/api/ais/v1/vessels', {
      ttl: 10 * 60 * 1000,
      headers: {
        accept: 'application/json',
        'digitraffic-user': UA,
      },
      timeout: 20000,
    })
  }

  if (path === '/api/nhc/storms') {
    return upstream('https://www.nhc.noaa.gov/CurrentStorms.json', { ttl: 5 * 60000 })
  }

  if (path === '/api/eonet/events') {
    return upstream('https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=80', {
      ttl: 5 * 60000,
    })
  }

  if (path === '/api/launches') {
    return upstream('https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=12', {
      ttl: 10 * 60000,
    })
  }

  if (path === '/api/swpc/kp') {
    return upstream('https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json', {
      ttl: 10 * 60000,
    })
  }

  if (path === '/api/nominatim') {
    const q = (url.searchParams.get('q') || '').trim()
    if (!q || q.length > 80) return jsonError(400, 'bad query')
    const wait = 1100 - (Date.now() - lastNominatim)
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
    lastNominatim = Date.now()
    const target =
      'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=' + encodeURIComponent(q)
    return upstream(target, { ttl: 6 * 60 * 60 * 1000, key: `geo:${q.toLowerCase()}`, timeout: 12000 })
  }

  if (path === '/api/rain/meta') {
    return upstream('https://api.rainviewer.com/public/weather-maps.json', { ttl: 120000 })
  }

  if (path === '/api/rain/tile') {
    const tilePath = url.searchParams.get('path') || ''
    const z = Number(url.searchParams.get('z'))
    const x = Number(url.searchParams.get('x'))
    const y = Number(url.searchParams.get('y'))
    if (!/^\/v2\/radar\/[A-Za-z0-9]+$/.test(tilePath)) return jsonError(400, 'bad radar path')
    if (!Number.isInteger(z) || z < 0 || z > 3) return jsonError(400, 'bad zoom')
    const n = 2 ** z
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= n || y >= n) {
      return jsonError(400, 'bad tile')
    }
    const target = `https://tilecache.rainviewer.com${tilePath}/256/${z}/${x}/${y}/2/1_1.png`
    return upstream(target, { ttl: 120000, headers: { accept: 'image/png' } })
  }

  if (path === '/api/firms/hotspots') {
    const key = header(req, 'x-firms-map-key') || process.env.FIRMS_MAP_KEY || ''
    if (!/^[A-Za-z0-9_-]{8,128}$/.test(key)) return jsonError(404, 'no firms key')
    const target = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${encodeURIComponent(key)}/VIIRS_SNPP_NRT/world/1`
    return upstream(target, {
      ttl: 10 * 60000,
      key: `firms:${key.slice(0, 6)}`,
      headers: { accept: 'text/csv' },
      timeout: 30000,
    })
  }

  return jsonError(404, 'unknown feed')
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 */
export async function handleApi(req, res) {
  const host = req.headers.host || '127.0.0.1'
  const url = new URL(req.url || '/', `http://${host}`)
  if (!url.pathname.startsWith('/api/')) return false

  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.setHeader('access-control-allow-origin', '*')
    res.setHeader('access-control-allow-headers', 'x-opensky-client-id, x-opensky-client-secret, x-firms-map-key')
    res.setHeader('access-control-allow-methods', 'GET, OPTIONS')
    res.end()
    return true
  }

  if (req.method !== 'GET') {
    res.statusCode = 405
    res.setHeader('content-type', 'text/plain')
    res.end('method')
    return true
  }

  try {
    const entry = await route(req, url)
    res.statusCode = entry.status
    res.setHeader('content-type', entry.type)
    res.setHeader('cache-control', 'no-store')
    res.setHeader('access-control-allow-origin', '*')
    res.end(entry.body)
  } catch (err) {
    res.statusCode = 502
    res.setHeader('content-type', 'application/json; charset=utf-8')
    res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'upstream failed' }))
  }
  return true
}
