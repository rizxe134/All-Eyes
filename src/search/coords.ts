/** Decimal and DMS coordinate text. A flight number is not a coordinate. */

export interface CoordFix {
  lat: number
  lon: number
  /** Precision of the less exact component. DMS seconds count as street-level. */
  places: number
  dms: boolean
}

function valid(lat: number, lon: number, places: number, dms: boolean): CoordFix | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null
  return { lat, lon, places, dms }
}

function fracPlaces(text: string): number {
  const frac = text.split('.')[1]
  return frac ? frac.length : 0
}

function parseDecimal(text: string): CoordFix | null {
  const labeled = text.match(/^([NS])\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*([EW])\s*(-?\d+(?:\.\d+)?)$/i)
  if (labeled) {
    const lat = Number(labeled[2]) * (labeled[1]!.toUpperCase() === 'S' ? -1 : 1)
    const lon = Number(labeled[4]) * (labeled[3]!.toUpperCase() === 'W' ? -1 : 1)
    return valid(lat, lon, Math.min(fracPlaces(labeled[2]!), fracPlaces(labeled[4]!)), false)
  }
  const suffix = text.match(/^(-?\d+(?:\.\d+)?)\s*([NS])\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*([EW])$/i)
  if (suffix) {
    const lat = Number(suffix[1]) * (suffix[2]!.toUpperCase() === 'S' ? -1 : 1)
    const lon = Number(suffix[3]) * (suffix[4]!.toUpperCase() === 'W' ? -1 : 1)
    return valid(lat, lon, Math.min(fracPlaces(suffix[1]!), fracPlaces(suffix[3]!)), false)
  }
  const pair = text.match(/^(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)$/)
  if (!pair) return null
  const lat = Number(pair[1])
  const lon = Number(pair[2])
  if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && (Math.abs(lat) > 90 || text.includes(',') || Math.abs(lon) > 90)) {
    return valid(lat, lon, Math.min(fracPlaces(pair[1]!), fracPlaces(pair[2]!)), false)
  }
  if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && text.includes(',')) {
    return valid(lat, lon, Math.min(fracPlaces(pair[1]!), fracPlaces(pair[2]!)), false)
  }
  if (!text.includes(',') && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && (pair[1]!.includes('.') || pair[2]!.includes('.'))) {
    return valid(lat, lon, Math.min(fracPlaces(pair[1]!), fracPlaces(pair[2]!)), false)
  }
  return null
}

function component(match: RegExpMatchArray): { value: number; hemi: string; places: number } | null {
  const deg = Number(match[1])
  const min = match[2] ? Number(match[2]) : null
  const sec = match[3] ? Number(match[3]) : null
  const hemi = (match[4] ?? '').toUpperCase()
  if (!Number.isFinite(deg) || !hemi) return null
  if (min != null && (!Number.isFinite(min) || min < 0 || min >= 60)) return null
  if (sec != null && (!Number.isFinite(sec) || sec < 0 || sec >= 60)) return null
  let value = Math.abs(deg) + (min ?? 0) / 60 + (sec ?? 0) / 3600
  if (hemi === 'S' || hemi === 'W') value = -value
  const places = sec != null ? 5 : min != null ? 3 : fracPlaces(match[1] ?? '0')
  return { value, hemi, places }
}

function parseDms(text: string): CoordFix | null {
  if (!/[°'′"″]/.test(text) && !/\d\s+\d/.test(text)) return null
  const re = /([+-]?\d+(?:\.\d+)?)\s*(?:°|deg)?\s*(?:(\d+(?:\.\d+)?)\s*(?:['′]|min)?\s*(?:(\d+(?:\.\d+)?)\s*(?:["″]|sec)?)?)?\s*([NSEW])/gi
  const hits = [...text.matchAll(re)]
  if (hits.length < 2) return null
  const a = component(hits[0]!)
  const b = component(hits[1]!)
  if (!a || !b) return null
  const lat = a.hemi === 'N' || a.hemi === 'S' ? a : b.hemi === 'N' || b.hemi === 'S' ? b : null
  const lon = a.hemi === 'E' || a.hemi === 'W' ? a : b.hemi === 'E' || b.hemi === 'W' ? b : null
  if (!lat || !lon || lat === lon) return null
  return valid(lat.value, lon.value, Math.min(lat.places, lon.places), true)
}

/** Null when the text is not a coordinate pair. */
export function parseCoordinates(input: string): CoordFix | null {
  const text = input.trim().replace(/\s+/g, ' ')
  if (!text) return null
  if (/[A-Z]{2,}\s*\d/i.test(text) && !/[°'′"″,]/.test(text)) return null
  const dms = parseDms(text)
  if (dms) return dms
  return parseDecimal(text)
}
