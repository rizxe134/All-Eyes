export interface ShipFix {
  mmsi: number
  lat: number
  lon: number
  sog: number
  cog: number
  heading: number
  navStat: number
  time: number
}

function num(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(n) ? n : null
}

const NAV: Record<number, string> = {
  0: 'UNDERWAY',
  1: 'ANCHOR',
  2: 'NOT UNDER COMMAND',
  3: 'RESTRICTED',
  4: 'CONSTRAINED',
  5: 'MOORED',
  8: 'SAILING',
  15: 'UNKNOWN',
}

export interface ShipMeta {
  mmsi: number
  name: string
  callSign: string
  destination: string
  shipType: number
  imo: string
  draught: number | null
  length: number | null
  beam: number | null
  eta: string
  source: string
}

export function parseVessels(payload: unknown): ShipMeta[] {
  if (!Array.isArray(payload)) return []
  const out: ShipMeta[] = []
  for (const row of payload) {
    if (!row || typeof row !== 'object') continue
    const rec = row as Record<string, unknown>
    const mmsi = num(rec.mmsi)
    if (mmsi == null) continue
    out.push({
      mmsi,
      name: String(rec.name ?? '').trim(),
      callSign: String(rec.callSign ?? rec.callsign ?? '').trim(),
      destination: String(rec.destination ?? '').trim(),
      shipType: num(rec.shipType) ?? num(rec.type) ?? 0,
      imo: imoText(rec.imo),
      draught: num(rec.draught),
      length: num(rec.length),
      beam: num(rec.beam),
      eta: String(rec.eta ?? '').trim(),
      source: String(rec.source ?? ''),
    })
  }
  return out
}

function imoText(value: unknown): string {
  const n = num(value)
  if (n == null || n <= 0) return ''
  const text = String(Math.trunc(n))
  return text.length >= 7 ? text : ''
}

export function navLabel(code: number): string {
  return NAV[code] ?? `NAV ${code}`
}

export function parseAis(payload: unknown): ShipFix[] {
  if (!payload || typeof payload !== 'object') return []
  const features = (payload as { features?: unknown }).features
  if (!Array.isArray(features)) return []
  const out: ShipFix[] = []
  for (const feature of features) {
    if (!feature || typeof feature !== 'object') continue
    const row = feature as {
      mmsi?: unknown
      geometry?: { coordinates?: unknown }
      properties?: Record<string, unknown>
    }
    const coords = row.geometry?.coordinates
    if (!Array.isArray(coords)) continue
    const lon = num(coords[0])
    const lat = num(coords[1])
    const mmsi = num(row.mmsi) ?? num(row.properties?.mmsi)
    if (lat == null || lon == null || mmsi == null) continue
    const heading = num(row.properties?.heading) ?? 511
    const cog = num(row.properties?.cog) ?? 0
    out.push({
      mmsi,
      lat,
      lon,
      sog: num(row.properties?.sog) ?? 0,
      cog,
      heading: heading > 360 ? cog : heading,
      navStat: num(row.properties?.navStat) ?? 15,
      time: num(row.properties?.timestampExternal) ?? 0,
    })
  }
  return out
}

export interface OpenWatersPage {
  ships: ShipFix[]
  meta: ShipMeta[]
  truncated: boolean
}

function seenMs(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value > 1e12 ? value : value * 1000
  if (typeof value === 'string') {
    const ms = Date.parse(value)
    if (Number.isFinite(ms)) return ms
  }
  return 0
}

