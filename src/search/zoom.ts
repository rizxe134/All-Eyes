/** Camera range for a place. Street is a block, city is a metro, country is a continent view. */

export type PlaceScale = 'street' | 'landmark' | 'airport' | 'city' | 'region' | 'country'

export const RANGE_KM: Record<PlaceScale, number> = {
  street: 0.45,
  landmark: 2,
  airport: 8,
  city: 12,
  region: 280,
  country: 1800,
}

const STREET = new Set(['house', 'building', 'address', 'residential', 'street', 'road', 'pedestrian', 'footway', 'neighbourhood', 'neighborhood', 'quarter', 'housenumber', 'house_number'])
const CITY = new Set(['city', 'town', 'village', 'municipality', 'hamlet', 'locality', 'suburb', 'borough', 'ppl', 'pplc', 'ppla', 'ppla2', 'ppla3', 'ppla4'])
const REGION = new Set(['state', 'region', 'county', 'province', 'state_district', 'administrative', 'adm1', 'adm2'])
const COUNTRY = new Set(['country', 'pcli'])
const AIRPORT = new Set(['aerodrome', 'airport', 'airfield', 'airp'])
const LANDMARK = new Set(['attraction', 'monument', 'memorial', 'peak', 'museum', 'artwork', 'castle', 'ruins', 'tourism', 'historic', 'poi'])
const POST = new Set(['postcode', 'postal_code', 'post'])

export function rangeForScale(scale: PlaceScale): number {
  return RANGE_KM[scale]
}

/** More decimal places, or DMS seconds, sit closer to the ground. */
export function rangeForCoordinate(places: number, dms: boolean): number {
  if (dms && places >= 5) return RANGE_KM.street
  if (dms && places >= 3) return RANGE_KM.landmark
  if (places >= 4) return RANGE_KM.street
  if (places >= 3) return RANGE_KM.landmark
  if (places >= 2) return RANGE_KM.airport
  if (places >= 1) return RANGE_KM.city
  return 80
}

export function scaleFromTags(tags: { kind?: string | null; klass?: string | null; osmKey?: string | null; osmValue?: string | null }): PlaceScale {
  const values = [tags.kind, tags.osmValue, tags.osmKey, tags.klass].map((value) => (value || '').toLowerCase())
  const has = (set: Set<string>) => values.some((value) => set.has(value))
  if (has(POST)) return 'landmark'
  if (has(STREET) || tags.klass === 'highway' || tags.osmKey === 'highway' || tags.klass === 'building') return 'street'
  if (has(AIRPORT) || tags.klass === 'aeroway' || tags.osmKey === 'aeroway') return 'airport'
  if (has(COUNTRY)) return 'country'
  if (has(REGION)) return 'region'
  if (has(LANDMARK) || tags.klass === 'tourism' || tags.klass === 'historic' || tags.osmKey === 'tourism') return 'landmark'
  if (has(CITY) || tags.klass === 'place' || tags.osmKey === 'place') return 'city'
  return 'city'
}
