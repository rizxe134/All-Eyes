/** Category colours. The same hex is used on the globe, the layer rail, tooltips, and the dock. */

import type { MarkerStyle } from './types'

export type { MarkerStyle }

export const MONO_HEX = '#d8ffe8'

/** Defaults. A layer id missing from this map uses the mono phosphor. */
export const LAYER_COLORS: Record<string, string> = {
  aircraft: '#4da3ff',
  airground: '#ffb020',
  stations: '#e7fbff',
  gnss: '#b7e6ff',
  wxsat: '#9ad4ff',
  science: '#d5f3ff',
  geo: '#f4f7ff',
  satellites: '#d7f6ff',
  starlink: '#c9a6ff',
  ships: '#2ee0c0',
  quakes: '#ff4b4b',
  storms: '#e15cff',
  events: '#ffc14a',
  weather: '#ff9a3c',
  launches: '#ff6eb4',
  beacons: '#c6ff4a',
}

/** Short legend. Satellite families share the cyan family; Starlink is called out. */
export const LEGEND: ReadonlyArray<{ id: string; name: string }> = [
  { id: 'aircraft', name: 'AIRCRAFT' },
  { id: 'airground', name: 'GROUND' },
  { id: 'satellites', name: 'SATELLITES' },
  { id: 'starlink', name: 'STARLINK' },
  { id: 'ships', name: 'SHIPS' },
  { id: 'quakes', name: 'QUAKES' },
  { id: 'storms', name: 'STORMS' },
  { id: 'events', name: 'EVENTS' },
  { id: 'launches', name: 'LAUNCHES' },
  { id: 'beacons', name: 'BEACONS' },
]

const HEX = /^#[0-9a-f]{6}$/i

export function parseHex(value: string): string | null {
  const text = value.trim()
  if (!HEX.test(text)) return null
  return text.toLowerCase()
}

export function hexRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

let style: MarkerStyle = 'color'
let overrides: Record<string, string> = {}

export function applyPalette(next: MarkerStyle, custom: Record<string, string> | undefined): void {
  style = next === 'mono' ? 'mono' : 'color'
  const clean: Record<string, string> = {}
  for (const [key, value] of Object.entries(custom ?? {})) {
    const hex = parseHex(String(value))
    if (hex) clean[key] = hex
  }
  overrides = clean
}

export function markerStyle(): MarkerStyle {
  return style
}

export function layerHex(layerId: string): string {
  if (style === 'mono') return MONO_HEX
  return overrides[layerId] || LAYER_COLORS[layerId] || MONO_HEX
}

/** Multiply the white sprite by this colour. A selected ring does not come through here. */
export function layerRgb(layerId: string, lift: number): [number, number, number] {
  const [r, g, b] = hexRgb(layerHex(layerId))
  const scale = Math.max(0, Math.min(1.15, lift))
  return [r * scale, g * scale, b * scale]
}
