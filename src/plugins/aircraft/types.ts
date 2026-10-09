/**
 * ICAO type-code to silhouette.
 * Add a row to EXACT, or a prefix rule, to teach the globe a new type.
 * Model ids match the meshes in src/core/models.ts. Add a row to teach the globe a new type.
 */

export interface AirGlyph {
  sprite: string
  /** Human name, e.g. "Airbus A320". */
  name: string
  family: string
}

const EXACT: Record<string, AirGlyph> = {
  A318: { sprite: 'air-a320', name: 'Airbus A318', family: 'Airbus narrowbody' },
  A319: { sprite: 'air-a320', name: 'Airbus A319', family: 'Airbus narrowbody' },
  A320: { sprite: 'air-a320', name: 'Airbus A320', family: 'Airbus narrowbody' },
  A20N: { sprite: 'air-a320', name: 'Airbus A320neo', family: 'Airbus narrowbody' },
  A321: { sprite: 'air-a320', name: 'Airbus A321', family: 'Airbus narrowbody' },
  A21N: { sprite: 'air-a320', name: 'Airbus A321neo', family: 'Airbus narrowbody' },
  B731: { sprite: 'air-b737', name: 'Boeing 737-100', family: 'Boeing narrowbody' },
  B732: { sprite: 'air-b737', name: 'Boeing 737-200', family: 'Boeing narrowbody' },
  B733: { sprite: 'air-b737', name: 'Boeing 737-300', family: 'Boeing narrowbody' },
  B734: { sprite: 'air-b737', name: 'Boeing 737-400', family: 'Boeing narrowbody' },
  B735: { sprite: 'air-b737', name: 'Boeing 737-500', family: 'Boeing narrowbody' },
  B736: { sprite: 'air-b737', name: 'Boeing 737-600', family: 'Boeing narrowbody' },
  B737: { sprite: 'air-b737', name: 'Boeing 737-700', family: 'Boeing narrowbody' },
  B738: { sprite: 'air-b737', name: 'Boeing 737-800', family: 'Boeing narrowbody' },
  B739: { sprite: 'air-b737', name: 'Boeing 737-900', family: 'Boeing narrowbody' },
  B37M: { sprite: 'air-b737', name: 'Boeing 737 MAX 7', family: 'Boeing narrowbody' },
  B38M: { sprite: 'air-b737', name: 'Boeing 737 MAX 8', family: 'Boeing narrowbody' },
  B39M: { sprite: 'air-b737', name: 'Boeing 737 MAX 9', family: 'Boeing narrowbody' },
  A388: { sprite: 'air-a380', name: 'Airbus A380', family: 'Airbus four-engine' },
  A380: { sprite: 'air-a380', name: 'Airbus A380', family: 'Airbus four-engine' },
  B741: { sprite: 'air-b747', name: 'Boeing 747-100', family: 'Boeing four-engine' },
  B742: { sprite: 'air-b747', name: 'Boeing 747-200', family: 'Boeing four-engine' },
  B743: { sprite: 'air-b747', name: 'Boeing 747-300', family: 'Boeing four-engine' },
  B744: { sprite: 'air-b747', name: 'Boeing 747-400', family: 'Boeing four-engine' },
  B748: { sprite: 'air-b747', name: 'Boeing 747-8', family: 'Boeing four-engine' },
  A332: { sprite: 'air-a350', name: 'Airbus A330-200', family: 'Airbus widebody twin' },
  A333: { sprite: 'air-a350', name: 'Airbus A330-300', family: 'Airbus widebody twin' },
  A338: { sprite: 'air-a350', name: 'Airbus A330-800', family: 'Airbus widebody twin' },
  A339: { sprite: 'air-a350', name: 'Airbus A330-900', family: 'Airbus widebody twin' },
  A359: { sprite: 'air-a350', name: 'Airbus A350-900', family: 'Airbus widebody twin' },
  A35K: { sprite: 'air-a350', name: 'Airbus A350-1000', family: 'Airbus widebody twin' },
  B772: { sprite: 'air-b777', name: 'Boeing 777-200', family: 'Boeing widebody twin' },
  B773: { sprite: 'air-b777', name: 'Boeing 777-300', family: 'Boeing widebody twin' },
  B77L: { sprite: 'air-cargo', name: 'Boeing 777F', family: 'Cargo' },
  B77W: { sprite: 'air-b777', name: 'Boeing 777-300ER', family: 'Boeing widebody twin' },
  B788: { sprite: 'air-b777', name: 'Boeing 787-8', family: 'Boeing widebody twin' },
  B789: { sprite: 'air-b777', name: 'Boeing 787-9', family: 'Boeing widebody twin' },
  B78X: { sprite: 'air-b777', name: 'Boeing 787-10', family: 'Boeing widebody twin' },
  E170: { sprite: 'air-rj', name: 'Embraer E170', family: 'Regional jet' },
  E75S: { sprite: 'air-rj', name: 'Embraer E175', family: 'Regional jet' },
  E75L: { sprite: 'air-rj', name: 'Embraer E175', family: 'Regional jet' },
  E190: { sprite: 'air-rj', name: 'Embraer E190', family: 'Regional jet' },
  E195: { sprite: 'air-rj', name: 'Embraer E195', family: 'Regional jet' },
  E290: { sprite: 'air-rj', name: 'Embraer E190-E2', family: 'Regional jet' },
  E295: { sprite: 'air-rj', name: 'Embraer E195-E2', family: 'Regional jet' },
  CRJ2: { sprite: 'air-rj', name: 'CRJ-200', family: 'Regional jet' },
  CRJ7: { sprite: 'air-rj', name: 'CRJ-700', family: 'Regional jet' },
  CRJ9: { sprite: 'air-rj', name: 'CRJ-900', family: 'Regional jet' },
  CRJX: { sprite: 'air-rj', name: 'CRJ-1000', family: 'Regional jet' },
  AT72: { sprite: 'air-prop', name: 'ATR 72', family: 'Turboprop' },
  AT76: { sprite: 'air-prop', name: 'ATR 72', family: 'Turboprop' },
  AT45: { sprite: 'air-prop', name: 'ATR 42', family: 'Turboprop' },
  DH8A: { sprite: 'air-prop', name: 'Dash 8-100', family: 'Turboprop' },
  DH8B: { sprite: 'air-prop', name: 'Dash 8-200', family: 'Turboprop' },
  DH8C: { sprite: 'air-prop', name: 'Dash 8-300', family: 'Turboprop' },
  DH8D: { sprite: 'air-prop', name: 'Dash 8-400', family: 'Turboprop' },
  C152: { sprite: 'air-light', name: 'Cessna 152', family: 'Light prop' },
  C172: { sprite: 'air-light', name: 'Cessna 172', family: 'Light prop' },
  C182: { sprite: 'air-light', name: 'Cessna 182', family: 'Light prop' },
  C208: { sprite: 'air-light', name: 'Cessna 208', family: 'Light prop' },
  P28A: { sprite: 'air-light', name: 'Piper Cherokee', family: 'Light prop' },
  PA32: { sprite: 'air-light', name: 'Piper Saratoga', family: 'Light prop' },
  H60: { sprite: 'air-heli', name: 'Sikorsky H-60', family: 'Helicopter' },
  H47: { sprite: 'air-heli', name: 'Boeing CH-47', family: 'Helicopter' },
  R22: { sprite: 'air-heli', name: 'Robinson R22', family: 'Helicopter' },
  R44: { sprite: 'air-heli', name: 'Robinson R44', family: 'Helicopter' },
  B06: { sprite: 'air-heli', name: 'Bell 206', family: 'Helicopter' },
  EC35: { sprite: 'air-heli', name: 'Airbus H135', family: 'Helicopter' },
  EC45: { sprite: 'air-heli', name: 'Airbus H145', family: 'Helicopter' },
  A139: { sprite: 'air-heli', name: 'Leonardo AW139', family: 'Helicopter' },
  S92: { sprite: 'air-heli', name: 'Sikorsky S-92', family: 'Helicopter' },
  F16: { sprite: 'air-fighter', name: 'F-16', family: 'Fighter' },
  F18: { sprite: 'air-fighter', name: 'F/A-18', family: 'Fighter' },
  EUFI: { sprite: 'air-fighter', name: 'Eurofighter Typhoon', family: 'Fighter' },
  T38: { sprite: 'air-fighter', name: 'T-38', family: 'Fighter' },
  C56X: { sprite: 'air-biz', name: 'Citation Excel', family: 'Business jet' },
  C680: { sprite: 'air-biz', name: 'Citation Sovereign', family: 'Business jet' },
  C750: { sprite: 'air-biz', name: 'Citation X', family: 'Business jet' },
  CL30: { sprite: 'air-biz', name: 'Challenger 300', family: 'Business jet' },
  CL35: { sprite: 'air-biz', name: 'Challenger 350', family: 'Business jet' },
  CL60: { sprite: 'air-biz', name: 'Challenger 600', family: 'Business jet' },
  GLEX: { sprite: 'air-biz', name: 'Global Express', family: 'Business jet' },
  GLF4: { sprite: 'air-biz', name: 'Gulfstream IV', family: 'Business jet' },
  GLF5: { sprite: 'air-biz', name: 'Gulfstream V', family: 'Business jet' },
  GLF6: { sprite: 'air-biz', name: 'Gulfstream G650', family: 'Business jet' },
  E55P: { sprite: 'air-biz', name: 'Phenom 300', family: 'Business jet' },
  MD11: { sprite: 'air-cargo', name: 'MD-11', family: 'Cargo' },
  DC10: { sprite: 'air-cargo', name: 'DC-10', family: 'Cargo' },
  A306: { sprite: 'air-cargo', name: 'Airbus A300-600', family: 'Cargo' },
  A124: { sprite: 'air-cargo', name: 'Antonov An-124', family: 'Cargo' },
  C17: { sprite: 'air-cargo', name: 'C-17', family: 'Cargo' },
  C5: { sprite: 'air-cargo', name: 'C-5', family: 'Cargo' },
}

