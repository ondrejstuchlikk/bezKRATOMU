// Taper plan generation. The database (supabase/migrations/0003_plans.sql)
// implements exactly the same integer arithmetic, so the preview shown in the
// wizard matches the authoritative plan_days written by the server.

import { addDays, type ISODate } from './time'

export type Curve = 'linear' | 'decelerating'
export type Preset = 'express' | 'fast' | 'medium' | 'slow' | 'very_slow' | 'custom'

export const PRESET_DAYS: Record<Exclude<Preset, 'custom'>, number> = {
  express: 5,
  fast: 14,
  medium: 28,
  slow: 56,
  very_slow: 84,
}

export const PRESETS: Preset[] = ['express', 'fast', 'medium', 'slow', 'very_slow', 'custom']

export const MAX_BASELINE_G = 300
export const MAX_DURATION_DAYS = 365

export interface PlanParams {
  baselineG: number
  targetG: number
  durationDays: number
  curve: Curve
}

export type PlanError = 'invalid_baseline' | 'invalid_target' | 'invalid_duration'

export function validatePlan(p: PlanParams): PlanError | null {
  if (!Number.isInteger(p.baselineG) || p.baselineG < 1 || p.baselineG > MAX_BASELINE_G) return 'invalid_baseline'
  if (!Number.isInteger(p.targetG) || p.targetG < 0 || p.targetG >= p.baselineG) return 'invalid_target'
  if (!Number.isInteger(p.durationDays) || p.durationDays < 1 || p.durationDays > MAX_DURATION_DAYS) return 'invalid_duration'
  return null
}

/**
 * Daily limit on day `t` of the plan (day 0 = baseline, day `durationDays` = target).
 *
 * L(t) = target + ceil((baseline − target) · ((D − t) / D)^k), k = 1 (linear) or 2 (decelerating).
 * Computed with integers only, so JavaScript and Postgres agree exactly. Using
 * ceil guarantees the target is first reached on the last day of the plan.
 */
export function planLimit(p: PlanParams, t: number): number {
  if (t <= 0) return p.baselineG
  if (t >= p.durationDays) return p.targetG
  const drop = p.baselineG - p.targetG
  const remaining = p.durationDays - t
  const k = p.curve === 'linear' ? 1 : 2
  const num = drop * remaining ** k
  const den = p.durationDays ** k
  return p.targetG + Math.floor((num + den - 1) / den)
}

/** Limits for days 0..durationDays (inclusive). Throws on invalid input. */
export function generatePlan(p: PlanParams): number[] {
  const error = validatePlan(p)
  if (error) throw new Error(error)
  return Array.from({ length: p.durationDays + 1 }, (_, t) => planLimit(p, t))
}

export interface PlanRecord extends PlanParams {
  id: string
  startDate: ISODate
  /** Exclusive end date when the plan was replaced by a newer one. */
  endedOn: ISODate | null
}

export interface PauseRecord {
  startDate: ISODate
  /** Inclusive last paused day; null while the pause is still running. */
  endDate: ISODate | null
}

export interface PlanDay {
  date: ISODate
  planId: string
  limitG: number
  isPaused: boolean
}

/**
 * Materializes the day-by-day limits of a plan, shifting the remaining schedule
 * forward by the length of each pause. While a pause is open, only its first day
 * is emitted; the limit then holds for every later day (see `limitOn`).
 * Mirrors private.rebuild_plan_days() in the database.
 */
export function buildPlanDays(plan: PlanRecord, pauses: PauseRecord[]): PlanDay[] {
  const out: PlanDay[] = []
  const open = pauses.find((p) => p.endDate === null)
  const closed = pauses.filter((p) => p.endDate !== null)
  let t = 0
  let d = plan.startDate
  while (t <= plan.durationDays && (plan.endedOn === null || d < plan.endedOn)) {
    const limitG = planLimit(plan, t)
    if (open && d >= open.startDate) {
      out.push({ date: d, planId: plan.id, limitG, isPaused: true })
      break
    }
    if (closed.some((p) => d >= p.startDate && d <= p.endDate!)) {
      out.push({ date: d, planId: plan.id, limitG, isPaused: true })
    } else {
      out.push({ date: d, planId: plan.id, limitG, isPaused: false })
      t++
    }
    d = addDays(d, 1)
  }
  return out
}

/** The plan day in effect on `date`: the latest row on or before it (sorted input). */
export function limitOn(days: PlanDay[], date: ISODate): PlanDay | null {
  let lo = 0
  let hi = days.length - 1
  let found: PlanDay | null = null
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (days[mid].date <= date) {
      found = days[mid]
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return found
}

/** Groups consecutive days with the same limit, e.g. for a compact plan list. */
export function groupPlanSteps(limits: number[]): { fromDay: number; toDay: number; limitG: number }[] {
  const steps: { fromDay: number; toDay: number; limitG: number }[] = []
  limits.forEach((limitG, day) => {
    const last = steps[steps.length - 1]
    if (last && last.limitG === limitG) last.toDay = day
    else steps.push({ fromDay: day, toDay: day, limitG })
  })
  return steps
}
