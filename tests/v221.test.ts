import { describe, expect, it } from 'vitest'
import { censusLine, ghostSuffix, isFullUsAddress, matchQuality, normStreet, normalizeState, parseAddress, rankPlaces, streetMatches } from '../src/search/address'
import { parseCensus, parsePhoton, type GeoHit } from '../src/search/parse'

describe('address fields', () => {
  it('normalises state names and abbreviations', () => {
    expect(normalizeState('California')).toEqual({ abbr: 'CA', name: 'California' })
    expect(normalizeState('ca')).toEqual({ abbr: 'CA', name: 'California' })
    expect(normalizeState('D.C.')).toEqual({ abbr: 'DC', name: 'District of Columbia' })
    expect(normalizeState('New York')).toEqual({ abbr: 'NY', name: 'New York' })
    expect(normalizeState('west virginia')).toEqual({ abbr: 'WV', name: 'West Virginia' })
    expect(normalizeState('st')).toBeNull()
    expect(normalizeState('street')).toBeNull()
  })

  it('reads house, street, city, state, ZIP, and unit', () => {
    const commas = parseAddress('1234 Elm Road, Sin City, California')
    expect(commas).toMatchObject({ house: '1234', street: 'Elm Road', city: 'Sin City', stateAbbr: 'CA', stateName: 'California', country: 'US' })
    expect(isFullUsAddress(commas)).toBe(true)
    expect(parseAddress('1234 Elm Road Sin City California')).toMatchObject({ house: '1234', street: 'Elm Road', city: 'Sin City', stateAbbr: 'CA' })
    expect(parseAddress('1234 Elm Road, Sin City, CA 90210')).toMatchObject({ stateAbbr: 'CA', postcode: '90210', city: 'Sin City' })
    expect(parseAddress('1234 Elm Road, Sin City, California 90210-1234')?.postcode).toBe('90210-1234')
    expect(parseAddress('1234 Elm Road Apt 4, Sin City, California')).toMatchObject({ unit: '4', street: 'Elm Road', city: 'Sin City', stateAbbr: 'CA' })
    expect(parseAddress('1234 Elm Road, Unit 12B, Sin City, CA')).toMatchObject({ unit: '12B', city: 'Sin City', stateAbbr: 'CA' })
    expect(parseAddress('1234 Elm Rd #2B, Sin City, California')?.unit).toBe('2B')
    expect(parseAddress('1600 Pennsylvania Avenue NW, Washington, DC')).toMatchObject({
      house: '1600', street: 'Pennsylvania Avenue NW', city: 'Washington', stateAbbr: 'DC',
    })
    expect(parseAddress('1600 Pennsylvania Avenue NW Washington DC')).toMatchObject({
      street: 'Pennsylvania Avenue NW', city: 'Washington', stateAbbr: 'DC',
    })
    const partial = parseAddress('1600 penn')
    expect(partial).toMatchObject({ house: '1600', street: 'penn', partial: true })
    expect(isFullUsAddress(partial)).toBe(false)
    expect(parseAddress('123 main st spr')).toMatchObject({ house: '123', street: 'main st', city: 'spr', stateAbbr: '' })
    expect(parseAddress('123 Main St NE')?.street.toLowerCase()).toBe('main st ne')
    expect(parseAddress('DL123')).toBeNull()
    expect(parseAddress('AA 100')).toBeNull()
    expect(parseAddress('40.7580, -73.9855')).toBeNull()
    const line = censusLine(parseAddress('350 Fifth Avenue, New York, NY')!)
    expect(line).toBe('350 Fifth Avenue, New York, NY')
  })

  it('treats fifth and 5th as the same street', () => {
    expect(normStreet('Fifth Avenue')).toBe(normStreet('5th Ave'))
    expect(streetMatches('Fifth Avenue', '5th Avenue')).toBe(true)
    expect(streetMatches('penn', 'Pennsylvania Avenue Northwest')).toBe(true)
    expect(streetMatches('Elm Road', 'Elm Rd')).toBe(true)
    expect(streetMatches('Main Street', 'Broadway')).toBe(false)
  })
})

