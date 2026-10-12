import { describe, expect, it } from 'vitest'
import { collapseQuery, countryHint, looksLikeUsAddress, orderPlaces } from '../src/search/address'
import { parseCensus, parsePhoton, type GeoHit } from '../src/search/parse'

function hit(partial: Partial<GeoHit> & Pick<GeoHit, 'lat' | 'lon' | 'source'>): GeoHit {
  return {
    label: partial.label ?? partial.source,
    scale: partial.scale ?? 'street',
    rangeKm: partial.rangeKm ?? 0.45,
    ...partial,
  }
}

describe('v2.3.0 place lookup', () => {
  it('collapses whitespace and leaves the words in place', () => {
    expect(collapseQuery('  12999   Donegal Ln,  Alpharetta, GA  ')).toBe('12999 Donegal Ln, Alpharetta, GA')
    expect(collapseQuery('a')).toBeNull()
    expect(collapseQuery('http://example.com')).toBeNull()
    expect(collapseQuery('bad\u0000query')).toBeNull()
  })

  it('treats a house number plus a US state as a US address', () => {
    expect(looksLikeUsAddress('12999 Donegal Ln, Alpharetta, GA')).toBe(true)
    expect(looksLikeUsAddress('1600 Pennsylvania Ave NW Washington DC')).toBe(true)
    expect(looksLikeUsAddress('350 5th Ave New York NY')).toBe(true)
    expect(looksLikeUsAddress('221B Baker Street London')).toBe(false)
    expect(looksLikeUsAddress('1 Chome-1-2 Oshiage, Sumida City, Tokyo')).toBe(false)
    expect(countryHint('221B Baker Street London')).toBe('gb')
    expect(countryHint('1 Chome-1-2 Oshiage, Sumida City, Tokyo')).toBe('jp')
    expect(countryHint('12999 Donegal Ln, Alpharetta, GA')).toBe('us')
  })

  it('reads Photon coordinates as longitude then latitude', () => {
    const rows = parsePhoton({
      features: [{
        geometry: { coordinates: [-77.0365525, 38.8976387] },
        properties: {
          housenumber: '1600',
          street: 'Pennsylvania Avenue Northwest',
          name: 'White House',
          city: 'Washington',
          state: 'District of Columbia',
          country: 'United States',
        },
      }],
    })
    expect(rows[0]?.lon).toBeCloseTo(-77.0365525)
    expect(rows[0]?.lat).toBeCloseTo(38.8976387)
    expect(rows[0]?.parts?.house).toBe('1600')
    expect(rows[0]?.label).toContain('White House')
  })

  it('reads Census x as longitude and y as latitude', () => {
    const rows = parseCensus({
      result: {
        addressMatches: [{
          matchedAddress: '12999 DONEGAL LN, ALPHARETTA, GA, 30004',
          coordinates: { x: -84.296760776786, y: 34.09912427442 },
          addressComponents: {
            fromAddress: '12999',
            toAddress: '12821',
            streetName: 'DONEGAL',
            suffixType: 'LN',
            city: 'ALPHARETTA',
            state: 'GA',
            zip: '30004',
          },
        }],
      },
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]?.lat).toBeCloseTo(34.09912427442)
    expect(rows[0]?.lon).toBeCloseTo(-84.296760776786)
    expect(rows[0]?.quality).toBe('INTERPOLATED')
    expect(rows[0]?.parts?.house).toBe('12999')
  })

  it('keeps every row and leads with a house match, then Census', () => {
    const elsewhere = hit({ lat: 1, lon: 2, source: 'photon', label: 'Elsewhere', scale: 'city', rangeKm: 12 })
    const census = hit({
      lat: 34.09912427442,
      lon: -84.296760776786,
      source: 'census',
      label: '12999 Donegal Ln, Alpharetta, GA',
      parts: { house: '12999', street: 'Donegal Ln', city: 'Alpharetta', state: 'GA', country: 'United States' },
      quality: 'INTERPOLATED',
    })
    const alpharetta = orderPlaces('12999 Donegal Ln, Alpharetta, GA', [elsewhere, census])
    expect(alpharetta).toHaveLength(2)
    expect(alpharetta[0]?.source).toBe('census')
    expect(alpharetta[0]?.quality).toBe('INTERPOLATED')

    const empire = hit({
      lat: 40.7484421,
      lon: -73.9856589,
      source: 'photon',
      label: '350 5th Avenue, Empire State Building, New York',
      parts: { house: '350', street: '5th Avenue', city: 'New York', state: 'New York', country: 'United States' },
    })
    const fifth = hit({
      lat: 40.7478508,
      lon: -73.9850755,
      source: 'census',
      label: '350 5th Ave, New York, NY',
      parts: { house: '350', street: '5th Ave', city: 'New York', state: 'NY', country: 'United States' },
    })
    const avenue = orderPlaces('350 5th Ave New York NY', [empire, fifth])
    expect(avenue[0]?.source).toBe('photon')
    expect(avenue[0]?.quality).toBe('EXACT')
    expect(avenue[1]?.quality).toBe('INTERPOLATED')

    const baker = orderPlaces('221B Baker Street London', [hit({
      lat: 51.5237629,
      lon: -0.1584743,
      source: 'photon',
      label: '221B Baker Street, Sherlock Holmes Museum, London',
      parts: { house: '221B', street: 'Baker Street', city: 'London', state: '', country: 'United Kingdom' },
    })])
    expect(baker[0]?.quality).toBe('EXACT')
    expect(baker[0]?.lat).toBeCloseTo(51.5237629)
    expect(baker[0]?.lon).toBeCloseTo(-0.1584743)

    const tokyo = orderPlaces('1 Chome-1-2 Oshiage, Sumida City, Tokyo', [hit({
      lat: 35.7106071,
      lon: 139.8127661,
      source: 'photon',
      label: '2 1, Sumida',
      parts: { house: '2', street: '1', city: '墨田区', state: '', country: 'Japan' },
    })])
    expect(tokyo[0]?.quality).not.toBe('EXACT')
    expect(tokyo).toHaveLength(1)
  })
})
