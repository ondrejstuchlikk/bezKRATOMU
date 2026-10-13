// Taper plan generation. The database (supabase/migrations/0006_half_grams.sql)
// implements exactly the same integer arithmetic (in half-gram units), so the
// preview shown in the wizard matches the authoritative plan_days written by the server.

import { addDays, type ISODate } from './time'

/** 'manual' = the user typed the limit of every day (see customLimits). */
export type Curve = 'linear' | 'decelerating' | 'manual'
export type Preset = 'express' | 'fast' | 'medium' | 'slow' | 'very_slow' | 'custom'

export const PRESET_DAYS: Record<Exclude<Preset, 'custom'>, number> = {
  express: 5,
  fast: 14,
  medium: 28,
  slow: 56,
  very_slow: 84,
}

export const PRESETS: Preset[] = ['express', 'fast', 'medium', 'slow', 'very_slow', 'custom']

/** Plans and limits move in half-gram steps (0.5, 1, 1.5, …). */
export const PLAN_STEP_G = 0.5
export const MAX_BASELINE_G = 300
export const MAX_DURATION_DAYS = 365

export interface PlanParams {
  baselineG: number
  targetG: number
  durationDays: number
  curve: Curve
  /** Limits of days 0..durationDays, only for curve 'manual'. */
  customLimits?: number[] | null
}

export type PlanError = 'invalid_baseline' | 'invalid_target' | 'invalid_duration' | 'invalid_limits'

/** True for whole and half grams: 0, 0.5, 1, 1.5, … */
export function isHalfGram(g: number): boolean {
  return Number.isInteger(g * 2)
}

export function validatePlan(p: PlanParams): PlanError | null {
  if (!isHalfGram(p.baselineG) || p.baselineG < PLAN_STEP_G || p.baselineG > MAX_BASELINE_G) return 'invalid_baseline'
  if (!isHalfGram(p.targetG) || p.targetG < 0 || p.targetG >= p.baselineG) return 'invalid_target'
  if (!Number.isInteger(p.durationDays) || p.durationDays < 1 || p.durationDays > MAX_DURATION_DAYS) return 'invalid_duration'
  return null
}

/** A hand-made plan has 2 to 366 days (day 0 = today … day 365). */
export const MIN_CUSTOM_DAYS = 2
export const MAX_CUSTOM_DAYS = MAX_DURATION_DAYS + 1

/**
 * Per-row problems of a hand-made plan: each limit must be a half gram between
 * 0 and 300 and must not be higher than the day before. Mirrors public.create_custom_plan().
 */
export function invalidLimitRows(limits: (number | null)[]): boolean[] {
  return limits.map(
    (l, i) =>
      l === null || !isHalfGram(l) || l < 0 || l > MAX_BASELINE_G || (i > 0 && limits[i - 1] !== null && l > limits[i - 1]!),
  )
}

export function validateCustomLimits(limits: (number | null)[]): PlanError | null {
  if (limits.length < MIN_CUSTOM_DAYS || limits.length > MAX_CUSTOM_DAYS) return 'invalid_duration'
  if (invalidLimitRows(limits).some(Boolean)) return 'invalid_limits'
  if (limits[0]! < PLAN_STEP_G) return 'invalid_baseline'
  return null
}

/** Plan parameters of a hand-made plan (limits must be valid). */
export function customPlanParams(limits: number[]): PlanParams {
  return {
    baselineG: limits[0],
    targetG: limits[limits.length - 1],
    durationDays: limits.length - 1,
    curve: 'manual',
    customLimits: limits,
  }
}

/**
 * Daily limit on day `t` of the plan (day 0 = baseline, day `durationDays` = target).
 *
 * L(t) = target + ceil₀.₅((baseline − target) · ((D − t) / D)^k), k = 1 (linear) or 2 (decelerating),
 * where ceil₀.₅ rounds up to the next half gram. Computed with integers (half-gram
 * units) only, so JavaScript and Postgres agree exactly. Rounding up guarantees
 * the target is first reached on the last day of the plan.
 */
export function planLimit(p: PlanParams, t: number): number {
  if (p.curve === 'manual') return p.customLimits![Math.min(Math.max(t, 0), p.durationDays)]
  if (t <= 0) return p.baselineG
  if (t >= p.durationDays) return p.targetG
  const baseline2 = Math.round(p.baselineG * 2)
  const target2 = Math.round(p.targetG * 2)
  const remaining = p.durationDays - t
  const k = p.curve === 'linear' ? 1 : 2
  const num = (baseline2 - target2) * remaining ** k
  const den = p.durationDays ** k
  return (target2 + Math.floor((num + den - 1) / den)) / 2
}

/** Limits for days 0..durationDays (inclusive). Throws on invalid input. */
export function generatePlan(p: PlanParams): number[] {
  const error = p.curve === 'manual' ? validateCustomLimits(p.customLimits ?? []) : validatePlan(p)
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
