/** @vitest-environment happy-dom */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { FlightView } from '../src/plugins/aircraft/detail'
import { mountFlightPanel } from '../src/ui/flight-panel'

function view(photoUrl = ''): FlightView {
  return {
    callsign: 'AFR137T',
    typeCode: 'A359',
    typeName: 'Airbus A350-900',
    operator: 'Air France',
    originCode: 'ORD',
    originCity: 'Chicago',
    destCode: 'CDG',
    destCity: 'Paris',
    progress: 0.4,
    rows: [
      { k: 'GROUND SPEED', v: '470 KT' },
      { k: 'TRUE AIRSPEED', v: '480 KT' },
    ],
    photoUrl,
    photoLink: photoUrl,
    photoCredit: photoUrl ? 'Example / PlaneSpotters.net' : '',
  }
}

describe('flight panel layout', () => {
  it('keeps the photo in a color CRT and the route below it', () => {
    const css = readFileSync('src/styles.css', 'utf8')
    expect(css).not.toContain('hue-rotate')
    expect(css).not.toContain('sepia')
    expect(css).toContain('.ae-crt-screen')
    expect(css).toContain('.ae-flight-body')

    const panel = mountFlightPanel()
    document.body.append(panel.root)
    panel.setView(view('https://example.test/photo.jpg'))
    const body = panel.root.querySelector('.ae-flight-body')
    expect(body).toBeTruthy()
    const photo = body!.querySelector('.ae-crt')
    const route = body!.querySelector('.ae-flight-route')
    expect(photo).toBeTruthy()
    expect(route).toBeTruthy()
    expect(photo!.compareDocumentPosition(route!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(panel.root.querySelector('.ae-crt-screen img')?.hasAttribute('hidden')).toBe(false)
    expect(panel.root.querySelector('.ae-nophoto')?.hasAttribute('hidden')).toBe(true)
    const screen = panel.root.querySelector('.ae-crt-screen') as HTMLElement
    expect(getComputedStyle(screen).filter).not.toContain('hue-rotate')
    const actions = panel.root.querySelector('.ae-flight-actions')
    expect(actions && body && (actions.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_PRECEDING)).toBeTruthy()
  })

  it('shows color bars when there is no photo', () => {
    const panel = mountFlightPanel()
    document.body.append(panel.root)
    panel.setView(view(''))
    expect(panel.root.querySelector('.ae-nophoto')?.hasAttribute('hidden')).toBe(false)
    expect(panel.root.querySelector('.ae-nophoto')?.textContent).toBe('NO PHOTO')
    expect(panel.root.querySelector('.ae-crt-snow')?.classList.contains('is-bars')).toBe(true)
    const times = [...panel.root.querySelectorAll('.ae-flight-times div')].map((row) => row.textContent)
    expect(times.join('|')).toContain('SCHED')
    expect(times.join('|')).toContain('ACTUAL')
    expect(times.join('|')).toContain('EST')
  })

  it('opens MORE inside the action bar and closes on Escape or an outside click', () => {
    const panel = mountFlightPanel()
    document.body.append(panel.root)
    panel.setView(view(''))
    const more = [...panel.root.querySelectorAll('button')].find((button) => button.textContent === 'MORE')
    const menu = panel.root.querySelector('.ae-flight-menu') as HTMLElement
    const grid = panel.root.querySelector('.ae-flight-grid') as HTMLElement
    expect(more).toBeTruthy()
    expect(menu.hidden).toBe(true)
    more!.click()
    expect(menu.hidden).toBe(false)
    expect(panel.root.querySelector('.ae-flight-actions')?.contains(menu)).toBe(true)
    expect(grid.contains(menu)).toBe(false)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(menu.hidden).toBe(true)
    more!.click()
    expect(menu.hidden).toBe(false)
    grid.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    expect(menu.hidden).toBe(true)
  })
})
