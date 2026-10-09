export interface KpReading {
  time: string
  kp: number
}

export function parseKp(payload: unknown): KpReading | null {
  if (!Array.isArray(payload) || payload.length === 0) return null
  for (let i = payload.length - 1; i >= 0; i--) {
    const row = payload[i]
    if (row && typeof row === 'object' && !Array.isArray(row) && 'Kp' in row) {
      const rec = row as { time_tag?: unknown; Kp?: unknown }
      const kp = Number(rec.Kp)
      if (!Number.isFinite(kp)) continue
      return { time: String(rec.time_tag ?? ''), kp }
    }
    if (Array.isArray(row) && row.length > 1 && i > 0) {
      const kp = Number(row[1])
      if (!Number.isFinite(kp)) continue
      return { time: String(row[0] ?? ''), kp }
    }
  }
  return null
}

export function kpLabel(kp: number): string {
  if (kp >= 6) return 'STORM'
  if (kp >= 5) return 'ACTIVE'
  if (kp >= 4) return 'UNSETTLED'
  return 'QUIET'
}
