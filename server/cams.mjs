import { gunzipSync } from 'node:zlib'

const UA = 'AllEyes/4.0.1 (local educational globe; https://github.com/rizxe134/All-Eyes)'
const CATALOG_TTL = 20 * 60 * 1000

const HOSTS = new Map([
  ['511ga.org', 'ga'],
  ['fl511.com', 'fl'],
  ['511wi.gov', 'wi'],
  ['az511.gov', 'az'],
  ['511on.ca', 'on'],
  ['www.511pa.com', 'pa'],
  ['www.newengland511.org', 'ne'],
  ['www.udottraffic.utah.gov', 'ut'],
])

/** @type {Map<string, { exp: number, status: number, type: string, body: Buffer }>} */
const cache = new Map()
/** @type {Map<string, { exp: number, status: number, type: string, body: Buffer }>} */
const mediaCache = new Map()

function json(status, value, ttl = 0) {
  return {
    status,
    type: 'application/json; charset=utf-8',
    body: Buffer.from(JSON.stringify(value)),
    ttl,
  }
}

/**
 * @param {string} key
 * @param {number} ttl
 * @param {() => Promise<{ status: number, type: string, body: Buffer }>} load
 */
async function remember(key, ttl, load) {
  const hit = cache.get(key)
  if (hit && hit.exp > Date.now()) return hit
  try {
    const result = await load()
    const entry = {
      status: result.status,
      type: result.type,
      body: result.body,
      exp: Date.now() + (result.status >= 200 && result.status < 300 ? ttl : 15000),
    }
    cache.set(key, entry)
    return entry
  } catch (err) {
    const entry = json(502, { error: err instanceof Error ? err.message : 'fetch failed' })
    entry.exp = Date.now() + 15000
    cache.set(key, entry)
    return entry
  }
}

/**
 * @param {string} ref
 * @param {string} base
 */
function resolveUrl(ref, base) {
  return new URL(ref, base).href
}

/**
 * @param {string} abs
 */
function mediaPath(abs) {
  return `/api/cams/media?u=${encodeURIComponent(abs)}`
}

/**
 * Rewrite a playlist so every segment and nested playlist goes back through the media proxy.
 * @param {string} text
 * @param {string} base
 */
export function rewritePlaylist(text, base) {
  return text.split(/\r?\n/).map((line) => {
    const trim = line.trim()
    if (!trim) return line
    if (trim.startsWith('#')) {
      return line.replace(/URI="([^"]+)"/g, (_all, uri) => `URI="${mediaPath(resolveUrl(uri, base))}"`)
    }
    return mediaPath(resolveUrl(trim, base))
  }).join('\n')
}

/**
 * @param {string} target
 */
