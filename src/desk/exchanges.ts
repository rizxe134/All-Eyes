/** Built-in exchange sessions. Holiday lists are a calendar for 2026–2027, not a live feed. */

export type SessionStatus = 'OPEN' | 'CLOSED' | 'PRE' | 'POST' | 'HOLIDAY'

export interface Exchange {
  id: string
  name: string
  mic: string
  city: string
  lat: number
  lon: number
  tz: string
  /** Minutes from local midnight. */
  openMin: number
  closeMin: number
  lunchStart?: number
  lunchEnd?: number
  preMin?: number
  postMin?: number
  /** 0 Sunday … 6 Saturday. */
  days: number[]
  holidays: readonly string[]
}

export interface ExchangeNow {
  status: SessionStatus
  note: '' | 'WEEKEND' | 'LUNCH' | 'HOLIDAY'
  localTime: string
  localDate: string
  weekday: string
}

const US_HOLIDAYS = [
  '2026-01-01',
  '2026-01-19',
  '2026-02-16',
  '2026-04-03',
  '2026-05-25',
  '2026-06-19',
  '2026-07-03',
  '2026-09-07',
  '2026-11-26',
  '2026-12-25',
  '2027-01-01',
  '2027-01-18',
  '2027-02-15',
  '2027-03-26',
  '2027-05-31',
  '2027-06-18',
  '2027-07-05',
  '2027-09-06',
  '2027-11-25',
  '2027-12-24',
]

const LSE_HOLIDAYS = [
  '2026-01-01',
  '2026-04-03',
  '2026-04-06',
  '2026-05-04',
  '2026-05-25',
  '2026-08-31',
  '2026-12-25',
  '2026-12-28',
  '2027-01-01',
  '2027-03-26',
  '2027-03-29',
  '2027-05-03',
  '2027-05-31',
  '2027-08-30',
  '2027-12-27',
  '2027-12-28',
]

const EU_HOLIDAYS = ['2026-01-01', '2026-04-03', '2026-04-06', '2026-05-01', '2026-12-25', '2026-12-26', '2027-01-01', '2027-03-26', '2027-03-29', '2027-05-01', '2027-12-25', '2027-12-26']

const JPX_HOLIDAYS = [
  '2026-01-01', '2026-01-02', '2026-01-03', '2026-01-12', '2026-02-11', '2026-02-23',
  '2026-03-20', '2026-04-29', '2026-05-03', '2026-05-04', '2026-05-05', '2026-05-06',
  '2026-07-20', '2026-08-11', '2026-09-21', '2026-09-22', '2026-09-23', '2026-10-12',
  '2026-11-03', '2026-11-23', '2026-12-31',
  '2027-01-01', '2027-01-02', '2027-01-03', '2027-01-11', '2027-02-11', '2027-02-23',
  '2027-03-21', '2027-03-22', '2027-04-29', '2027-05-03', '2027-05-04', '2027-05-05',
  '2027-07-19', '2027-08-11', '2027-09-20', '2027-09-23', '2027-10-11', '2027-11-03',
  '2027-11-23', '2027-12-31',
]

const HK_HOLIDAYS = ['2026-01-01', '2026-02-17', '2026-02-18', '2026-02-19', '2026-04-03', '2026-04-06', '2026-04-07', '2026-05-01', '2026-05-25', '2026-07-01', '2026-10-01', '2026-10-19', '2026-12-25', '2026-12-26']

const CN_HOLIDAYS = ['2026-01-01', '2026-01-02', '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19', '2026-02-20', '2026-04-06', '2026-05-01', '2026-05-04', '2026-05-05', '2026-06-19', '2026-10-01', '2026-10-02', '2026-10-05', '2026-10-06', '2026-10-07']

const IN_HOLIDAYS = ['2026-01-26', '2026-03-03', '2026-03-26', '2026-04-03', '2026-04-14', '2026-05-01', '2026-08-15', '2026-10-02', '2026-10-20', '2026-11-09', '2026-11-24', '2026-12-25']

