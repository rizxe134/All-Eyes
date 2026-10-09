import type { AllEyesPlugin } from '../../core/types'
import { getJson } from '../../net/http'
import { kpLabel, parseKp } from './parse'

export const spaceWeatherPlugin: AllEyesPlugin = {
  id: 'space-weather',
  name: 'Space Weather',
  version: '1.0.0',
  panels: [
    {
      id: 'kp',
      title: 'KP',
      mount(host, ctx) {
        let timer = 0
        let dead = false
        const tick = async () => {
          try {
            const reading = parseKp(await getJson('/api/swpc/kp', ctx.settings))
            if (dead) return
            if (!reading) {
              host.textContent = 'NO INDEX'
              return
            }
            host.textContent = `KP ${reading.kp.toFixed(2)}  ${kpLabel(reading.kp)}\n${reading.time.replace('T', ' ').replace('Z', 'Z')}`
            host.style.color = reading.kp >= 5 ? '#f3fff6' : '#3dff7a'
          } catch {
            if (!dead) host.textContent = 'KP FEED QUIET'
          }
        }
        void tick()
        timer = window.setInterval(() => void tick(), 10 * 60_000)
        return () => {
          dead = true
          window.clearInterval(timer)
        }
      },
    },
  ],
}