/** Cleartext camera URLs are promoted before the host allowlist runs. */
export function canonicalMedia(target) {
  if (typeof target !== 'string') return ''
  const trim = target.trim()
  if (/^http:\/\//i.test(trim)) return `https://${trim.slice(7)}`
  return trim
}

/**
 * Referer and Origin of the agency page. Some camera hosts reject a bare hotlink.
 * @param {string} target
 */
export function mediaHeaders(target) {
  const url = new URL(target)
  const host = url.hostname
  let page = `https://${host}`
  if (host.endsWith('.dot.ca.gov')) page = 'https://cwwp2.dot.ca.gov'
  else if (host.endsWith('.dot.wi.gov')) page = 'https://511wi.gov'
  else if (host === 's3-eu-west-1.amazonaws.com') page = 'https://www.tfl.gov.uk'
  else if (host === 'weathercam.digitraffic.fi') page = 'https://www.digitraffic.fi'
  else if (host === 'webcams.nyctmc.org') page = 'https://webcams.nyctmc.org'
  return {
    'user-agent': UA,
    accept: '*/*',
    referer: `${page}/`,
    origin: page,
  }
}

export function mediaAllowed(target) {
  let url
  try {
    url = new URL(target)
  } catch {
    return false
  }
  if (url.protocol !== 'https:' || url.username || url.password) return false
  const host = url.hostname
  if (host === 'media.dot.ca.gov' || host === 'wzmedia.dot.ca.gov' || host === 'cwwp2.dot.ca.gov') return true
  if (host.endsWith('.dot.ca.gov') || host.endsWith('.dot.wi.gov')) return true
  if (host === 's3-eu-west-1.amazonaws.com' && url.pathname.toLowerCase().includes('jamcam')) return true
  if (host === 'weathercam.digitraffic.fi' || host === 'webcams.nyctmc.org') return true
  if (HOSTS.has(host)) return true
  return false
}

/**
 * @param {string} value
 */
function keyOk(value) {
  return /^[A-Za-z0-9._~+-]{8,160}$/.test(value)
}

async function getBuffer(url, headers, timeout = 25000) {
  const res = await fetch(url, {
    headers: { 'user-agent': UA, accept: 'application/json,text/plain,*/*', ...headers },
    signal: AbortSignal.timeout(timeout),
    redirect: 'follow',
  })
  const body = Buffer.from(await res.arrayBuffer())
  return { status: res.status, type: res.headers.get('content-type') || 'application/octet-stream', body }
}

async function digitraffic() {
  const url = 'https://tie.digitraffic.fi/api/weathercam/v1/stations'
  const headers = {
    accept: 'application/json',
    'digitraffic-user': 'AllEyes/4.0.1',
  }
  let res = await fetch(url, { headers, signal: AbortSignal.timeout(30000) })
  if (res.status === 406) {
    res = await fetch(url, {
      headers: { ...headers, 'accept-encoding': 'gzip' },
      signal: AbortSignal.timeout(30000),
    })
    const raw = Buffer.from(await res.arrayBuffer())
    const encoded = res.headers.get('content-encoding') || ''
    const zipped = encoded.includes('gzip') || (raw.length > 2 && raw[0] === 0x1f && raw[1] === 0x8b)
    const body = zipped ? gunzipSync(raw) : raw
    return { status: res.status, type: 'application/json; charset=utf-8', body }
  }
  const body = Buffer.from(await res.arrayBuffer())
  return { status: res.status, type: res.headers.get('content-type') || 'application/json', body }
}

async function caltrans() {
  const data = []
  await Promise.all([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(async (district) => {
    const dd = String(district).padStart(2, '0')
    const url = `https://cwwp2.dot.ca.gov/data/d${district}/cctv/cctvStatusD${dd}.json`
    try {
      const result = await getBuffer(url, { accept: 'application/json' }, 25000)
      if (result.status !== 200) return
      const parsed = JSON.parse(result.body.toString('utf8'))
      if (Array.isArray(parsed?.data)) data.push(...parsed.data)
    } catch {
      /* one district can be down without dropping the rest */
    }
  }))
  return json(200, { data })
}

/**
 * @param {string} host
 */
async function list511(host) {
  const pageSize = 100
  const cap = 6000
  const pull = async (start) => {
    let last = 'failed'
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const res = await fetch(`https://${host}/List/GetData/Cameras`, {
          method: 'POST',
          headers: {
            'user-agent': UA,
            accept: 'application/json',
            'content-type': 'application/x-www-form-urlencoded',
            origin: `https://${host}`,
            referer: `https://${host}/`,
          },
          body: new URLSearchParams({ draw: '1', start: String(start), length: String(pageSize) }),
          signal: AbortSignal.timeout(20000),
        })
        if (!res.ok) {
          last = String(res.status)
        } else {
          return await res.json()
        }
      } catch (err) {
        last = err instanceof Error ? err.message : 'failed'
      }
      await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)))
    }
    throw new Error(`${host} page ${start} ${last}`)
  }
  const first = await pull(0)
  const total = Math.min(cap, Number(first.recordsTotal) || first.data?.length || 0)
  const data = Array.isArray(first.data) ? [...first.data] : []
  const starts = []
  for (let start = pageSize; start < total; start += pageSize) starts.push(start)
  let cursor = 0
  const worker = async () => {
    while (cursor < starts.length) {
      const start = starts[cursor++]
      try {
        const next = await pull(start)
        if (Array.isArray(next.data)) data.push(...next.data)
      } catch {
        /* a flaky page stays missing; the rest of the catalog still loads */
      }
    }
  }
  await Promise.all(Array.from({ length: 4 }, () => worker()))
  return json(200, { data, recordsTotal: total, host })
}

/**
 * @param {string} target
 * @param {number} hops
 */
