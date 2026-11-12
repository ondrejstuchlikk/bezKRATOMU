// Rough estimate of the caffeine still in the body from the user's own entries.
//
// One-compartment model with first-order absorption and elimination, complete bioavailability
// (option A in docs/caffeine-pk-model/caffeine-pk-model.pdf). Population average, not a measurement:
// real half-lives range from about 2 to 10 h. The constants are copied from
// docs/caffeine-pk-model/ts_constants.json (written by docs/caffeine-pk-model/model.py); change the
// model there first, then copy them and rerun caffeinePk.test.ts.
// Version 2 (2026-11-12): for users who log cigarettes, the elimination rate follows their own smoking
// (CYP1A2 induction; report section "Smoking"). Without cigarettes everything is exactly as in version 1.

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

// --- Smoking (version 2) ----------------------------------------------------------------------------------
/** Dose-response of caffeine clearance on cigarettes in the last 24 h: 1 + EMAX·r/(EC50 + r) (Tantcheva-Poór 1999). */
export const CAF_SMOKE_EMAX = 1.0514
export const CAF_SMOKE_EC50 = 10.292
/** Rate (1/h) at which the clearance follows a change in smoking: half-life 38.6 h (Faber 2004). */
export const CAF_SMOKE_KDEG = 0.017957
/** Cigarettes older than this no longer matter. */
export const CAF_SMOKE_WINDOW_DAYS = 28
/** Before the first logged cigarette the user is assumed to have smoked like in their first logged week. */
export const CAF_SMOKE_START_AVG_DAYS = 7
const SMOKE_STEP_MS = 15 * 60_000

/** How fast caffeine is eliminated over time: a multiple of CAF_KE. */
export interface CafClearance {
  /** Elimination rate relative to a non-smoker (1 = CAF_KE). */
  factor(t: number): number
  /** ∫ ke dt between two instants (dimensionless). */
  elim(from: number, to: number): number
}

/** Version 1: the population average for everyone. */
export const CAF_BASE_CLEARANCE: CafClearance = {
  factor: () => 1,
  elim: (from, to) => (CAF_KE * (to - from)) / HOUR_MS,
}

/** Steady-state clearance factor for `r` cigarettes a day. */
export function cafSmokeTarget(r: number): number {
  return r > 0 ? 1 + (CAF_SMOKE_EMAX * r) / (CAF_SMOKE_EC50 + r) : 1
}

/**
 * Clearance from the user's own cigarettes (epoch ms). The factor moves towards cafSmokeTarget(cigarettes in the
 * last 24 h) with a half-life of 38.6 h. After `now` it stays at its value at `now` (the projection assumes only that
 * no more caffeine is taken). Without cigarettes in the last CAF_SMOKE_WINDOW_DAYS it is CAF_BASE_CLEARANCE.
 */
