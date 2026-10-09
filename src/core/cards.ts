import type { CardField, SpeedUnit } from './types'

export type { CardField, SpeedUnit }

export function formatCard(fields: readonly CardField[]): string {
  return fields
    .filter((field) => field.v.trim() !== '')
    .map((field) => `${field.k.padEnd(4, ' ')} ${field.v}`)
    .join('\n')
}

export function formatSpeed(knots: number, unit: SpeedUnit): string {
  const kt = Math.max(0, knots)
  if (unit === 'mph') return `${Math.round(kt * 1.15078)} MPH`
  if (unit === 'kmh') return `${Math.round(kt * 1.852)} KM/H`
  return `${Math.round(kt)} KT`
}

export function speedUnitLabel(unit: SpeedUnit): string {
  if (unit === 'mph') return 'MPH'
  if (unit === 'kmh') return 'KM/H'
  return 'KT'
}

export function nextSpeedUnit(unit: SpeedUnit): SpeedUnit {
  if (unit === 'kt') return 'mph'
  if (unit === 'mph') return 'kmh'
  return 'kt'
}

export function ageLabel(thenMs: number, nowMs: number): string {
  if (!thenMs) return '--'
  const sec = Math.max(0, Math.round((nowMs - thenMs) / 1000))
  if (sec < 90) return `${sec}S`
  const min = Math.round(sec / 60)
  if (min < 90) return `${min}M`
  return `${Math.round(min / 60)}H`
}

export function withSpeed(fields: CardField[], knots: number | undefined, unit: SpeedUnit): CardField[] {
  if (knots == null || !Number.isFinite(knots)) return fields
  const line = { k: 'SPD', v: formatSpeed(knots, unit) }
  const index = fields.findIndex((field) => field.k === 'SPD')
  if (index < 0) return [...fields, line]
  const next = fields.slice()
  next[index] = line
  return next
}
