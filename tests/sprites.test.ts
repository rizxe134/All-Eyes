import { describe, expect, it } from 'vitest'
import { markerParts, modelIds, pitchDeg } from '../src/core/models'
import { knownSprites, spriteRows } from '../src/core/sprites'
import '../src/plugins/aircraft/sprites'
import { airTypeTable, classifyAir } from '../src/plugins/aircraft/types'
import { eventSprite } from '../src/plugins/markers/sprites'
import { satSprite } from '../src/plugins/satellites/sprites'
import { classifyShip, flagFromMmsi } from '../src/plugins/ships/sprites'

describe('aircraft type models', () => {
  it('maps families and keeps Airbus distinct from Boeing', () => {
    expect(classifyAir('A320')).toMatchObject({ sprite: 'air-a320', name: 'Airbus A320' })
    expect(classifyAir('A20N').sprite).toBe('air-a320')
    expect(classifyAir('B738')).toMatchObject({ sprite: 'air-b737', name: 'Boeing 737-800' })
    expect(classifyAir('B38M').sprite).toBe('air-b737')
    expect(classifyAir('A388').sprite).toBe('air-a380')
    expect(classifyAir('B744').sprite).toBe('air-b747')
    expect(classifyAir('A359').sprite).toBe('air-a350')
    expect(classifyAir('A332').sprite).toBe('air-a350')
    expect(classifyAir('B77W').sprite).toBe('air-b777')
    expect(classifyAir('B789').sprite).toBe('air-b777')
    expect(classifyAir('B77L').sprite).toBe('air-cargo')
    expect(classifyAir('E190').sprite).toBe('air-rj')
    expect(classifyAir('AT72').sprite).toBe('air-prop')
    expect(classifyAir('C172').sprite).toBe('air-light')
    expect(classifyAir('H60').sprite).toBe('air-heli')
    expect(classifyAir('F16').sprite).toBe('air-fighter')
    expect(classifyAir('C750').sprite).toBe('air-biz')
    expect(classifyAir('').sprite).toBe('air-unk')
    expect(classifyAir('ZZZZ').name).toBe('ZZZZ')
    expect(classifyAir('A320').sprite).not.toBe(classifyAir('B738').sprite)
  })

  it('registers a pixel sprite beside every family mesh', () => {
    const sprites = new Set(knownSprites())
    const meshes = new Set(modelIds())
    for (const glyph of Object.values(airTypeTable())) {
      expect(sprites.has(glyph.sprite), glyph.sprite).toBe(true)
      expect(meshes.has(glyph.sprite), glyph.sprite).toBe(true)
      expect(spriteRows(glyph.sprite).some((row) => row.includes('#'))).toBe(true)
    }
    for (const id of ['sat-station', 'sat-comms', 'ship-cargo', 'ship-sail', 'ico-storm', 'ico-quake', 'ico-launch']) {
      expect(sprites.has(id), id).toBe(true)
      expect(meshes.has(id), id).toBe(true)
    }
  })

  it('has a mesh for every mapped family', () => {
    const ids = new Set(modelIds())
    for (const glyph of Object.values(airTypeTable())) {
      expect(ids.has(glyph.sprite)).toBe(true)
      for (const part of markerParts(glyph.sprite)) expect(ids.has(part.id)).toBe(true)
    }
    expect(ids.has('air-unk')).toBe(true)
    expect(ids.has('dot')).toBe(true)
    expect(markerParts('air-heli').map((part) => part.spin)).toEqual(['none', 'rotor'])
    expect(markerParts('sat-station')[0]?.spin).toBe('yaw')
  })

  it('tilts the nose with climb rate', () => {
    expect(pitchDeg(0, 250)).toBe(0)
    expect(pitchDeg(2000, 250)).toBeGreaterThan(4)
    expect(pitchDeg(-2000, 250)).toBeLessThan(-4)
    expect(pitchDeg(8000, 80)).toBeLessThanOrEqual(16)
  })
})

describe('other contact sprites', () => {
  it('classifies satellites, ships, and events', () => {
    expect(satSprite('ISS (ZARYA)', 'stations')).toBe('sat-station')
    expect(satSprite('GPS BIIR-2', 'gps-ops')).toBe('sat-nav')
    expect(satSprite('NOAA 19', 'weather')).toBe('sat-wx')
    expect(satSprite('STARLINK-100', 'starlink')).toBe('sat-comms')
    expect(satSprite('HST', 'visual')).toBe('sat-science')
    expect(satSprite('COSMOS 2251 DEB', 'visual')).toBe('sat-debris')
    expect(classifyShip(70)).toEqual({ sprite: 'ship-cargo', name: 'CARGO' })
    expect(classifyShip(80).sprite).toBe('ship-tanker')
    expect(classifyShip(60).sprite).toBe('ship-pax')
    expect(classifyShip(30).sprite).toBe('ship-fish')
    expect(classifyShip(35).sprite).toBe('ship-mil')
    expect(classifyShip(36).sprite).toBe('ship-sail')
    expect(classifyShip(31).sprite).toBe('ship-tug')
    expect(classifyShip(0).sprite).toBe('ship-unk')
    expect(flagFromMmsi(230123456)).toBe('FI')
    expect(eventSprite('Wildfires')).toBe('ico-fire')
    expect(eventSprite('Volcanoes')).toBe('ico-volcano')
  })
})