const UNKNOWN: AirGlyph = { sprite: 'air-unk', name: 'Unknown aircraft', family: 'Unknown' }

export function classifyAir(typeCode: string | undefined | null): AirGlyph {
  const code = (typeCode ?? '').trim().toUpperCase()
  if (!code) return UNKNOWN
  const exact = EXACT[code]
  if (exact) return exact
  if (/^A3[12]/.test(code) || code.startsWith('A20') || code.startsWith('A21')) {
    return { sprite: 'air-a320', name: `Airbus ${code}`, family: 'Airbus narrowbody' }
  }
  if (code.startsWith('A33') || code.startsWith('A35')) {
    return { sprite: 'air-a350', name: `Airbus ${code}`, family: 'Airbus widebody twin' }
  }
  if (code.startsWith('A38')) return { sprite: 'air-a380', name: 'Airbus A380', family: 'Airbus four-engine' }
  if (/^B73/.test(code) || /^B3[789]M$/.test(code)) {
    return { sprite: 'air-b737', name: `Boeing ${code}`, family: 'Boeing narrowbody' }
  }
  if (code.startsWith('B74')) return { sprite: 'air-b747', name: `Boeing ${code}`, family: 'Boeing four-engine' }
  if (code.startsWith('B77') || code.startsWith('B78')) {
    return { sprite: 'air-b777', name: `Boeing ${code}`, family: 'Boeing widebody twin' }
  }
  if (code.startsWith('E1') || code.startsWith('E2') || code.startsWith('CRJ')) {
    return { sprite: 'air-rj', name: code, family: 'Regional jet' }
  }
  if (code.startsWith('C1') || code.startsWith('P28') || code.startsWith('PA')) {
    return { sprite: 'air-light', name: code, family: 'Light prop' }
  }
  if (code.startsWith('H') && code.length <= 4) return { sprite: 'air-heli', name: code, family: 'Helicopter' }
  return { ...UNKNOWN, name: code }
}

export function airTypeTable(): Readonly<Record<string, AirGlyph>> {
  return EXACT
}
