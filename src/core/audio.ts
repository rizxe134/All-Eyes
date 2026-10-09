type Tone = 'click' | 'lock' | 'alert' | 'boot' | 'error' | 'shot'

const NOTES: Record<Tone, ReadonlyArray<readonly [number, number]>> = {
  click: [[880, 0.045]],
  lock: [
    [440, 0.05],
    [660, 0.05],
    [990, 0.08],
  ],
  alert: [
    [520, 0.07],
    [0, 0.04],
    [780, 0.09],
    [0, 0.03],
    [780, 0.12],
  ],
  boot: [
    [330, 0.06],
    [494, 0.06],
    [659, 0.09],
  ],
  error: [
    [150, 0.1],
    [90, 0.14],
  ],
  shot: [
    [1320, 0.03],
    [1760, 0.05],
  ],
}

export class Sfx {
  private ctx: AudioContext | null = null
  private muted = false

  setMuted(muted: boolean): void {
    this.muted = muted
  }

  unlock(): void {
    if (typeof AudioContext === 'undefined') return
    if (!this.ctx) this.ctx = new AudioContext()
    if (this.ctx.state === 'suspended') void this.ctx.resume()
  }

  play(tone: Tone): void {
    if (this.muted) return
    this.unlock()
    const ctx = this.ctx
    if (!ctx || ctx.state !== 'running') return
    let when = ctx.currentTime
    for (const [freq, dur] of NOTES[tone]) {
      if (freq > 0) {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'square'
        osc.frequency.value = freq
        gain.gain.setValueAtTime(0.045, when)
        gain.gain.exponentialRampToValueAtTime(0.0001, when + dur)
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start(when)
        osc.stop(when + dur + 0.02)
      }
      when += dur
    }
  }
}