const KR_HOLIDAYS = ['2026-01-01', '2026-02-16', '2026-02-17', '2026-02-18', '2026-03-02', '2026-05-05', '2026-05-25', '2026-06-03', '2026-08-17', '2026-09-24', '2026-09-25', '2026-10-05', '2026-10-09', '2026-12-25', '2026-12-31']

const TW_HOLIDAYS = ['2026-01-01', '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19', '2026-02-20', '2026-02-27', '2026-04-03', '2026-04-06', '2026-05-01', '2026-06-19', '2026-10-09', '2026-10-26']

const AU_HOLIDAYS = ['2026-01-01', '2026-01-26', '2026-04-03', '2026-04-06', '2026-04-25', '2026-06-08', '2026-12-25', '2026-12-28']

const ZA_HOLIDAYS = ['2026-01-01', '2026-03-21', '2026-04-03', '2026-04-06', '2026-04-27', '2026-05-01', '2026-06-16', '2026-08-10', '2026-09-24', '2026-12-16', '2026-12-25', '2026-12-26']

const SA_HOLIDAYS = ['2026-02-22', '2026-03-20', '2026-03-21', '2026-03-22', '2026-05-27', '2026-05-28', '2026-06-26', '2026-09-23']

const BR_HOLIDAYS = ['2026-01-01', '2026-02-16', '2026-02-17', '2026-04-03', '2026-04-21', '2026-05-01', '2026-06-04', '2026-09-07', '2026-10-12', '2026-11-02', '2026-11-15', '2026-12-25']

const CA_HOLIDAYS = ['2026-01-01', '2026-02-16', '2026-04-03', '2026-05-18', '2026-07-01', '2026-08-03', '2026-09-07', '2026-10-12', '2026-12-25', '2026-12-28']

const CH_HOLIDAYS = ['2026-01-01', '2026-01-02', '2026-04-03', '2026-04-06', '2026-05-01', '2026-05-14', '2026-05-25', '2026-08-01', '2026-12-25', '2026-12-26']

function row(
  id: string,
  name: string,
  mic: string,
  city: string,
  lat: number,
  lon: number,
  tz: string,
  openMin: number,
  closeMin: number,
  days: number[],
  holidays: readonly string[],
  extra: Partial<Pick<Exchange, 'lunchStart' | 'lunchEnd' | 'preMin' | 'postMin'>> = {},
): Exchange {
  return { id, name, mic, city, lat, lon, tz, openMin, closeMin, days, holidays, ...extra }
}

const WEEK = [1, 2, 3, 4, 5]
const SUN_THU = [0, 1, 2, 3, 4]

