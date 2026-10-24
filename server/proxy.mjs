import { existsSync, readFileSync } from 'node:fs'
import { routeCam } from './cams.mjs'
import { routeDesk } from './desk.mjs'

const UA = 'AllEyes/4.0.0 (local educational globe; https://github.com/rizxe134/All-Eyes)'

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
  'active',
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

  if (path === '/api/adsb/callsign' || path === '/api/adsbfi/callsign' || path === '/api/airplanes/callsign') {
    const cs = (url.searchParams.get('cs') || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
    if (!/^[A-Z0-9]{3,8}$/.test(cs)) return jsonError(400, 'bad callsign')
    const host = path === '/api/adsb/callsign'
      ? 'https://api.adsb.lol'
      : path === '/api/airplanes/callsign'
        ? 'https://api.airplanes.live'
        : 'https://opendata.adsb.fi/api'
    return upstream(`${host}/v2/callsign/${encodeURIComponent(cs)}`, {
      ttl: 15000,
      timeout: 10000,
      key: `cs:${host}:${cs}`,
    })
  }

  if (path === '/api/adsb/hex') {
    const hex = (url.searchParams.get('hex') || '').toLowerCase()
    if (!/^[0-9a-f]{6}$/.test(hex)) return jsonError(400, 'bad hex')
    return upstream(`https://api.adsb.lol/v2/hex/${hex}`, { ttl: 15000, timeout: 10000, key: `hex:${hex}` })
  }

  if (path === '/api/adsb/reg') {
    const reg = (url.searchParams.get('reg') || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
    if (!/^[A-Z0-9]{3,8}$/.test(reg)) return jsonError(400, 'bad registration')
    return upstream(`https://api.adsb.lol/v2/reg/${encodeURIComponent(reg)}`, { ttl: 15000, timeout: 10000, key: `reg:${reg}` })
  }

  if (path === '/api/celestrak') {
    const group = url.searchParams.get('group') || ''
    if (!CELESTRAK_GROUPS.has(group)) return jsonError(400, 'unknown satellite group')
    const target = `https://celestrak.org/NORAD/elements/gp.php?GROUP=${encodeURIComponent(group)}&FORMAT=tle`
    return upstream(target, {
      ttl: 6 * 60 * 60 * 1000,
      headers: { accept: 'text/plain' },
      timeout: group === 'active' ? 60000 : 20000,
    })
  }

  if (path === '/api/satcat') {
    const cat = Number(url.searchParams.get('cat'))
    if (!Number.isInteger(cat) || cat < 1 || cat > 999999) return jsonError(400, 'bad norad')
    return upstream(`https://celestrak.org/satcat/records.php?CATNR=${cat}&FORMAT=json`, {
      ttl: 24 * 60 * 60 * 1000,
      timeout: 12000,
      key: `satcat:${cat}`,
    })
  }

  if (path === '/api/nasa') {
    const q = (url.searchParams.get('q') || '').trim().slice(0, 80)
    if (q.length < 3) return jsonError(400, 'bad query')
    return upstream(`https://images-api.nasa.gov/search?q=${encodeURIComponent(q)}&media_type=image`, {
      ttl: 24 * 60 * 60 * 1000,
      timeout: 12000,
      key: `nasa:${q.toLowerCase()}`,
    })
  }

  if (path === '/api/commons') {
    const q = (url.searchParams.get('q') || '').trim().slice(0, 80)
    if (q.length < 3) return jsonError(400, 'bad query')
    const target = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=3&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=640&gsrsearch=' + encodeURIComponent(q)
    return upstream(target, {
      ttl: 24 * 60 * 60 * 1000,
      timeout: 12000,
      key: `commons:${q.toLowerCase()}`,
      headers: { accept: 'application/json', 'user-agent': UA },
    })
  }

  if (path === '/api/ais/box') {
    const south = Number(url.searchParams.get('south'))
    const west = Number(url.searchParams.get('west'))
    const north = Number(url.searchParams.get('north'))
    const east = Number(url.searchParams.get('east'))
    if (![south, west, north, east].every((n) => Number.isFinite(n))) return jsonError(400, 'bad box')
    let width = east - west
    if (width < 0) width += 360
    const area = Math.abs(north - south) * width
    if (area <= 0 || area > 100) return jsonError(400, 'box too large')
    const bbox = `${south},${west},${north},${east}`
    return upstream(`https://ais.openwaters.io/v1/vessels?bbox=${encodeURIComponent(bbox)}&max_age=12h&max_age_moving=45m&kind=vessel`, {
      ttl: 20000,
      timeout: 15000,
      key: `aisbox:${bbox}`,
      headers: { accept: 'application/json', 'user-agent': `${UA} (+https://github.com/rizxe134/All-Eyes)` },
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
        'user-agent': 'AllEyes/1.4.2 (+https://github.com/rizxe134/All-Eyes)',
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
    const latRaw = url.searchParams.get('lat')
    const lonRaw = url.searchParams.get('lon')
    const lat = latRaw == null || latRaw === '' ? NaN : Number(latRaw)
    const lon = lonRaw == null || lonRaw === '' ? NaN : Number(lonRaw)
    const q = (url.searchParams.get('q') || '').trim()
    const street = (url.searchParams.get('street') || '').trim()
    const city = (url.searchParams.get('city') || '').trim()
    const state = (url.searchParams.get('state') || '').trim()
    const postalcode = (url.searchParams.get('postalcode') || '').trim()
    const country = (url.searchParams.get('country') || '').trim()
    const structured = [street, city, state, postalcode, country].some(Boolean)
    // Number(null) is 0, which would reverse-geocode the search as Null Island.
    const reverse = Number.isFinite(lat) && Number.isFinite(lon)
    const cc = (url.searchParams.get('countrycodes') || '').trim().toLowerCase()
    const countrycodes = /^[a-z]{2}$/.test(cc) ? `&countrycodes=${cc}` : ''
    if (!reverse && !structured && (!q || q.length > 200)) return jsonError(400, 'bad query')
    if ([q, street, city, state, country].some((part) => part.length > 200)) return jsonError(400, 'bad query')
    const wait = 1100 - (Date.now() - lastNominatim)
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
    lastNominatim = Date.now()
    const viewbox = url.searchParams.get('viewbox') || ''
    const boxed = /^-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(viewbox)
      ? `&viewbox=${viewbox}&bounded=1`
      : ''
    const limit = Math.min(5, Math.max(1, Number(url.searchParams.get('limit')) || 1))
    const fields = [
      street ? `street=${encodeURIComponent(street)}` : '',
      city ? `city=${encodeURIComponent(city)}` : '',
      state ? `state=${encodeURIComponent(state)}` : '',
      postalcode ? `postalcode=${encodeURIComponent(postalcode)}` : '',
      country ? `country=${encodeURIComponent(country)}` : '',
    ].filter(Boolean).join('&')
    const target = reverse
      ? `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&extratags=1&zoom=12&lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`
      : structured
        ? `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&extratags=1&limit=${limit}&${fields}`
        : `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&extratags=1&limit=${limit}&q=${encodeURIComponent(q)}${countrycodes}${boxed}`
    return upstream(target, {
      ttl: 6 * 60 * 60 * 1000,
      key: reverse ? `geo:${lat.toFixed(2)},${lon.toFixed(2)}` : `geo:${limit}:${cc}:${structured ? fields : q.toLowerCase()}:${viewbox}`,
      timeout: 12000,
    })
  }

  if (path === '/api/photon') {
    const q = (url.searchParams.get('q') || '').trim()
    if (!q || q.length > 200) return jsonError(400, 'bad query')
    const limit = Math.min(8, Math.max(1, Number(url.searchParams.get('limit')) || 8))
    const lat = Number(url.searchParams.get('lat'))
    const lon = Number(url.searchParams.get('lon'))
    const bias = Number.isFinite(lat) && Math.abs(lat) <= 90 && Number.isFinite(lon) && Math.abs(lon) <= 180
    const where = bias ? `&lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}` : ''
    return upstream(`https://photon.komoot.io/api/?limit=${limit}&q=${encodeURIComponent(q)}${where}`, {
      ttl: 60 * 60 * 1000,
      timeout: 8000,
      key: `photon:${limit}:${q.toLowerCase()}:${bias ? `${lat.toFixed(2)},${lon.toFixed(2)}` : ''}`,
      headers: { accept: 'application/json', 'user-agent': UA },
    })
  }

  if (path === '/api/geocode/census') {
    const q = (url.searchParams.get('q') || '').trim()
    if (!q || q.length > 200 || !/\d/.test(q)) return jsonError(400, 'bad query')
    const target = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encodeURIComponent(q)}&benchmark=Public_AR_Current&format=json`
    return upstream(target, {
      ttl: 24 * 60 * 60 * 1000,
      timeout: 12000,
      key: `census:${q.toLowerCase()}`,
      headers: { accept: 'application/json', 'user-agent': UA },
    })
  }

  if (path === '/api/geocode/meteo') {
    const q = (url.searchParams.get('q') || '').trim()
    if (!q || q.length > 80) return jsonError(400, 'bad query')
    return upstream(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=5`, {
      ttl: 60 * 60 * 1000,
      timeout: 8000,
      key: `mgeo:${q.toLowerCase()}`,
    })
  }

  if (path === '/api/geocode/maptiler' || path === '/api/geocode/mapbox') {
    const q = (url.searchParams.get('q') || '').trim()
    if (!q || q.length > 80) return jsonError(400, 'bad query')
    if (path === '/api/geocode/maptiler') {
      const key = header(req, 'x-maptiler-key') || ''
      if (!/^[A-Za-z0-9._-]{8,160}$/.test(key)) return jsonError(404, 'no maptiler key')
      return upstream(`https://api.maptiler.com/geocoding/${encodeURIComponent(q)}.json?key=${encodeURIComponent(key)}&limit=5`, {
        ttl: 60 * 60 * 1000,
        timeout: 8000,
        key: `mtgeo:${q.toLowerCase()}`,
      })
    }
    const key = header(req, 'x-mapbox-key') || ''
    if (!/^[A-Za-z0-9._-]{8,200}$/.test(key)) return jsonError(404, 'no mapbox key')
    return upstream(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?access_token=${encodeURIComponent(key)}&limit=5`, {
      ttl: 60 * 60 * 1000,
      timeout: 8000,
      key: `mbgeo:${q.toLowerCase()}`,
    })
  }

  if (path === '/api/overpass') {
    const data = url.searchParams.get('data') || ''
    if (data.length < 12 || data.length > 4000 || !data.startsWith('[out:json]')) return jsonError(400, 'bad query')
    return upstream('https://overpass-api.de/api/interpreter?data=' + encodeURIComponent(data), {
      ttl: 8 * 60 * 1000,
      timeout: 25000,
      key: `ov:${data}`,
      headers: { accept: 'application/json' },
    })
  }

  if (path === '/api/meteo') {
    const lat = Number(url.searchParams.get('lat'))
    const lon = Number(url.searchParams.get('lon'))
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return jsonError(400, 'bad point')
    const target = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&current=temperature_2m,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=4`
    return upstream(target, { ttl: 10 * 60 * 1000, key: `wx:${lat.toFixed(2)},${lon.toFixed(2)}` })
  }

  if (path === '/api/air') {
    const lat = Number(url.searchParams.get('lat'))
    const lon = Number(url.searchParams.get('lon'))
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return jsonError(400, 'bad point')
    const target = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&current=us_aqi,pm2_5`
    return upstream(target, { ttl: 10 * 60 * 1000, key: `aq:${lat.toFixed(2)},${lon.toFixed(2)}` })
  }

  if (path === '/api/transit/mbta') {
    return upstream('https://api-v3.mbta.com/vehicles?page[limit]=200', {
      ttl: 15000,
      headers: { accept: 'application/vnd.api+json' },
    })
  }

  if (path === '/api/transit/fi') {
    return upstream('https://rata.digitraffic.fi/api/v1/train-locations/latest/', {
      ttl: 15000,
      headers: { accept: 'application/json' },
    })
  }

  if (path === '/api/traffic/tomtom') {
    const key = header(req, 'x-tomtom-key') || process.env.TOMTOM_KEY || ''
    if (!/^[A-Za-z0-9._-]{8,160}$/.test(key)) return jsonError(404, 'no tomtom key')
    const lat = Number(url.searchParams.get('lat'))
    const lon = Number(url.searchParams.get('lon'))
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return jsonError(400, 'bad point')
    const target = `https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json?point=${lat.toFixed(4)},${lon.toFixed(4)}&unit=KMPH&key=${encodeURIComponent(key)}`
    return upstream(target, { ttl: 60000, key: `tt:${lat.toFixed(2)},${lon.toFixed(2)}:${key.slice(0, 4)}` })
  }

  if (path === '/api/traffic/here') {
    const key = header(req, 'x-here-key') || process.env.HERE_API_KEY || ''
    if (!/^[A-Za-z0-9._-]{8,160}$/.test(key)) return jsonError(404, 'no here key')
    const lat = Number(url.searchParams.get('lat'))
    const lon = Number(url.searchParams.get('lon'))
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return jsonError(400, 'bad point')
    const target = `https://data.traffic.hereapi.com/v7/flow?in=${encodeURIComponent(`circle:${lat.toFixed(4)},${lon.toFixed(4)};r=800`)}&locationReferencing=shape&apiKey=${encodeURIComponent(key)}`
    return upstream(target, { ttl: 60000, key: `here:${lat.toFixed(2)},${lon.toFixed(2)}:${key.slice(0, 4)}` })
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

  if (path.startsWith('/api/cams/')) return routeCam(req, url)
  if (path.startsWith('/api/desk/')) return routeDesk(req, url)

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
    res.setHeader('access-control-allow-headers', 'x-opensky-client-id, x-opensky-client-secret, x-firms-map-key, x-tomtom-key, x-here-key, x-windy-key, x-wsdot-key, x-ohgo-key, x-newsapi-key, x-gnews-key, x-finnhub-key, x-twelve-key, x-alpha-key, x-polygon-key, x-fmp-key')
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
