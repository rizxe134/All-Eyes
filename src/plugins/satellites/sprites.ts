export function satSprite(name: string, group: string): string {
  const text = `${name} ${group}`.toUpperCase()
  if (group === 'stations' || /ISS|ZARYA|TIANHE|TIANGONG/.test(text)) return 'sat-station'
  if (group === 'gps-ops' || /GPS|NAVSTAR|GALILEO|BEIDOU|GLONASS/.test(text)) return 'sat-nav'
  if (group === 'weather' || /NOAA|GOES|METOP|HIMAWARI|FENGYUN/.test(text)) return 'sat-wx'
  if (/DEBRIS|\bDEB\b|R\/B|OBJECT [A-Z]/.test(text)) return 'sat-debris'
  if (group === 'science' || /HST|HUBBLE|CHANDRA|FERMI|SWIFT|XMM/.test(text)) return 'sat-science'
  return 'sat-comms'
}
