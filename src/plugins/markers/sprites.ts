export function eventSprite(category: string): string {
  if (/volcano/i.test(category)) return 'ico-volcano'
  if (/fire|wildfire/i.test(category)) return 'ico-fire'
  if (/storm|cyclone|hurricane/i.test(category)) return 'ico-storm'
  return 'ico-event'
}
