export interface SatcatRecord {
  name: string
  objectId: string
  objectType: string
  owner: string
  launch: string
}

const TYPES: Record<string, string> = {
  PAY: 'PAYLOAD',
  RB: 'ROCKET BODY',
  DEB: 'DEBRIS',
  UNK: 'UNKNOWN',
}

export function parseSatcat(payload: unknown): SatcatRecord | null {
  const row = Array.isArray(payload) ? payload[0] : payload
  if (!row || typeof row !== 'object') return null
  const rec = row as Record<string, unknown>
  const norad = rec.NORAD_CAT_ID ?? rec.norad
  if (norad == null && !rec.OBJECT_NAME) return null
  const code = String(rec.OBJECT_TYPE ?? '').trim()
  return {
    name: String(rec.OBJECT_NAME ?? '').trim(),
    objectId: String(rec.OBJECT_ID ?? '').trim(),
    objectType: TYPES[code] || code || '',
    owner: String(rec.OWNER ?? '').trim(),
    launch: String(rec.LAUNCH_DATE ?? '').trim(),
  }
}
