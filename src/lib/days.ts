// Day-by-day evaluation of a user's history: mirrors private.compute_days /
// private.user_days / private.user_stats in the database. Used by demo mode.

import { limitOn, type PlanDay } from './plan'
import { scoreDay, type DayStatus, type ScoreState } from './scoring'
import { addDays, type ISODate } from './time'

/** Doses and zero days can be changed for today and this many days before it (RLS in 0015). */
export const EDIT_WINDOW_DAYS = 7

export interface DayRow {
  date: ISODate
  planId: string
  limitG: number
  baselineG: number
  totalG: number
  logged: boolean
  zeroDay: boolean
  isPaused: boolean
  status: DayStatus
  points: number
  streakAfter: number
  missedRun: number
  /** Days older than yesterday are final; the server recomputes them if one is edited later. */
  isFinal: boolean
}

export interface DayActivity {
  totalCg: number
  doseCount: number
  zeroDay: boolean
}

/**
 * Evaluates every day from the first plan day up to `today`.
 * `planDays` must be sorted by date (merged across all of the user's plans).
 */
export function computeDays(
  planDays: PlanDay[],
  baselineByPlan: Map<string, number>,
  activity: Map<ISODate, DayActivity>,
  today: ISODate,
): DayRow[] {
  if (planDays.length === 0) return []
  const rows: DayRow[] = []
  let state: ScoreState = { streak: 0, missedRun: 0 }
  for (let d = planDays[0].date; d <= today; d = addDays(d, 1)) {
    const pd = limitOn(planDays, d)
    if (!pd) continue
    const baselineG = baselineByPlan.get(pd.planId)!
    const act = activity.get(d)
    const totalCg = act?.totalCg ?? 0
    const zeroDay = !!act?.zeroDay && !act.doseCount
    const logged = (act?.doseCount ?? 0) > 0 || zeroDay
    const score = scoreDay({ limitG: pd.limitG, baselineG, totalCg, logged, isToday: d >= today }, state)
    state = score.state
    rows.push({
      date: d,
      planId: pd.planId,
      limitG: pd.limitG,
      baselineG,
      totalG: totalCg / 100,
      logged,
      zeroDay,
      isPaused: pd.isPaused,
      status: score.status,
      points: score.points,
      streakAfter: state.streak,
      missedRun: state.missedRun,
      isFinal: d <= addDays(today, -2),
    })
  }
  return rows
}

export interface StatsSummary {
  totalPoints: number
  metDays: number
  scoredDays: number
  metPct: number | null
  currentStreak: number
  bestStreak: number
  reductionLimitPct: number | null
  reductionAvgPct: number | null
  todayStatus: DayStatus | 'none'
  currentLimitG: number | null
  hasPlan: boolean
}

/** `firstBaselineG` = baseline of the user's very first plan. */
export function computeStats(rows: DayRow[], firstBaselineG: number | null, today: ISODate): StatsSummary {
  const scored = rows.filter((r) => r.status !== 'pending')
  const met = rows.filter((r) => r.status === 'met').length
  const todayRow = rows.find((r) => r.date === today)
  const weekAgo = addDays(today, -7)
  const lastWeek = rows.filter((r) => r.logged && r.date >= weekAgo && r.date < today)
  const avg = lastWeek.length ? lastWeek.reduce((s, r) => s + r.totalG, 0) / lastWeek.length : null
  return {
    totalPoints: rows.reduce((s, r) => s + r.points, 0),
    metDays: met,
    scoredDays: scored.length,
    metPct: scored.length ? Math.round((100 * met) / scored.length) : null,
    currentStreak: rows.length ? rows[rows.length - 1].streakAfter : 0,
    bestStreak: rows.reduce((m, r) => Math.max(m, r.streakAfter), 0),
    reductionLimitPct:
      firstBaselineG && todayRow ? Math.round(100 * (1 - todayRow.limitG / firstBaselineG)) : null,
    reductionAvgPct: firstBaselineG && avg !== null ? Math.round(100 * (1 - avg / firstBaselineG)) : null,
    todayStatus: todayRow?.status ?? 'none',
    currentLimitG: todayRow?.limitG ?? null,
    hasPlan: firstBaselineG !== null,
  }
}

export type FeedEventType = 'plan_started' | 'streak' | 'half_baseline' | 'target_reached' | 'first_zero_day'

export interface DerivedEvent {
  type: FeedEventType
  eventDate: ISODate
  payload: Record<string, unknown>
}

/** Events generated when days become final (mirrors private.finalize_user). */
export function deriveDayEvents(
  rows: DayRow[],
  firstBaselineG: number,
  targetByPlan: Map<string, number>,
): DerivedEvent[] {
  const events: DerivedEvent[] = []
  let half = false
  let zero = false
  const targetDone = new Set<string>()
  for (const r of rows) {
    if (!r.isFinal) continue
    if (r.status === 'met' && [7, 14, 30].includes(r.streakAfter)) {
      events.push({ type: 'streak', eventDate: r.date, payload: { days: r.streakAfter } })
    }
    if (!half && r.status === 'met' && r.limitG * 2 <= firstBaselineG) {
      half = true
      events.push({ type: 'half_baseline', eventDate: r.date, payload: {} })
    }
    if (r.status === 'met' && !targetDone.has(r.planId) && r.limitG === targetByPlan.get(r.planId)) {
      targetDone.add(r.planId)
      events.push({ type: 'target_reached', eventDate: r.date, payload: {} })
    }
    if (!zero && r.zeroDay) {
      zero = true
      events.push({ type: 'first_zero_day', eventDate: r.date, payload: {} })
    }
  }
  return events
}
