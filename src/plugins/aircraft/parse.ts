export interface AirFix {
  icao: string
  callsign: string
  country: string
  lat: number
  lon: number
  altM: number
  track: number
  speedKt: number
  onGround: boolean
  typeCode: string
  registration: string
  squawk: string
  vertFpm: number
  seenMs: number
  desc: string
}

function num(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value)
  return null
}

export function capAir(list: AirFix[], max: number): AirFix[] {
  if (list.length <= max) return list
  const airborne = list.filter((item) => !item.onGround)
  const pool = airborne.length >= max * 0.5 ? airborne : list
  if (pool.length <= max) return pool.slice(0, max)
  const step = pool.length / max
  const out: AirFix[] = []
  for (let i = 0; i < max; i++) {
    const item = pool[Math.floor(i * step)]
    if (item) out.push(item)
  }
  return out
}

export function parseOpenSky(payload: unknown): AirFix[] {
  if (!payload || typeof payload !== 'object') return []
  const states = (payload as { states?: unknown }).states
  if (!Array.isArray(states)) return []
  const out: AirFix[] = []
  for (const row of states) {
    if (!Array.isArray(row) || row.length < 11) continue
    const lon = num(row[5])
    const lat = num(row[6])
    if (lat == null || lon == null) continue
    const alt = num(row[13]) ?? num(row[7]) ?? 0
    const velocity = num(row[9]) ?? 0
    const seen = num(row[4]) ?? 0
    out.push({
      icao: String(row[0] ?? '').trim().toLowerCase(),
      callsign: String(row[1] ?? '').trim(),
      country: String(row[2] ?? '').trim(),
      lat,
      lon,
      altM: alt,
      track: num(row[10]) ?? 0,
      speedKt: velocity * 1.94384,
      onGround: Boolean(row[8]),
      typeCode: '',
      registration: '',
      squawk: String(row[14] ?? '').trim(),
      vertFpm: (num(row[11]) ?? 0) * 196.85,
      seenMs: seen > 1e12 ? seen : seen * 1000,
      desc: '',
    })
  }
  return capAir(out, 8000)
}

export function parseAdsb(payload: unknown): AirFix[] {
  if (!payload || typeof payload !== 'object') return []
  const list = (payload as { ac?: unknown }).ac
  if (!Array.isArray(list)) return []
  const out: AirFix[] = []
  for (const row of list) {
    if (!row || typeof row !== 'object') continue
    const rec = row as Record<string, unknown>
    const lat = num(rec.lat)
    const lon = num(rec.lon)
    if (lat == null || lon == null) continue
    const altRaw = rec.alt_baro ?? rec.alt_geom
    const onGround = altRaw === 'ground'
    const feet = onGround ? 0 : (num(altRaw) ?? 0)
    const seen = num(rec.seen) ?? 0
    out.push({
      icao: String(rec.hex ?? '').trim().toLowerCase(),
      callsign: String(rec.flight ?? '').trim(),
      country: '',
      lat,
      lon,
      altM: feet * 0.3048,
      track: num(rec.track) ?? 0,
      speedKt: num(rec.gs) ?? 0,
      onGround,
      typeCode: String(rec.t ?? '').trim().toUpperCase(),
      registration: String(rec.r ?? '').trim(),
      squawk: String(rec.squawk ?? '').trim(),
      vertFpm: num(rec.baro_rate) ?? 0,
      seenMs: seen > 0 ? Date.now() - seen * 1000 : Date.now(),
      desc: String(rec.desc ?? '').trim(),
    })
  }
  return out
}

export function displayAirAltKm(altM: number, onGround: boolean): number {
  if (onGround) return 0
  return 8 + Math.max(0, altM) / 1000 * 6
}