async function fetchMedia(target, hops = 0) {
  const url = canonicalMedia(target)
  if (!mediaAllowed(url)) return json(400, { error: 'camera host is not allowed' })
  const res = await fetch(url, {
    headers: mediaHeaders(url),
    redirect: 'manual',
    signal: AbortSignal.timeout(20000),
  })
  if (res.status >= 300 && res.status < 400) {
    const next = res.headers.get('location')
    if (!next || hops >= 2) return json(502, { error: 'camera redirect failed' })
    return fetchMedia(canonicalMedia(new URL(next, url).href), hops + 1)
  }
  const body = Buffer.from(await res.arrayBuffer())
  const type = res.headers.get('content-type') || 'application/octet-stream'
  const head = body.subarray(0, 16).toString('utf8')
  if (type.includes('mpegurl') || type.includes('m3u8') || head.startsWith('#EXTM3U')) {
    const text = rewritePlaylist(body.toString('utf8'), url)
    return {
      status: res.status,
      type: 'application/vnd.apple.mpegurl',
      body: Buffer.from(text),
    }
  }
  return { status: res.status, type, body }
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {URL} url
 */
export async function routeCam(req, url) {
  const path = url.pathname
  if (!path.startsWith('/api/cams/')) return null

  if (path === '/api/cams/tfl') {
    return remember('cams:tfl', CATALOG_TTL, async () => getBuffer('https://api.tfl.gov.uk/Place/Type/JamCam', {}, 30000))
  }
  if (path === '/api/cams/caltrans') {
    return remember('cams:caltrans', CATALOG_TTL, caltrans)
  }
  if (path === '/api/cams/nyc') {
    return remember('cams:nyc', CATALOG_TTL, async () => getBuffer('https://webcams.nyctmc.org/api/cameras', {}, 30000))
  }
  if (path === '/api/cams/fi') {
    return remember('cams:fi', CATALOG_TTL, digitraffic)
  }
  if (path === '/api/cams/511') {
    const host = url.searchParams.get('host') || ''
    if (!HOSTS.has(host)) return json(400, { error: 'unknown camera host' })
    return remember(`cams:511:${host}`, CATALOG_TTL, () => list511(host))
  }
  if (path === '/api/cams/windy') {
    const key = header(req, 'x-windy-key') || process.env.WINDY_KEY || ''
    if (!keyOk(key)) return json(404, { error: 'no windy key' })
    const lat = Number(url.searchParams.get('lat'))
    const lon = Number(url.searchParams.get('lon'))
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return json(400, { error: 'bad point' })
    const target = `https://api.windy.com/webcams/api/v3/webcams?nearby=${lat.toFixed(3)},${lon.toFixed(3)},25&limit=30&include=images,location,urls`
    return remember(`cams:windy:${lat.toFixed(0)}:${lon.toFixed(0)}:${key.slice(0, 6)}`, 10 * 60 * 1000, () => getBuffer(target, { 'x-windy-api-key': key }, 20000))
  }
  if (path === '/api/cams/wsdot') {
    const key = header(req, 'x-wsdot-key') || process.env.WSDOT_KEY || ''
    if (!keyOk(key)) return json(404, { error: 'no wsdot key' })
    const target = `https://www.wsdot.wa.gov/Traffic/api/HighwayCameras/HighwayCamerasREST.svc/GetCamerasAsJson?AccessCode=${encodeURIComponent(key)}`
    return remember(`cams:wsdot:${key.slice(0, 6)}`, CATALOG_TTL, () => getBuffer(target, {}, 30000))
  }
  if (path === '/api/cams/ohgo') {
    const key = header(req, 'x-ohgo-key') || process.env.OHGO_KEY || ''
    if (!keyOk(key)) return json(404, { error: 'no ohgo key' })
    return remember(`cams:ohgo:${key.slice(0, 6)}`, CATALOG_TTL, () => getBuffer('https://publicapi.ohgo.com/api/v1/cameras', { 'Ocp-Apim-Subscription-Key': key }, 30000))
  }
  if (path === '/api/cams/media') {
    const target = canonicalMedia(url.searchParams.get('u') || '')
    if (!mediaAllowed(target)) return json(400, { error: 'camera host is not allowed' })
    const playlist = target.includes('.m3u8') || target.includes('mpegurl')
    const hit = mediaCache.get(target)
    if (hit && hit.exp > Date.now()) return hit
    const entry = await fetchMedia(target)
    const ttl = playlist || entry.type.includes('mpegurl') ? 4000 : 8000
    const stored = { ...entry, exp: Date.now() + ttl }
    if (entry.status >= 200 && entry.status < 300) {
      if (mediaCache.size > 32) {
        const oldest = mediaCache.keys().next().value
        if (oldest) mediaCache.delete(oldest)
      }
      mediaCache.set(target, stored)
    }
    return stored
  }
  return json(404, { error: 'unknown camera feed' })
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
