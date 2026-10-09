export interface City {
  name: string
  lat: number
  lon: number
  aliases?: string[]
}

export const CITIES: City[] = [
  { name: 'TOKYO', lat: 35.68, lon: 139.69, aliases: ['EDO'] },
  { name: 'NEW YORK', lat: 40.71, lon: -74.01, aliases: ['NYC', 'NEW YORK CITY'] },
  { name: 'LOS ANGELES', lat: 34.05, lon: -118.24, aliases: ['LA', 'LAX'] },
  { name: 'LONDON', lat: 51.51, lon: -0.13 },
  { name: 'PARIS', lat: 48.86, lon: 2.35 },
  { name: 'BERLIN', lat: 52.52, lon: 13.4 },
  { name: 'ROME', lat: 41.9, lon: 12.5 },
  { name: 'MADRID', lat: 40.42, lon: -3.7 },
  { name: 'MOSCOW', lat: 55.75, lon: 37.62 },
  { name: 'CAIRO', lat: 30.04, lon: 31.24 },
  { name: 'LAGOS', lat: 6.52, lon: 3.38 },
  { name: 'NAIROBI', lat: -1.29, lon: 36.82 },
  { name: 'JOHANNESBURG', lat: -26.2, lon: 28.05 },
  { name: 'DUBAI', lat: 25.2, lon: 55.27 },
  { name: 'MUMBAI', lat: 19.08, lon: 72.88, aliases: ['BOMBAY'] },
  { name: 'DELHI', lat: 28.61, lon: 77.21, aliases: ['NEW DELHI'] },
  { name: 'BANGKOK', lat: 13.76, lon: 100.5 },
  { name: 'SINGAPORE', lat: 1.35, lon: 103.82 },
  { name: 'HONG KONG', lat: 22.32, lon: 114.17 },
  { name: 'SHANGHAI', lat: 31.23, lon: 121.47 },
  { name: 'BEIJING', lat: 39.9, lon: 116.41 },
  { name: 'SEOUL', lat: 37.57, lon: 126.98 },
  { name: 'SYDNEY', lat: -33.87, lon: 151.21 },
  { name: 'MELBOURNE', lat: -37.81, lon: 144.96 },
  { name: 'AUCKLAND', lat: -36.85, lon: 174.76 },
  { name: 'SAO PAULO', lat: -23.55, lon: -46.63 },
  { name: 'RIO', lat: -22.91, lon: -43.17, aliases: ['RIO DE JANEIRO'] },
  { name: 'BUENOS AIRES', lat: -34.6, lon: -58.38 },
  { name: 'LIMA', lat: -12.05, lon: -77.04 },
  { name: 'MEXICO CITY', lat: 19.43, lon: -99.13 },
  { name: 'CHICAGO', lat: 41.88, lon: -87.63 },
  { name: 'TORONTO', lat: 43.65, lon: -79.38 },
  { name: 'VANCOUVER', lat: 49.28, lon: -123.12 },
  { name: 'SAN FRANCISCO', lat: 37.77, lon: -122.42, aliases: ['SF'] },
  { name: 'SEATTLE', lat: 47.61, lon: -122.33 },
  { name: 'DENVER', lat: 39.74, lon: -104.99 },
  { name: 'MIAMI', lat: 25.76, lon: -80.19 },
  { name: 'WASHINGTON', lat: 38.91, lon: -77.04, aliases: ['DC'] },
  { name: 'REYKJAVIK', lat: 64.15, lon: -21.94 },
  { name: 'OSLO', lat: 59.91, lon: 10.75 },
  { name: 'STOCKHOLM', lat: 59.33, lon: 18.07 },
  { name: 'HELSINKI', lat: 60.17, lon: 24.94 },
  { name: 'ISTANBUL', lat: 41.01, lon: 28.98 },
  { name: 'ATHENS', lat: 37.98, lon: 23.73 },
  { name: 'LISBON', lat: 38.72, lon: -9.14 },
  { name: 'AMSTERDAM', lat: 52.37, lon: 4.9 },
  { name: 'BRUSSELS', lat: 50.85, lon: 4.35 },
  { name: 'VIENNA', lat: 48.21, lon: 16.37 },
  { name: 'WARSAW', lat: 52.23, lon: 21.01 },
  { name: 'KYIV', lat: 50.45, lon: 30.52, aliases: ['KIEV'] },
  { name: 'TEHRAN', lat: 35.69, lon: 51.39 },
  { name: 'RIYADH', lat: 24.71, lon: 46.68 },
  { name: 'TEL AVIV', lat: 32.09, lon: 34.78 },
  { name: 'JAKARTA', lat: -6.21, lon: 106.85 },
  { name: 'MANILA', lat: 14.6, lon: 120.98 },
  { name: 'HANOI', lat: 21.03, lon: 105.85 },
  { name: 'TAIPEI', lat: 25.03, lon: 121.57 },
  { name: 'HONOLULU', lat: 21.31, lon: -157.86 },
  { name: 'ANCHORAGE', lat: 61.22, lon: -149.9 },
  { name: 'CAPE TOWN', lat: -33.92, lon: 18.42 },
  { name: 'CASABLANCA', lat: 33.57, lon: -7.59 },
  { name: 'ADDIS ABABA', lat: 9.03, lon: 38.74 },
  { name: 'QUITO', lat: -0.18, lon: -78.47 },
  { name: 'BOGOTA', lat: 4.71, lon: -74.07 },
  { name: 'SANTIAGO', lat: -33.45, lon: -70.67 },
  { name: 'GREENWICH', lat: 51.48, lon: -0.0 },
  { name: 'CAPE CANAVERAL', lat: 28.39, lon: -80.6, aliases: ['KENNEDY', 'KSC'] },
  { name: 'BAIKONUR', lat: 45.96, lon: 63.31 },
  { name: 'NULL ISLAND', lat: 0, lon: 0 },
]

function norm(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

export function findCity(query: string): City | null {
  const q = norm(query)
  if (!q) return null
  let best: { city: City; score: number } | null = null
  for (const city of CITIES) {
    const names = [city.name, ...(city.aliases ?? [])].map(norm)
    for (const name of names) {
      let score = 0
      if (name === q) score = 100
      else if (name.startsWith(q)) score = 80
      else if (q.startsWith(name) && name.length > 3) score = 70
      else if (name.includes(q) && q.length > 2) score = 50
      if (score && (!best || score > best.score)) best = { city, score }
    }
  }
  return best?.city ?? null
}
