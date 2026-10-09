export interface PassWindow {
  start: number
  end: number
  peak: number
  peakEl: number
}

export function windowsAbove(samples: { t: number; el: number }[], minEl: number): PassWindow[] {
  const out: PassWindow[] = []
  let current: PassWindow | null = null
  for (const sample of samples) {
    if (sample.el >= minEl) {
      if (!current) {
        current = { start: sample.t, end: sample.t, peak: sample.t, peakEl: sample.el }
      } else {
        current.end = sample.t
        if (sample.el > current.peakEl) {
          current.peakEl = sample.el
          current.peak = sample.t
        }
      }
    } else if (current) {
      out.push(current)
      current = null
    }
  }
  if (current) out.push(current)
  return out
}

export function formatPass(pass: PassWindow): string {
  const clock = (ms: number) => new Date(ms).toISOString().slice(11, 16) + 'Z'
  return `RISE ${clock(pass.start)}  MAX ${pass.peakEl.toFixed(0)}° ${clock(pass.peak)}  SET ${clock(pass.end)}`
}
