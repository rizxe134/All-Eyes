export interface CreditPhoto {
  url: string
  link: string
  credit: string
}

function textOf(value: unknown): string {
  if (!value || typeof value !== 'object') return ''
  const raw = (value as { value?: unknown }).value
  if (typeof raw !== 'string') return ''
  return raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

/** A short or common name is not enough. The file must carry the IMO or a specific vessel name. */
export function commonsTitleMatches(title: string, name: string, imo: string): boolean {
  const upper = title.toUpperCase()
  if (imo.length >= 7 && upper.includes(imo)) return true
  if (name.length < 8) return false
  const phrase = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^A-Z0-9])${phrase}([^A-Z0-9]|$)`).test(upper)
}

/** Wikimedia Commons search. The file title must name the vessel or its IMO. */
export function parseCommons(payload: unknown, hints: { name?: string; imo?: string } = {}): CreditPhoto | null {
  if (!payload || typeof payload !== 'object') return null
  const pages = (payload as { query?: { pages?: Record<string, unknown> } }).query?.pages
  if (!pages) return null
  const name = (hints.name || '').trim().toUpperCase()
  const imo = (hints.imo || '').replace(/\D/g, '')
  if (name.length < 4 && imo.length < 7) return null
  for (const page of Object.values(pages)) {
    if (!page || typeof page !== 'object') continue
    const row = page as { title?: unknown; imageinfo?: unknown }
    const title = typeof row.title === 'string' ? row.title.replace(/^File:/, '') : ''
    if (!commonsTitleMatches(title, name, imo)) continue
    const info = Array.isArray(row.imageinfo) ? row.imageinfo[0] : null
    if (!info || typeof info !== 'object') continue
    const shot = info as { thumburl?: unknown; url?: unknown; descriptionurl?: unknown; extmetadata?: Record<string, unknown> }
    const url = typeof shot.thumburl === 'string' ? shot.thumburl : typeof shot.url === 'string' ? shot.url : ''
    if (!url.startsWith('https://')) continue
    const meta = shot.extmetadata ?? {}
    const artist = textOf(meta.Artist) || textOf(meta.Credit) || 'Wikimedia Commons'
    const link = typeof shot.descriptionurl === 'string' ? shot.descriptionurl : url
    return { url, link, credit: `${artist} / ${title}` }
  }
  return null
}
