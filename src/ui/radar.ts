import { bearingDeg, distanceKm } from '../core/geo'
import type { Contact, ViewState } from '../core/types'

export interface RadarReadout {
  view: ViewState
  contacts: readonly Contact[]
}

export function startRadar(canvas: HTMLCanvasElement, label: HTMLElement, read: () => RadarReadout): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const size = canvas.width
  const cx = size / 2
  const cy = size / 2
  const radius = size / 2 - 8

  const frame = () => {
    const { view, contacts } = read()
    const range = Math.min(8000, Math.max(180, view.rangeKm * 0.62))
    label.textContent = `RADAR ${Math.round(range)}KM`
    const sweep = (performance.now() / 16) % 360
    ctx.clearRect(0, 0, size, size)
    ctx.strokeStyle = '#1f8f45'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(cx, cy, radius, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(cx, cy, radius * 0.5, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(cx, cy - radius)
    ctx.lineTo(cx, cy + radius)
    ctx.moveTo(cx - radius, cy)
    ctx.lineTo(cx + radius, cy)
    ctx.stroke()

    const sweepRad = ((sweep - 90) * Math.PI) / 180
    const grd = ctx.createRadialGradient(cx, cy, 4, cx, cy, radius)
    grd.addColorStop(0, 'rgba(61,255,122,0.0)')
    grd.addColorStop(1, 'rgba(61,255,122,0.18)')
    ctx.fillStyle = grd
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.arc(cx, cy, radius, sweepRad - 0.7, sweepRad)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = '#d8ffe6'
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.lineTo(cx + Math.cos(sweepRad) * radius, cy + Math.sin(sweepRad) * radius)
    ctx.stroke()

    let shown = 0
    const step = contacts.length > 700 ? Math.ceil(contacts.length / 700) : 1
    for (let i = 0; i < contacts.length; i += step) {
      const contact = contacts[i]
      if (!contact) continue
      const dist = distanceKm(view.lat, view.lon, contact.lat, contact.lon)
      if (dist > range) continue
      const brg = (bearingDeg(view.lat, view.lon, contact.lat, contact.lon) + 360) % 360
      const delta = (sweep - brg + 360) % 360
      const trail = delta < 80 ? 1 - delta / 80 : 0.16
      const rr = (dist / range) * radius
      const ang = ((brg - 90) * Math.PI) / 180
      const x = cx + Math.cos(ang) * rr
      const y = cy + Math.sin(ang) * rr
      const dot = contact.kind === 'quake' || contact.kind === 'storm' ? 2.2 : 1.4
      ctx.fillStyle = `rgba(216, 255, 230, ${0.25 + trail * contact.brightness})`
      ctx.fillRect(x - dot / 2, y - dot / 2, dot, dot)
      shown += 1
      if (shown > 500) break
    }
    ctx.fillStyle = '#f3fff6'
    ctx.fillRect(cx - 2, cy - 2, 4, 4)
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
}
