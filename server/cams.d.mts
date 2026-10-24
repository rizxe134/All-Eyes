export function rewritePlaylist(text: string, base: string): string
export function canonicalMedia(target: string): string
export function mediaHeaders(target: string): { 'user-agent': string; accept: string; referer: string; origin: string }
export function mediaAllowed(target: string): boolean