export function cafSmokingClearance(cigarettes: readonly number[], now: number): CafClearance {
  const cig = cigarettes.filter((t) => t <= now && t > now - CAF_SMOKE_WINDOW_DAYS * 24 * HOUR_MS).sort((a, b) => a - b)
  if (!cig.length) return CAF_BASE_CLEARANCE
  const t0 = cig[0]
  const spanDays = Math.min(CAF_SMOKE_START_AVG_DAYS, Math.max(1, (now - t0) / (24 * HOUR_MS)))
  const r0 = cig.filter((t) => t < t0 + spanDays * 24 * HOUR_MS).length / spanDays
  const m0 = cafSmokeTarget(r0)

  // Grid from t0 to now: factor M and cumulative ∫ M dt (hours).
  const times: number[] = [t0]
  const M: number[] = [m0]
  const cum: number[] = [0]
  let lo = 0 // first cigarette inside the 24-h window
  let hi = 0 // first cigarette after the current time
  for (let t = t0 + SMOKE_STEP_MS; ; t += SMOKE_STEP_MS) {
    const tt = Math.min(t, now)
    while (hi < cig.length && cig[hi] <= tt) hi++
    while (lo < hi && cig[lo] <= tt - 24 * HOUR_MS) lo++
    const r = hi - lo + (r0 * Math.max(0, t0 - (tt - 24 * HOUR_MS))) / (24 * HOUR_MS)
    const target = cafSmokeTarget(r)
    const prevT = times[times.length - 1]
    const prevM = M[M.length - 1]
    const m = target + (prevM - target) * Math.exp((-CAF_SMOKE_KDEG * (tt - prevT)) / HOUR_MS)
    times.push(tt)
    M.push(m)
    cum.push(cum[cum.length - 1] + ((prevM + m) / 2) * ((tt - prevT) / HOUR_MS))
    if (tt >= now) break
  }
  const last = times.length - 1

  // Index of the grid interval holding t (times[i] <= t < times[i + 1]).
  const find = (t: number) => {
    let a = 0
    let b = last
    while (b - a > 1) {
      const mid = (a + b) >> 1
      if (times[mid] <= t) a = mid
      else b = mid
    }
    return a
  }
  const factor = (t: number) => {
    if (t <= t0) return m0
    if (t >= times[last]) return M[last]
    const i = find(t)
    const w = (t - times[i]) / (times[i + 1] - times[i])
    return M[i] + w * (M[i + 1] - M[i])
  }
  // ∫ M dt (hours) from t0 to t; linear M inside an interval.
  const integral = (t: number) => {
    if (t <= t0) return (m0 * (t - t0)) / HOUR_MS
    if (t >= times[last]) return cum[last] + (M[last] * (t - times[last])) / HOUR_MS
    const i = find(t)
    const dt = (t - times[i]) / HOUR_MS
    return cum[i] + ((M[i] + factor(t)) / 2) * dt
  }
  return { factor, elim: (from, to) => CAF_KE * (integral(to) - integral(from)) }
}

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
export function cafAt(entries: readonly CafEntry[], t: number, clearance: CafClearance = CAF_BASE_CLEARANCE): CafPoint {
  let bodyMg = 0
  let gutMg = 0
  for (const e of entries) {
    const at = new Date(e.takenAt).getTime()
    const h = (t - at) / HOUR_MS
    if (h < 0 || h > CAF_MEMORY_H || !(e.amount > 0)) continue
    // Absorption takes about an hour, so it uses the rate at the time of the entry; elimination uses ∫ ke.
    const ke = CAF_KE * clearance.factor(at)
    bodyMg += ((e.amount * CAF_KA) / (CAF_KA - ke)) * (Math.exp(-clearance.elim(at, t)) - Math.exp(-CAF_KA * h))
    gutMg += e.amount * Math.exp(-CAF_KA * h)
  }
  return { t, bodyMg: Math.max(0, bodyMg), gutMg: Math.max(0, gutMg) }
}

/** Points every `stepMin` minutes from `from` to `to` (epoch ms, inclusive). */
export function cafSeries(
  entries: readonly CafEntry[],
  from: number,
  to: number,
  stepMin = 10,
  clearance: CafClearance = CAF_BASE_CLEARANCE,
): CafPoint[] {
  const out: CafPoint[] = []
  for (let t = from; t <= to; t += stepMin * 60_000) out.push(cafAt(entries, t, clearance))
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
export function cafTimeBelow(
  entries: readonly CafEntry[],
  from: number,
  thresholdMg: number,
  stepMin = 5,
  clearance: CafClearance = CAF_BASE_CLEARANCE,
): number | null {
  const past = entries.filter((e) => new Date(e.takenAt).getTime() <= from)
  if (!past.length) return null
  const step = stepMin * 60_000
  let prev = cafAt(past, from, clearance)
  // Still absorbing: the amount rises first, even if it is below the threshold now.
  if (prev.gutMg < 0.5 && prev.bodyMg < thresholdMg) return from
  for (let t = from + step; t <= from + CAF_MEMORY_H * HOUR_MS; t += step) {
    const p = cafAt(past, t, clearance)
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
