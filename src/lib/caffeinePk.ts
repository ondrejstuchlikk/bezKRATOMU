// Rough estimate of the caffeine still in the body from the user's own entries.
//
// One-compartment model with first-order absorption and elimination, complete bioavailability
// (option A in docs/caffeine-pk-model/caffeine-pk-model.pdf). Population average, not a measurement:
// real half-lives range from about 2 to 10 h. The constants are copied from
// docs/caffeine-pk-model/ts_constants.json (written by docs/caffeine-pk-model/model.py); change the
// model there first, then copy them and rerun caffeinePk.test.ts.

/** Absorption rate (1/h): median time to peak 49 min after drinks. */
export const CAF_KA = 4.4209
/** Elimination rate (1/h): half-life 5.20 h, median of 25 healthy adult control groups. */
export const CAF_KE = 0.1333
/** Volume of distribution (L/kg). */
export const CAF_V_L_PER_KG = 0.669
/** Soft sleep reference (mg per kg body weight): Gardiner 2023, Landolt 1995 (report section 7.3). */
export const CAF_SLEEP_REF_MG_PER_KG = 0.5196
/** The app's "šálek kávy". */
export const CAF_CUP_MG = 100
export const CAF_DEFAULT_WEIGHT_KG = 70
/** Older entries contribute < 0.01 % of their dose and are ignored. */
export const CAF_MEMORY_H = 72

import { addDays, pragueDate, pragueLocalToInstant } from './time'

const HOUR_MS = 3_600_000

export interface CafEntry {
  /** ISO instant. */
  takenAt: string
  /** mg of caffeine. */
  amount: number
}

export interface CafPoint {
  /** Epoch ms. */
  t: number
  /** Absorbed and not yet eliminated (mg). */
  bodyMg: number
  /** Still being absorbed (mg). */
  gutMg: number
}

/**
 * State at `t` (epoch ms). Entries after `t` (logged for later today) and entries older than CAF_MEMORY_H
 * are ignored.
 */
export function cafAt(entries: readonly CafEntry[], t: number): CafPoint {
  let bodyMg = 0
  let gutMg = 0
  const f = CAF_KA / (CAF_KA - CAF_KE)
  for (const e of entries) {
    const h = (t - new Date(e.takenAt).getTime()) / HOUR_MS
    if (h < 0 || h > CAF_MEMORY_H || !(e.amount > 0)) continue
    bodyMg += e.amount * f * (Math.exp(-CAF_KE * h) - Math.exp(-CAF_KA * h))
    gutMg += e.amount * Math.exp(-CAF_KA * h)
  }
  return { t, bodyMg: Math.max(0, bodyMg), gutMg: Math.max(0, gutMg) }
}

/** Points every `stepMin` minutes from `from` to `to` (epoch ms, inclusive). */
export function cafSeries(entries: readonly CafEntry[], from: number, to: number, stepMin = 10): CafPoint[] {
  const out: CafPoint[] = []
  for (let t = from; t <= to; t += stepMin * 60_000) out.push(cafAt(entries, t))
  return out
}

/** Sleep reference in mg for a body weight (null weight = default 70 kg). */
export function cafSleepRefMg(weightKg: number | null | undefined): number {
  return CAF_SLEEP_REF_MG_PER_KG * (weightKg && weightKg > 0 ? weightKg : CAF_DEFAULT_WEIGHT_KG)
}

/** Cups of coffee (CAF_CUP_MG each). */
export function cafCups(mg: number): number {
  return mg / CAF_CUP_MG
}

/**
 * "If you have nothing more": the first moment after `from` at which the amount in the body, past its coming
 * peak, is below `thresholdMg`. Only entries up to `from` count. `from` itself when it is already below and
 * falling; null when nothing was taken or it doesn't happen within CAF_MEMORY_H. On a `stepMin` grid.
 */
export function cafTimeBelow(entries: readonly CafEntry[], from: number, thresholdMg: number, stepMin = 5): number | null {
  const past = entries.filter((e) => new Date(e.takenAt).getTime() <= from)
  if (!past.length) return null
  const step = stepMin * 60_000
  let prev = cafAt(past, from)
  // Still absorbing: the amount rises first, even if it is below the threshold now.
  if (prev.gutMg < 0.5 && prev.bodyMg < thresholdMg) return from
  for (let t = from + step; t <= from + CAF_MEMORY_H * HOUR_MS; t += step) {
    const p = cafAt(past, t)
    if (p.bodyMg < prev.bodyMg && p.bodyMg < thresholdMg) return t
    prev = p
  }
  return null
}

/** The next time the Prague clock shows `hhmm` strictly after `from` (epoch ms). */
export function nextClockTime(from: number, hhmm: string): number {
  const today = pragueDate(new Date(from))
  for (let i = 0; i < 3; i++) {
    const t = pragueLocalToInstant(addDays(today, i), hhmm).getTime()
    if (t > from) return t
  }
  return pragueLocalToInstant(addDays(today, 3), hhmm).getTime()
}
