/** Keep LEO true. Pull higher orbits into a visible halo so the earth stays full-frame. */
export function displayAltKm(trueKm: number): number {
  if (trueKm <= 2000) return Math.max(0, trueKm)
  const t = Math.min(1, (trueKm - 2000) / 40000)
  return 2000 + Math.sqrt(t) * 5000
}
