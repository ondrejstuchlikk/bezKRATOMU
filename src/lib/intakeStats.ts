// Statistics for substances without a plan (caffeine): daily totals, averages and time between
// intakes. Computed in the browser from the user's own intakes. When intakes are shared with
// other users later, this must move into a security-definer RPC (with a SQL mirror and parity tests).
//
// There is no "zero day" button for these substances: a day without entries counts as 0, so
// the time between intakes runs across such days.

import { computeGapStats, type GapStats } from './gaps'
import { addDays, pragueDate, type ISODate } from './time'
import { round1 } from './substances'

export interface IntakeLike {
  takenAt: string
  localDate: ISODate
  amount: number
}

export interface IntakeStats extends GapStats {
  /** First day with an entry. */
  firstDate: ISODate | null
  todayTotal: number
  /** Average per day over the 7 days before today (only days since the first entry). */
  avg7d: number | null
  /** Average per day from the first entry's day to yesterday. */
  avgAll: number | null
  /** Highest daily total, the latest such day on a tie. */
  maxDay: { date: ISODate; total: number } | null
}

/** Total per day from `from` to `to` (inclusive), 0 for days without entries. */
export function dailyTotals(intakes: IntakeLike[], from: ISODate, to: ISODate): { date: ISODate; total: number }[] {
  const byDate = new Map<ISODate, number>()
  for (const i of intakes) byDate.set(i.localDate, (byDate.get(i.localDate) ?? 0) + i.amount)
  const rows: { date: ISODate; total: number }[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) rows.push({ date: d, total: round1(byDate.get(d) ?? 0) })
  return rows
}

function average(rows: { total: number }[]): number | null {
  return rows.length ? round1(rows.reduce((s, r) => s + r.total, 0) / rows.length) : null
}

export function computeIntakeStats(intakes: IntakeLike[], now: Date): IntakeStats {
  const today = pragueDate(now)
  const firstDate = intakes.reduce<ISODate | null>((m, i) => (m === null || i.localDate < m ? i.localDate : m), null)
  // Every day since the first entry counts as logged (an empty day is a day with 0).
  const allDays = new Set<ISODate>()
  if (firstDate) for (let d = firstDate; d <= today; d = addDays(d, 1)) allDays.add(d)
  const gaps = computeGapStats(intakes, allDays, now)

  const totals = firstDate && firstDate <= today ? dailyTotals(intakes, firstDate, today) : []
  const past = totals.filter((r) => r.date < today)
  const weekAgo = addDays(today, -7)
  const maxDay = totals.reduce<{ date: ISODate; total: number } | null>(
    (m, r) => (r.total > 0 && (m === null || r.total >= m.total) ? r : m),
    null,
  )

  return {
    ...gaps,
    firstDate,
    todayTotal: totals.find((r) => r.date === today)?.total ?? 0,
    avg7d: average(past.filter((r) => r.date >= weekAgo)),
    avgAll: average(past),
    maxDay,
  }
}
