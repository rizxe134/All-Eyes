/** Keyless basemap URLs, plus MapTiler and Mapbox when the operator opts in. */

export type BasemapMode = 'sat' | 'streets' | 'hybrid' | 'dark'
export type BasemapSource = 'free' | 'maptiler' | 'mapbox'

export interface BasemapKeys {
  maptiler: string
  mapbox: string
}

const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services'

export function parseBasemapMode(value: string): BasemapMode | null {
  const text = value.toLowerCase()
  if (text === 'sat' || text === 'satellite' || text === 'imagery' || text === 'aerial') return 'sat'
  if (text === 'streets' || text === 'street' || text === 'road' || text === 'roads') return 'streets'
  if (text === 'hybrid' || text === 'both') return 'hybrid'
  if (text === 'dark' || text === 'night') return 'dark'
  return null
}

export function parseBasemapSource(value: string): BasemapSource | null {
  const text = value.toLowerCase()
  if (text === 'free' || text === 'esri' || text === 'carto') return 'free'
  if (text === 'maptiler' || text === 'tiler') return 'maptiler'
  if (text === 'mapbox' || text === 'box') return 'mapbox'
  return null
}

function esri(service: string, z: number, x: number, y: number): string {
  return `${ESRI}/${service}/MapServer/tile/${z}/${y}/${x}`
}

function carto(style: string, z: number, x: number, y: number): string {
  return `https://basemaps.cartocdn.com/${style}/${z}/${x}/${y}.png`
}

function maptiler(mode: BasemapMode, z: number, x: number, y: number, key: string): string {
  const token = encodeURIComponent(key)
  if (mode === 'streets') return `https://api.maptiler.com/maps/streets-v2/256/${z}/${x}/${y}.png?key=${token}`
  if (mode === 'dark') return `https://api.maptiler.com/maps/basic-v2-dark/256/${z}/${x}/${y}.png?key=${token}`
  if (mode === 'hybrid') return `https://api.maptiler.com/maps/hybrid/256/${z}/${x}/${y}.jpg?key=${token}`
  return `https://api.maptiler.com/tiles/satellite-v2/${z}/${x}/${y}.jpg?key=${token}`
}

function mapbox(mode: BasemapMode, z: number, x: number, y: number, key: string): string {
  const style = mode === 'streets' ? 'streets-v12' : mode === 'dark' ? 'dark-v11' : mode === 'hybrid' ? 'satellite-streets-v12' : 'satellite-v9'
  return `https://api.mapbox.com/styles/v1/mapbox/${style}/tiles/256/${z}/${x}/${y}?access_token=${encodeURIComponent(key)}`
}

export interface TileStack {
  base: string
  overlay: string | null
}

/** Imagery or streets, and an optional label overlay. Keys are ignored unless source asks for them. */
export function effectiveSource(source: BasemapSource, keys: BasemapKeys): BasemapSource {
  if (source === 'maptiler' && keys.maptiler) return 'maptiler'
  if (source === 'mapbox' && keys.mapbox) return 'mapbox'
  return 'free'
}

export function tileStack(mode: BasemapMode, source: BasemapSource, keys: BasemapKeys, z: number, x: number, y: number): TileStack {
  const using = effectiveSource(source, keys)
  if (using === 'maptiler') {
    return { base: maptiler(mode, z, x, y, keys.maptiler), overlay: null }
  }
  if (using === 'mapbox') {
    return { base: mapbox(mode, z, x, y, keys.mapbox), overlay: null }
  }
  if (mode === 'streets') return { base: carto('rastertiles/voyager', z, x, y), overlay: null }
  if (mode === 'dark') return { base: carto('dark_all', z, x, y), overlay: null }
  if (mode === 'hybrid') {
    return {
      base: esri('World_Imagery', z, x, y),
      overlay: esri('Reference/World_Reference_Overlay', z, x, y),
    }
  }
  return { base: esri('World_Imagery', z, x, y), overlay: null }
}

export function basemapCredit(mode: BasemapMode, source: BasemapSource): string {
  if (source === 'mapbox') return '© Mapbox © OpenStreetMap'
  if (source === 'maptiler') return '© MapTiler © OpenStreetMap'
  if (mode === 'streets' || mode === 'dark') return '© OpenStreetMap contributors © CARTO'
  if (mode === 'hybrid') return 'Imagery © Esri, Maxar, Earthstar Geographics · Labels © Esri'
  return 'Imagery © Esri, Maxar, Earthstar Geographics, and the GIS User Community'
}

export const OSM_CREDIT = 'Roads and buildings © OpenStreetMap contributors (ODbL)'
