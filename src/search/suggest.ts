/** Group a query into places, flights, ships, and satellites. Pure. */

import { callsignMatch, parseFlightQuery, type FlightQuery } from '../plugins/aircraft/callsign'
import type { Contact } from '../core/types'
import type { GeoHit } from './parse'

export type FindGroup = 'Places' | 'Flights' | 'Ships' | 'Satellites' | 'Recent'

export interface FindHit {
  group: FindGroup
  key: string
  title: string
  detail: string
  sprite: string
  layerId: string
  lat?: number
  lon?: number
  rangeKm?: number
  contactId?: string
  query?: string
  seek?: boolean
  quality?: string
}

const SPRITE: Record<string, string> = {
  street: 'drop',
  landmark: 'drop',
  airport: 'air-a320',
  city: 'diamond',
  region: 'box',
  country: 'ring',
}

function placeHit(row: GeoHit, index: number): FindHit {
  return {
    group: 'Places',
    key: `place:${index}:${row.lat.toFixed(3)}`,
    title: row.label,
    detail: row.quality ?? row.scale.toUpperCase(),
    quality: row.quality,
    sprite: SPRITE[row.scale] ?? 'drop',
    layerId: 'poi',
    lat: row.lat,
    lon: row.lon,
    rangeKm: row.rangeKm,
  }
}

function airHit(contact: Contact, query: FlightQuery): FindHit {
  return {
    group: 'Flights',
    key: contact.id,
    title: contact.callsign || contact.label,
    detail: contact.label,
    sprite: contact.shape === 'air-gnd' ? 'air-gnd' : 'air-a320',
    layerId: contact.shape === 'air-gnd' ? 'airground' : 'aircraft',
    lat: contact.lat,
    lon: contact.lon,
    contactId: contact.id,
    query: query.raw,
  }
}

export function matchContacts(query: string, contacts: readonly Contact[]): FindHit[] {
  const text = query.trim()
  if (text.length < 2) return []
  const flight = parseFlightQuery(text)
  const upper = text.toUpperCase()
  const flights: FindHit[] = []
  const ships: FindHit[] = []
  const sats: FindHit[] = []
  for (const contact of contacts) {
    if (contact.kind === 'air') {
      const reg = contact.card?.find((row) => row.k === 'REG')?.v ?? ''
      const hex = contact.id.startsWith('air:') ? contact.id.slice(4) : ''
      if (callsignMatch(contact.callsign ?? contact.label, reg, hex, flight)) flights.push(airHit(contact, flight))
      continue
    }
    if (contact.kind === 'ship') {
      const mmsi = contact.id.startsWith('ship:') ? contact.id.slice(5) : ''
      const digits = /^\d{7,9}$/.test(text)
      if (digits && mmsi === text) {
        ships.push(shipHit(contact))
      } else if (!digits && upper.length >= 3 && contact.label.toUpperCase().includes(upper)) {
        ships.push(shipHit(contact))
      }
      continue
    }
    if (contact.kind === 'sat') {
      const norad = contact.id.startsWith('sat:') ? contact.id.slice(4) : ''
      if (/^\d{1,6}$/.test(text) && norad === text) sats.push(satHit(contact))
      else if (!/^\d+$/.test(text) && upper.length >= 3 && contact.label.toUpperCase().includes(upper)) sats.push(satHit(contact))
    }
  }
  const out = [...flights.slice(0, 5), ...ships.slice(0, 5), ...sats.slice(0, 5)]
  if ((flight.kind === 'iata' || flight.kind === 'icao') && !flights.some((row) => row.title.replace(/\s+/g, '').toUpperCase() === flight.candidates[0])) {
    const cs = flight.candidates[0] || flight.raw
    out.unshift({
      group: 'Flights',
      key: `seek:${cs}`,
      title: cs,
      detail: 'LOOK UP',
      sprite: 'air-a320',
      layerId: 'aircraft',
      query: text,
      seek: true,
    })
  }
  return out
}

function shipHit(contact: Contact): FindHit {
  return {
    group: 'Ships',
    key: contact.id,
    title: contact.label,
    detail: contact.id.replace('ship:', 'MMSI '),
    sprite: 'ship-cargo',
    layerId: 'ships',
    lat: contact.lat,
    lon: contact.lon,
    contactId: contact.id,
  }
}

function satHit(contact: Contact): FindHit {
  return {
    group: 'Satellites',
    key: contact.id,
    title: contact.label,
    detail: contact.id.replace('sat:', 'NORAD '),
    sprite: contact.layerId === 'starlink' ? 'sat-starlink' : 'sat-comms',
    layerId: contact.layerId,
    lat: contact.lat,
    lon: contact.lon,
    contactId: contact.id,
  }
}

export function recentHits(rows: readonly string[]): FindHit[] {
  return rows.slice(0, 8).map((query, index) => ({
    group: 'Recent' as const,
    key: `recent:${index}`,
    title: query,
    detail: 'RECENT',
    sprite: 'drop',
    layerId: 'poi',
    query,
  }))
}

export function suggestHits(query: string, contacts: readonly Contact[], places: readonly GeoHit[], recent: readonly string[]): FindHit[] {
  const text = query.trim()
  if (!text) return recentHits(recent)
  const coord = places.filter((row) => row.source === 'coord')
  const named = places.filter((row) => row.source !== 'coord')
  return [
    ...coord.map(placeHit),
    ...named.map(placeHit),
    ...matchContacts(text, contacts),
  ].slice(0, 14)
}
