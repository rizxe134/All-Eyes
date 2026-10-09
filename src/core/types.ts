/** Public module API. Plugins depend on this file and nothing else in core. */

export type EntityKind = 'air' | 'ship' | 'sat' | 'quake' | 'storm' | 'event' | 'launch' | 'beacon'

/** Sprite id. Built-ins: dot, chevron, diamond, ring, box, drop. Plugins register more. */
export type MarkerShape = string

export type SpeedUnit = 'kt' | 'mph' | 'kmh'

export interface CardField {
  k: string
  v: string
}

export interface Contact {
  id: string
  layerId: string
  kind: EntityKind
  lat: number
  lon: number
  altKm: number
  heading: number
  label: string
  detail: string
  /** 0..1 phosphor brightness. Hierarchy uses brightness, not hue. */
  brightness: number
  shape: MarkerShape
  scale: number
  time?: number
  mag?: number
  callsign?: string
  /** Compact rows for the hover card. Empty values are omitted when drawn. */
  card?: CardField[]
  /** Knots, so the card can retoggle KT / MPH / KM/H without a refetch. */
  speedKt?: number
}

export interface Marker {
  id: string
  lat: number
  lon: number
  altKm: number
  heading: number
  brightness: number
  shape: MarkerShape
  scale: number
}

export interface ViewState {
  lat: number
  lon: number
  rangeKm: number
}

export interface GeoPoint {
  lat: number
  lon: number
  altKm: number
}

export interface GlobeClick {
  lat: number
  lon: number
  marker: Marker | null
  layerId: string | null
}

export interface GlobeApi {
  setMarkers(layerId: string, markers: Marker[]): void
  setRadarCanvas(canvas: HTMLCanvasElement | null): void
  setOrbit(points: GeoPoint[] | null): void
  setHighlight(id: string | null): void
  setMarkerSize(scale: number): void
  flyTo(lat: number, lon: number, rangeKm?: number): void
  setView(lat: number, lon: number, rangeKm: number): void
  getView(): ViewState
  setFollow(target: { lat: number; lon: number; altKm: number } | null): void
  project(lat: number, lon: number, altKm: number): { x: number; y: number; visible: boolean }
  canvas: HTMLCanvasElement
  onClick(cb: (hit: GlobeClick) => void): () => void
  onMove(cb: (hit: { lat: number; lon: number } | null) => void): () => void
  onHover(cb: (hit: { marker: Marker; layerId: string; x: number; y: number } | null) => void): () => void
  onRelease(cb: () => void): () => void
}

export interface Settings {
  mute: boolean
  openskyId: string
  openskySecret: string
  firmsKey: string
  /** Multiplier for marker sprites. About 0.35 to 1.8. */
  markerSize: number
  speedUnit: SpeedUnit
}

export interface SettingsStore {
  get(): Settings
  update(patch: Partial<Settings>): void
  subscribe(cb: () => void): () => void
}

export interface SimClock {
  now(): number
  offsetMs: number
  setOffsetMs(ms: number): void
  subscribe(cb: (now: number) => void): () => void
}

export interface WatchRule {
  id: string
  kind: 'quake' | 'flight' | 'pass'
  value: string
}

export interface AlertItem {
  id: string
  at: number
  title: string
  detail: string
}

export interface AlertBoard {
  rules: WatchRule[]
  items: AlertItem[]
  add(rule: WatchRule): void
  remove(id: string): void
  clearRules(): void
  raise(key: string, title: string, detail: string): boolean
  subscribe(cb: () => void): () => void
}

export interface PluginContext {
  globe: GlobeApi
  clock: SimClock
  settings: SettingsStore
  alerts: AlertBoard
  publish(layerId: string, contacts: Contact[]): void
  /** Merge fields onto one contact without redrawing the whole layer. */
  patch(id: string, partial: Partial<Contact>): void
  getPin(): { lat: number; lon: number }
  onPin(cb: (pin: { lat: number; lon: number }) => void): () => void
  getTrackId(): string | null
  onTrack(cb: (id: string | null) => void): () => void
  log(layerId: string, message: string): void
}

export interface LayerContext extends PluginContext {
  signal: AbortSignal
}

export interface LayerHandle {
  setEnabled(on: boolean): void
  dispose(): void
}

export interface LayerDefinition {
  id: string
  label: string
  description: string
  defaultOn: boolean
  create(ctx: LayerContext): LayerHandle
}

export interface PanelDefinition {
  id: string
  title: string
  mount(host: HTMLElement, ctx: PluginContext): () => void
}

export interface CommandContext {
  flyTo(lat: number, lon: number, rangeKm?: number): void
  getView(): ViewState
  track(id: string | null): void
  setLayer(id: string, on: boolean): void
  layers(): { id: string; label: string; on: boolean }[]
  searchPlace(query: string): Promise<{ lat: number; lon: number; label: string } | null>
  findContact(query: string): Contact | null
  contacts(): readonly Contact[]
  setTimeMinutes(mins: number | 'live'): void
  getTimeMinutes(): number
  toggleMute(): boolean
  setMarkerSize(scale: number): void
  getMarkerSize(): number
  screenshot(): void
  copyLink(): Promise<string>
  alerts: AlertBoard
  getPin(): { lat: number; lon: number }
  setPin(lat: number, lon: number): void
  getTrackId(): string | null
  help(): string
}

export interface CommandDefinition {
  name: string
  usage: string
  summary: string
  run(args: string[], ctx: CommandContext): string | Promise<string>
}

export interface AllEyesPlugin {
  id: string
  name: string
  version: string
  layers?: LayerDefinition[]
  panels?: PanelDefinition[]
  commands?: CommandDefinition[]
}

export function toMarker(contact: Contact): Marker {
  return {
    id: contact.id,
    lat: contact.lat,
    lon: contact.lon,
    altKm: contact.altKm,
    heading: contact.heading,
    brightness: contact.brightness,
    shape: contact.shape,
    scale: contact.scale,
  }
}
