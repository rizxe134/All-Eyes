/**
 * ITU maritime identification digits (the first three digits of a 9-digit MMSI).
 * Unknown codes stay blank rather than guessing a flag.
 */
const MID: Record<string, string> = {
  '211': 'DE', '218': 'DE', '219': 'DK', '220': 'DK',
  '224': 'ES', '225': 'ES', '226': 'FR', '227': 'FR', '228': 'FR',
  '230': 'FI', '232': 'GB', '233': 'GB', '234': 'GB', '235': 'GB',
  '244': 'NL', '245': 'NL', '246': 'NL', '247': 'IT', '250': 'IE',
  '255': 'PT', '257': 'NO', '258': 'NO', '259': 'NO',
  '261': 'PL', '265': 'SE', '266': 'SE', '271': 'TR',
  '273': 'RU', '275': 'LV', '276': 'EE', '277': 'LT',
  '303': 'US', '316': 'CA', '338': 'US', '345': 'MX',
  '351': 'PA', '352': 'PA', '353': 'PA', '354': 'PA', '355': 'PA', '356': 'PA', '357': 'PA',
  '366': 'US', '367': 'US', '368': 'US', '369': 'US',
  '370': 'PA', '371': 'PA', '372': 'PA', '373': 'PA', '374': 'PA',
  '403': 'SA', '412': 'CN', '413': 'CN', '414': 'CN', '416': 'TW',
  '419': 'IN', '422': 'IR', '428': 'IL', '431': 'JP', '432': 'JP',
  '440': 'KR', '441': 'KR', '470': 'AE', '477': 'HK',
  '503': 'AU', '512': 'NZ', '525': 'ID', '533': 'MY', '538': 'MH',
  '548': 'PH', '563': 'SG', '567': 'TH', '574': 'VN',
  '601': 'ZA', '622': 'EG', '636': 'LR', '637': 'LR',
}

export function flagFromMmsi(mmsi: number): string {
  const digits = String(Math.trunc(Math.abs(mmsi)))
  if (digits.length < 9) return ''
  return MID[digits.slice(0, 3)] ?? ''
}