/** Open Waters GeoJSON. Missing AIS fields stay absent; nothing is filled in. */
export function parseOpenWaters(payload: unknown): OpenWatersPage {
  if (!payload || typeof payload !== 'object') return { ships: [], meta: [], truncated: false }
  const body = payload as { features?: unknown; truncated?: unknown }
  const features = Array.isArray(body.features) ? body.features : []
  const ships: ShipFix[] = []
  const meta: ShipMeta[] = []
  for (const feature of features) {
    if (!feature || typeof feature !== 'object') continue
    const row = feature as { geometry?: { coordinates?: unknown }; properties?: Record<string, unknown> }
    const coords = row.geometry?.coordinates
    const props = row.properties ?? {}
    if (!Array.isArray(coords)) continue
    const lon = num(coords[0])
    const lat = num(coords[1])
    const mmsi = num(props.mmsi)
    if (lat == null || lon == null || mmsi == null) continue
    if (props.kind && props.kind !== 'vessel') continue
    const heading = num(props.heading)
    const cog = num(props.cog) ?? 0
    ships.push({
      mmsi,
      lat,
      lon,
      sog: num(props.sog) ?? 0,
      cog,
      heading: heading == null || heading > 360 ? cog : heading,
      navStat: num(props.nav_status) ?? 15,
      time: seenMs(props.seen),
    })
    meta.push({
      mmsi,
      name: String(props.name ?? '').trim(),
      callSign: String(props.callsign ?? '').trim(),
      destination: String(props.destination ?? '').trim(),
      shipType: num(props.type) ?? 0,
      imo: imoText(props.imo),
      draught: num(props.draught),
      length: num(props.length),
      beam: num(props.beam),
      eta: String(props.eta ?? '').trim(),
      source: String(props.source ?? 'openwaters'),
    })
  }
  return { ships, meta, truncated: Boolean(body.truncated) }
}

export interface StreamUpdate {
  fix: ShipFix | null
  meta: ShipMeta | null
}

/** One AISStream JSON frame. Position and static messages both merge by MMSI. */
export function parseAisStream(payload: unknown, now = Date.now()): StreamUpdate {
  if (!payload || typeof payload !== 'object') return { fix: null, meta: null }
  const body = payload as { MessageType?: unknown; MetaData?: Record<string, unknown>; Message?: Record<string, unknown> }
  const meta = body.MetaData ?? {}
  const mmsi = num(meta.MMSI) ?? num(meta.mmsi)
  if (mmsi == null) return { fix: null, meta: null }
  const message = body.Message ?? {}
  const position = (message.PositionReport ?? message.StandardClassBPositionReport) as Record<string, unknown> | undefined
  const stat = message.ShipStaticData as Record<string, unknown> | undefined
  let fix: ShipFix | null = null
  if (position) {
    const lat = num(position.Latitude) ?? num(meta.latitude)
    const lon = num(position.Longitude) ?? num(meta.longitude)
    if (lat != null && lon != null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
      const heading = num(position.TrueHeading)
      const cog = num(position.Cog) ?? 0
      fix = {
        mmsi,
        lat,
        lon,
        sog: num(position.Sog) ?? 0,
        cog,
        heading: heading == null || heading > 360 ? cog : heading,
        navStat: num(position.NavigationalStatus) ?? 15,
        time: now,
      }
    }
  }
  let info: ShipMeta | null = null
  if (stat || typeof meta.ShipName === 'string') {
    const dim = (stat?.Dimension ?? {}) as Record<string, unknown>
    const a = num(dim.A) ?? 0
    const b = num(dim.B) ?? 0
    const c = num(dim.C) ?? 0
    const d = num(dim.D) ?? 0
    const eta = stat?.Eta as Record<string, unknown> | undefined
    const etaText = eta ? `${num(eta.Month) ?? 0}-${num(eta.Day) ?? 0} ${num(eta.Hour) ?? 0}:${String(num(eta.Minute) ?? 0).padStart(2, '0')}` : ''
    info = {
      mmsi,
      name: String(stat?.Name ?? meta.ShipName ?? '').trim(),
      callSign: String(stat?.CallSign ?? '').trim(),
      destination: String(stat?.Destination ?? '').trim(),
      shipType: num(stat?.Type) ?? 0,
      imo: imoText(stat?.ImoNumber),
      draught: num(stat?.MaximumStaticDraught),
      length: a + b > 0 ? a + b : null,
      beam: c + d > 0 ? c + d : null,
      eta: etaText === '0-0 0:00' ? '' : etaText,
      source: 'aisstream',
    }
  }
  return { fix, meta: info }
}
