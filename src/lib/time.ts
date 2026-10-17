// All "days" in the app are calendar days in Europe/Prague, represented as
// ISO date strings ("YYYY-MM-DD"). Date arithmetic on these strings is done
// in UTC so it is unaffected by DST.

export const TIME_ZONE = 'Europe/Prague'

export type ISODate = string

const partsFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

interface PragueParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

function pragueParts(instant: Date): PragueParts {
  const parts: Record<string, string> = {}
  for (const p of partsFormat.formatToParts(instant)) parts[p.type] = p.value
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  }
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Prague calendar date of an instant (defaults to now). */
export function pragueDate(instant: Date = new Date()): ISODate {
  const p = pragueParts(instant)
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`
}

export function pragueToday(): ISODate {
  return pragueDate(new Date())
}

/** Prague wall-clock hour (0–23) of an instant. */
export function pragueHour(instant: Date): number {
  return pragueParts(instant).hour
}

/** Prague wall-clock time "HH:MM" of an instant. */
export function pragueTime(instant: Date): string {
  const p = pragueParts(instant)
  return `${pad(p.hour)}:${pad(p.minute)}`
}

/** Offset of Prague from UTC at the given instant, in minutes (60 or 120). */
function pragueOffsetMinutes(instant: Date): number {
  const p = pragueParts(instant)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60000)
}

/**
 * Converts a Prague wall-clock date and time ("HH:MM") into an instant.
 * Non-existent times (spring-forward gap) resolve to the following valid time;
 * ambiguous times (fall-back overlap) resolve to the first occurrence.
 */
export function pragueLocalToInstant(date: ISODate, time: string): Date {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  const wanted = Date.UTC(y, m - 1, d, hh, mm)
  let guess = wanted - pragueOffsetMinutes(new Date(wanted)) * 60000
  guess = wanted - pragueOffsetMinutes(new Date(guess)) * 60000
  return new Date(guess)
}

export function addDays(date: ISODate, days: number): ISODate {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

/** Number of days from `b` to `a` (a − b). */
export function diffDays(a: ISODate, b: ISODate): number {
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  return Math.round((Date.UTC(ay, am - 1, ad) - Date.UTC(by, bm - 1, bd)) / 86400000)
}

/** Inclusive list of dates from `from` to `to`. */
export function dateRange(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d)
  return out
}

function utcDate(date: ISODate): Date {
  return new Date(`${date}T00:00:00Z`)
}

const shortFormat = new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'numeric', timeZone: 'UTC' })
const weekdayFormat = new Intl.DateTimeFormat('cs-CZ', { weekday: 'short', day: 'numeric', month: 'numeric', timeZone: 'UTC' })
const weekdayOnlyFormat = new Intl.DateTimeFormat('cs-CZ', { weekday: 'short', timeZone: 'UTC' })
const longFormat = new Intl.DateTimeFormat('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })

/** "12. 10." */
export function formatShortDate(date: ISODate): string {
  return shortFormat.format(utcDate(date))
}

/** "po 12. 10." */
export function formatWeekdayDate(date: ISODate): string {
  return weekdayFormat.format(utcDate(date))
}

/** "po" */
export function formatWeekday(date: ISODate): string {
  return weekdayOnlyFormat.format(utcDate(date))
}

/** "pondělí 12. října" */
export function formatLongDate(date: ISODate): string {
  return longFormat.format(utcDate(date))
}
