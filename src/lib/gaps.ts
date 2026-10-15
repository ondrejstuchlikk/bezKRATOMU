// Time between doses: mirrors private.gap_stats / private.gap_mean in the
// database. Used by demo mode.

import { addDays, pragueDate, type ISODate } from './time'

/** The short average covers gaps ending today or in the 4 days before. */
export const GAP_AVG_DAYS = 5

export interface GapStats {
  /** Latest dose that has already happened (ISO instant). */
  lastDoseAt: string | null
  /** Longest gap between two doses in a row, in whole minutes. Includes the gap still running. */
  recordGapMin: number | null
  /** True when the record is the gap still running since the latest dose. */
  recordGapRunning: boolean
  avgGap5dMin: number | null
  avgGapAllMin: number | null
}

interface Gap {
  secs: number
  endDate: ISODate
}

/** The running gap counts only once it is longer than the average of the finished ones. */
export function gapMean(finished: number[], running: number | null): number | null {
  const sum = finished.reduce((s, x) => s + x, 0)
  const n = finished.length
  if (running !== null && (n === 0 || running > sum / n)) return (sum + running) / (n + 1)
  return n ? sum / n : null
}

/** True when every day strictly between `from` and `to` is a zero day. */
function onlyZeroDaysBetween(from: ISODate, to: ISODate, zeroDays: Set<ISODate>): boolean {
  for (let d = addDays(from, 1); d < to; d = addDays(d, 1)) if (!zeroDays.has(d)) return false
  return true
}

export function computeGapStats(
  doses: { takenAt: string; localDate: ISODate }[],
  zeroDays: Set<ISODate>,
  now: Date,
): GapStats {
  const today = pragueDate(now)
  const past = doses
    .map((d) => ({ at: new Date(d.takenAt).getTime(), date: d.localDate }))
    .filter((d) => d.at <= now.getTime())
    .sort((a, b) => a.at - b.at)

  const finished: Gap[] = []
  for (let i = 1; i < past.length; i++) {
    if (onlyZeroDaysBetween(past[i - 1].date, past[i].date, zeroDays)) {
      finished.push({ secs: (past[i].at - past[i - 1].at) / 1000, endDate: past[i].date })
    }
  }
  const last = past[past.length - 1]
  // Yesterday is still open for logging, so it doesn't break the running gap.
  const running = last && onlyZeroDaysBetween(last.date, addDays(today, -1), zeroDays) ? (now.getTime() - last.at) / 1000 : null

  const all = finished.map((g) => g.secs)
  const since = addDays(today, -(GAP_AVG_DAYS - 1))
  const recent = finished.filter((g) => g.endDate >= since).map((g) => g.secs)
  const best = all.length ? Math.max(...all) : null
  const record = best === null ? running : running === null ? best : Math.max(best, running)
  const toMin = (secs: number | null) => (secs === null ? null : Math.round(secs / 60))

  return {
    lastDoseAt: last ? new Date(last.at).toISOString() : null,
    recordGapMin: record === null ? null : Math.floor(record / 60),
    recordGapRunning: running !== null && running > (best ?? -1),
    avgGap5dMin: toMin(gapMean(recent, running)),
    avgGapAllMin: toMin(gapMean(all, running)),
  }
}