describe('match ranking and census', () => {
  it('parses a census address-range match as interpolated', () => {
    const hits = parseCensus({
      result: {
        addressMatches: [{
          matchedAddress: '350 5TH AVE, NEW YORK, NY, 10118',
          coordinates: { x: -73.985075, y: 40.74785 },
          addressComponents: {
            fromAddress: '350', toAddress: '356', streetName: '5TH', suffixType: 'AVE',
            city: 'NEW YORK', state: 'NY', zip: '10118',
          },
        }],
      },
    })
    expect(hits).toHaveLength(1)
    expect(hits[0]).toMatchObject({
      lat: 40.74785,
      lon: -73.985075,
      source: 'census',
      quality: 'INTERPOLATED',
      scale: 'street',
      parts: { house: '350', city: 'New York', state: 'NY', country: 'United States' },
    })
    expect(hits[0]?.label).toContain('350')
    expect(hits[0]?.label).toContain('New York')
    expect(parseCensus({ result: { addressMatches: [] } })).toEqual([])
    expect(parseCensus({})).toEqual([])
  })

  it('ranks a house match above the city and a wrong house number', () => {
    const city: GeoHit = { lat: 40.7, lon: -74, label: 'New York, United States', scale: 'city', rangeKm: 12, source: 'photon', parts: { house: '', street: '', city: 'New York', state: 'NY', country: 'United States' } }
    const wrong: GeoHit = { lat: 40.76, lon: -73.97, label: '650 Fifth Avenue, New York, NY, United States', scale: 'street', rangeKm: 0.45, source: 'photon', parts: { house: '650', street: 'Fifth Avenue', city: 'New York', state: 'NY', country: 'United States' } }
    const block: GeoHit = { lat: 40.747, lon: -73.985, label: '350 5th Ave, New York, NY, United States', scale: 'street', rangeKm: 0.45, source: 'census', quality: 'INTERPOLATED', parts: { house: '350', street: '5th Ave', city: 'New York', state: 'NY', country: 'United States' } }
    const ranked = rankPlaces('350 Fifth Avenue, New York, NY', [city, wrong, block])
    expect(ranked[0]?.source).toBe('census')
    expect(ranked[0]?.quality).toBe('INTERPOLATED')
    expect(ranked[1]?.quality).toBe('STREET ONLY')
    expect(ranked[2]?.quality).toBe('CITY ONLY')
    expect(matchQuality(parseAddress('350 Fifth Avenue, New York, NY'), wrong)).toBe('STREET ONLY')
    const otherTown: GeoHit = { lat: 41.1, lon: -72.36, label: '350 Fifth Avenue, Greenport, New York, United States', scale: 'street', rangeKm: 0.45, source: 'nominatim', parts: { house: '350', street: 'Fifth Avenue', city: 'Greenport', state: 'New York', country: 'United States' } }
    expect(matchQuality(parseAddress('350 Fifth Avenue, New York, NY'), otherTown)).toBe('STREET ONLY')
    expect(rankPlaces('350 Fifth Avenue, New York, NY', [otherTown, block])[0]?.quality).toBe('INTERPOLATED')
    const house = parsePhoton({
      features: [{
        geometry: { coordinates: [-77.0365, 38.8977] },
        properties: { housenumber: '1600', street: 'Pennsylvania Avenue Northwest', name: 'White House', city: 'Washington', state: 'DC', country: 'United States', type: 'house' },
      }],
    })[0]!
    expect(rankPlaces('1600 Pennsylvania Avenue NW, Washington, DC', [city, house])[0]?.quality).toBe('EXACT')
    const partial = rankPlaces('1600 penn', [
      { lat: 40, lon: -80, label: 'Pennsylvania, United States', scale: 'region', rangeKm: 280, source: 'photon', parts: { house: '', street: '', city: '', state: 'Pennsylvania', country: 'United States' } },
      house,
    ])
    expect(partial[0]?.parts?.house).toBe('1600')
    expect(partial[0]?.quality).toBe('EXACT')
  })

  it('continues the top guess after the typed prefix', () => {
    expect(ghostSuffix('1600 penn', '1600, Pennsylvania Avenue NW, Washington, DC, United States')).toBe('sylvania Avenue NW, Washington, DC, United States')
    expect(ghostSuffix('123 main', '123 Main Street, Springfield, IL, United States').toLowerCase()).toContain('street')
    expect(ghostSuffix('paris', 'London, United Kingdom')).toBe('')
    expect(ghostSuffix('', '1600 Pennsylvania')).toBe('')
  })
})
