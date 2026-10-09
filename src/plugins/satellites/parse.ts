export interface SatFix {
  name: string
  norad: number
  line1: string
  line2: string
  group: string
}

export function parseTle(text: string, group: string): SatFix[] {
  const lines = text.split(/\r?\n/).map((line) => line.replace(/\s+$/, '')).filter((line) => line.trim().length > 0)
  const out: SatFix[] = []
  for (let i = 0; i + 2 < lines.length; i++) {
    const name = lines[i]?.trim() ?? ''
    const line1 = lines[i + 1] ?? ''
    const line2 = lines[i + 2] ?? ''
    if (!line1.startsWith('1 ') || !line2.startsWith('2 ')) continue
    const norad = Number(line2.slice(2, 7))
    if (!Number.isFinite(norad)) continue
    out.push({ name, norad, line1: line1.trim(), line2: line2.trim(), group })
    i += 2
  }
  return out
}
