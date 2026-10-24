export const OVERPASS_MIRRORS: string[]
export const DEFLOCK_ALL: string
export function alprQuery(s: number, w: number, n: number, e: number): string
export function overpassFailed(body: unknown): boolean
export function compactDeflock(geo: unknown): { brands: string[]; points: [number, number, number, number, string][] }
export function routeFlock(req: unknown, url: URL): Promise<{ status: number; type: string; body: Buffer }>
