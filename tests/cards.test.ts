import { describe, expect, it } from 'vitest'
import { ageLabel, formatCard, formatSpeed, nextSpeedUnit, withSpeed } from '../src/core/cards'

describe('card format', () => {
  it('pads keys and skips empty rows', () => {
    const text = formatCard([
      { k: 'CS', v: 'UAL1' },
      { k: 'OP', v: '  ' },
      { k: 'TYPE', v: 'Airbus A320-214' },
    ])
    expect(text).toBe('CS   UAL1\nTYPE Airbus A320-214')
  })

  it('converts knots and cycles the unit', () => {
    expect(formatSpeed(100, 'kt')).toBe('100 KT')
    expect(formatSpeed(100, 'mph')).toBe('115 MPH')
    expect(formatSpeed(100, 'kmh')).toBe('185 KM/H')
    expect(nextSpeedUnit('kt')).toBe('mph')
    expect(nextSpeedUnit('mph')).toBe('kmh')
    expect(nextSpeedUnit('kmh')).toBe('kt')
  })

  it('rewrites the speed row in place', () => {
    const fields = withSpeed([{ k: 'CS', v: 'BAW1' }, { k: 'SPD', v: '10 KT' }], 450, 'mph')
    expect(fields.find((field) => field.k === 'SPD')?.v).toBe('518 MPH')
    expect(fields[0]?.v).toBe('BAW1')
  })

  it('labels age from the last-seen time', () => {
    expect(ageLabel(1_000, 16_000)).toBe('15S')
    expect(ageLabel(0, 10_000)).toBe('--')
    expect(ageLabel(1_000, 1_000 + 8 * 60_000)).toBe('8M')
  })
})
