// Scoring rules. The authoritative implementation is server-side
// (private.compute_days, last redefined in supabase/migrations/0006_half_grams.sql); this mirror
// powers the demo mode and documents the rules with unit tests.
// All amounts are handled as integer centigrams so both sides round identically.

import { gramsToCg } from './units'

export type DayStatus = 'met' | 'over' | 'missed' | 'pending'

export interface ScoreState {
  /** Consecutive met days up to and including the previous day. */
  streak: number
  /** Consecutive missed days up to and including the previous day. */
  missedRun: number
}

export interface DayScoreInput {
  limitG: number
  baselineG: number
  totalCg: number
  /** Doses were logged or the day was explicitly marked as a zero day. */
  logged: boolean
  /** The day is still running (today), so not logging yet is not a miss. */
  isToday: boolean
}

export interface DayScore {
  status: DayStatus
  points: number
  state: ScoreState
}

/** round(num / den) with halves rounded up, for num ≥ 0, den > 0. */
export function roundHalfUp(num: number, den: number): number {
  return Math.floor((2 * num + den) / (2 * den))
}

export function missedPenalty(missedRun: number): number {
  return -Math.min(40, 20 + 5 * (missedRun - 1))
}

/** −1 point per 1 % of the baseline over the limit (at least 1, at most 20). */
export function overPenalty(totalCg: number, limitG: number, baselineG: number): number {
  return -Math.min(20, Math.max(1, roundHalfUp(100 * (totalCg - gramsToCg(limitG)), gramsToCg(baselineG))))
}

export function metBasePoints(totalCg: number, limitG: number): number {
  if (limitG === 0) return 15
  const limitCg = gramsToCg(limitG)
  return 10 + roundHalfUp(5 * (limitCg - totalCg), limitCg)
}

/** +10 % per full 7 days of streak, at most +50 %, applied to positive points. */
export function applyStreakBonus(points: number, streak: number): number {
  if (points <= 0) return points
  const k = Math.min(5, Math.floor(streak / 7))
  return roundHalfUp(points * (10 + k), 10)
}

export function scoreDay(input: DayScoreInput, prev: ScoreState): DayScore {
  const limitCg = gramsToCg(input.limitG)
  if (!input.logged) {
    if (input.isToday) return { status: 'pending', points: 0, state: prev }
    const missedRun = prev.missedRun + 1
    return { status: 'missed', points: missedPenalty(missedRun), state: { streak: 0, missedRun } }
  }
  if (input.totalCg <= limitCg) {
    const streak = prev.streak + 1
    const points = applyStreakBonus(metBasePoints(input.totalCg, input.limitG), streak)
    return { status: 'met', points, state: { streak, missedRun: 0 } }
  }
  return {
    status: 'over',
    points: overPenalty(input.totalCg, input.limitG, input.baselineG),
    state: { streak: 0, missedRun: 0 },
  }
}