export const EXCHANGES: readonly Exchange[] = [
  row('nyse', 'NYSE', 'XNYS', 'New York', 40.7069, -74.0113, 'America/New_York', 570, 960, WEEK, US_HOLIDAYS, { preMin: 240, postMin: 1200 }),
  row('nasdaq', 'Nasdaq', 'XNAS', 'New York', 40.756, -73.986, 'America/New_York', 570, 960, WEEK, US_HOLIDAYS, { preMin: 240, postMin: 1200 }),
  row('tsx', 'TSX', 'XTSE', 'Toronto', 43.648, -79.381, 'America/Toronto', 570, 960, WEEK, CA_HOLIDAYS),
  row('b3', 'B3', 'BVMF', 'Sao Paulo', -23.546, -46.633, 'America/Sao_Paulo', 600, 1020, WEEK, BR_HOLIDAYS),
  row('lse', 'LSE', 'XLON', 'London', 51.515, -0.087, 'Europe/London', 480, 990, WEEK, LSE_HOLIDAYS),
  row('euronext', 'Euronext', 'XPAR', 'Paris', 48.869, 2.341, 'Europe/Paris', 540, 1050, WEEK, EU_HOLIDAYS),
  row('xetra', 'Xetra', 'XETR', 'Frankfurt', 50.115, 8.679, 'Europe/Berlin', 540, 1050, WEEK, EU_HOLIDAYS),
  row('six', 'SIX', 'XSWX', 'Zurich', 47.373, 8.539, 'Europe/Zurich', 540, 1050, WEEK, CH_HOLIDAYS),
  row('jpx', 'JPX', 'XJPX', 'Tokyo', 35.681, 139.774, 'Asia/Tokyo', 540, 900, WEEK, JPX_HOLIDAYS, { lunchStart: 690, lunchEnd: 750 }),
  row('hkex', 'HKEX', 'XHKG', 'Hong Kong', 22.285, 114.158, 'Asia/Hong_Kong', 570, 960, WEEK, HK_HOLIDAYS, { lunchStart: 720, lunchEnd: 780 }),
  row('sse', 'SSE', 'XSHG', 'Shanghai', 31.23, 121.473, 'Asia/Shanghai', 570, 900, WEEK, CN_HOLIDAYS, { lunchStart: 690, lunchEnd: 780 }),
  row('szse', 'SZSE', 'XSHE', 'Shenzhen', 22.543, 114.058, 'Asia/Shanghai', 570, 900, WEEK, CN_HOLIDAYS, { lunchStart: 690, lunchEnd: 780 }),
  row('nse', 'NSE', 'XNSE', 'Mumbai', 19.06, 72.863, 'Asia/Kolkata', 555, 930, WEEK, IN_HOLIDAYS),
  row('bse', 'BSE', 'XBOM', 'Mumbai', 18.93, 72.833, 'Asia/Kolkata', 555, 930, WEEK, IN_HOLIDAYS),
  row('krx', 'KRX', 'XKRX', 'Seoul', 37.566, 126.978, 'Asia/Seoul', 540, 930, WEEK, KR_HOLIDAYS),
  row('twse', 'TWSE', 'XTAI', 'Taipei', 25.033, 121.565, 'Asia/Taipei', 540, 810, WEEK, TW_HOLIDAYS),
  row('asx', 'ASX', 'XASX', 'Sydney', -33.868, 151.209, 'Australia/Sydney', 600, 960, WEEK, AU_HOLIDAYS),
  row('jse', 'JSE', 'XJSE', 'Johannesburg', -26.204, 28.047, 'Africa/Johannesburg', 540, 1020, WEEK, ZA_HOLIDAYS),
  row('tadawul', 'Tadawul', 'XSAU', 'Riyadh', 24.713, 46.675, 'Asia/Riyadh', 600, 900, SUN_THU, SA_HOLIDAYS),
]

const WEEKDAY: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6,
}

export interface ZonedParts {
  date: string
  clock: string
  minutes: number
  weekday: number
  weekdayName: string
}

export function zonedParts(now: Date, timeZone: string): ZonedParts {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
  const bag: Record<string, string> = {}
  for (const part of fmt.formatToParts(now)) bag[part.type] = part.value
  let hour = Number(bag.hour)
  if (hour === 24) hour = 0
  const minute = Number(bag.minute)
  const weekdayName = bag.weekday || ''
  return {
    date: `${bag.year}-${bag.month}-${bag.day}`,
    clock: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    minutes: hour * 60 + minute,
    weekday: WEEKDAY[weekdayName] ?? 0,
    weekdayName,
  }
}

export function exchangeStatus(ex: Exchange, now: Date): ExchangeNow {
  const local = zonedParts(now, ex.tz)
  const base = { localTime: local.clock, localDate: local.date, weekday: local.weekdayName }
  if (ex.holidays.includes(local.date)) return { ...base, status: 'HOLIDAY', note: 'HOLIDAY' }
  if (!ex.days.includes(local.weekday)) return { ...base, status: 'CLOSED', note: 'WEEKEND' }
  const m = local.minutes
  if (ex.lunchStart != null && ex.lunchEnd != null && m >= ex.lunchStart && m < ex.lunchEnd) {
    return { ...base, status: 'CLOSED', note: 'LUNCH' }
  }
  if (m >= ex.openMin && m < ex.closeMin) return { ...base, status: 'OPEN', note: '' }
  if (ex.preMin != null && m >= ex.preMin && m < ex.openMin) return { ...base, status: 'PRE', note: '' }
  if (ex.postMin != null && m >= ex.closeMin && m < ex.postMin) return { ...base, status: 'POST', note: '' }
  return { ...base, status: 'CLOSED', note: '' }
}

export function exchangeById(id: string): Exchange | null {
  return EXCHANGES.find((ex) => ex.id === id) ?? null
}
