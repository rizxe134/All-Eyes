/** Legend and layer-list icons. The sprite id is the one the globe draws. */

export interface LegendIcon {
  kind: 'icon'
  id: string
  name: string
  sprite: string
  meaning: string
}

export interface LegendLine {
  kind: 'line'
  id: string
  name: string
  meaning: string
  dashed: boolean
}

export type LegendRow = LegendIcon | LegendLine

/** One sprite per layer. Satellite classes and city layers use the same ids as the markers. */
export const LAYER_SPRITE: Readonly<Record<string, string>> = {
  aircraft: 'air-a320',
  airground: 'air-gnd',
  stations: 'sat-station',
  gnss: 'sat-nav',
  wxsat: 'sat-wx',
  science: 'sat-science',
  geo: 'sat-comms',
  satellites: 'sat-comms',
  starlink: 'sat-starlink',
  ships: 'ship-cargo',
  quakes: 'ico-quake',
  storms: 'ico-storm',
  events: 'ico-event',
  weather: 'ico-wx',
  launches: 'ico-launch',
  beacons: 'drop',
  transit: 'chevron',
  poi: 'drop',
  imagery: 'city-map',
  buildings: 'city-building',
  roads: 'city-road',
  traffic: 'city-car',
  cameras: 'cam',
  flock: 'alpr',
  news: 'news',
  'news-conflict': 'news-conflict',
  'news-business': 'news-business',
  'news-science': 'news-science',
  markets: 'exchange',
  searchpin: 'drop',
}

export function spriteForLayer(layerId: string): string {
  return LAYER_SPRITE[layerId] ?? 'dot'
}

export const LEGEND_ROWS: readonly LegendRow[] = [
  { kind: 'icon', id: 'aircraft', name: 'AIRCRAFT', sprite: 'air-a320', meaning: 'Airborne. Narrowbody, widebody, prop, heli, and fighter share this family.' },
  { kind: 'icon', id: 'airground', name: 'GROUND', sprite: 'air-gnd', meaning: 'On the ground. Amber plane, parked or taxiing.' },
  { kind: 'icon', id: 'stations', name: 'STATION', sprite: 'sat-station', meaning: 'Space station.' },
  { kind: 'icon', id: 'gnss', name: 'NAV SAT', sprite: 'sat-nav', meaning: 'Navigation satellite.' },
  { kind: 'icon', id: 'wxsat', name: 'WX SAT', sprite: 'sat-wx', meaning: 'Weather satellite.' },
  { kind: 'icon', id: 'science', name: 'SCIENCE', sprite: 'sat-science', meaning: 'Science satellite.' },
  { kind: 'icon', id: 'satellites', name: 'SATELLITE', sprite: 'sat-comms', meaning: 'Other satellites, including communications and GEO.' },
  { kind: 'icon', id: 'starlink', name: 'STARLINK', sprite: 'sat-starlink', meaning: 'Starlink shell.' },
  { kind: 'icon', id: 'ships', name: 'SHIPS', sprite: 'ship-cargo', meaning: 'Ship. Cargo, tanker, passenger, and the other hulls use this family.' },
  { kind: 'icon', id: 'quakes', name: 'QUAKES', sprite: 'ico-quake', meaning: 'Earthquake ring.' },
  { kind: 'icon', id: 'storms', name: 'STORMS', sprite: 'ico-storm', meaning: 'Tropical cyclone.' },
  { kind: 'icon', id: 'events', name: 'EVENTS', sprite: 'ico-event', meaning: 'Open natural event.' },
  { kind: 'icon', id: 'weather', name: 'WEATHER', sprite: 'ico-wx', meaning: 'Precipitation radar draped on the globe.' },
  { kind: 'icon', id: 'launches', name: 'LAUNCHES', sprite: 'ico-launch', meaning: 'Upcoming launch.' },
  { kind: 'icon', id: 'beacons', name: 'BEACONS', sprite: 'drop', meaning: 'Fixed site pin.' },
  { kind: 'icon', id: 'imagery', name: 'CITY MAP', sprite: 'city-map', meaning: 'Street or satellite tiles up close.' },
  { kind: 'icon', id: 'buildings', name: 'BUILDINGS', sprite: 'city-building', meaning: 'OpenStreetMap footprints.' },
  { kind: 'icon', id: 'roads', name: 'ROADS', sprite: 'city-road', meaning: 'OpenStreetMap roads and rails.' },
  { kind: 'icon', id: 'traffic', name: 'TRAFFIC', sprite: 'city-car', meaning: 'Car on the road layer. Simulated unless a traffic key is set.' },
  { kind: 'icon', id: 'cameras', name: 'TRAFFIC CAMS', sprite: 'cam', meaning: 'Public road camera. A click opens it on the CAMERAS tab.' },
  { kind: 'icon', id: 'flock', name: 'FLOCK ALPR', sprite: 'alpr', meaning: 'License-plate reader location (Flock Safety or other maker) from OpenStreetMap / DeFlock, crowdsourced. Location only: NOT AVAILABLE, no public feed.' },
  { kind: 'icon', id: 'news', name: 'NEWS', sprite: 'news', meaning: 'Headline at its story location. The card says LOCATED BY: GDELT GEO, PLACE IN HEADLINE, PLACE IN SUMMARY, or OUTLET COUNTRY (only the feed home).' },
  { kind: 'icon', id: 'news-conflict', name: 'NEWS · CONFLICT', sprite: 'news-conflict', meaning: 'Conflict or security story.' },
  { kind: 'icon', id: 'news-business', name: 'NEWS · BUSINESS', sprite: 'news-business', meaning: 'Business or markets story.' },
  { kind: 'icon', id: 'news-science', name: 'NEWS · SCIENCE', sprite: 'news-science', meaning: 'Science, health, or space story.' },
  { kind: 'icon', id: 'markets', name: 'STOCK EXCHANGES', sprite: 'exchange', meaning: 'Exchange, with local time and OPEN, CLOSED, PRE, POST, or HOLIDAY.' },
  { kind: 'icon', id: 'transit', name: 'TRANSIT', sprite: 'chevron', meaning: 'Live transit vehicle where a keyless feed exists.' },
  { kind: 'icon', id: 'poi', name: 'PLACES', sprite: 'drop', meaning: 'Hospital, station, museum, or airport pin.' },
  { kind: 'line', id: 'select', name: 'SELECT', meaning: 'Bright ring around the locked contact.', dashed: false },
  { kind: 'line', id: 'track', name: 'TRACK', meaning: 'Solid line. Where the contact has already been.', dashed: false },
  { kind: 'line', id: 'route', name: 'ROUTE', meaning: 'Dashed line. Origin through the aircraft to the destination.', dashed: true },
]
