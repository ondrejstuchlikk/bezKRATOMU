// Rough pharmacokinetic estimate of kratom alkaloids in the body (mitragynine + 7-hydroxymitragynine).
//
// Linked parent→metabolite two-compartment model (Notario et al. 2026), calibrated to oral leaf powder
// (Huestis et al. 2024) for a powder with 1.6 % mitragynine. The model is linear, so each dose adds a
// fixed sum of exponentials. The derivation, sources, validation and limits are in
// docs/pk-model/kratom-pk-model.pdf; the constants below are copied from docs/pk-model/ts_constants.json
// (written by docs/pk-model/model.py). Population average for an adult (~70 kg), not a measurement.

/** Rate constants λ_k (1/h) of the five exponentials. */
export const PK_LAMBDA = [0.01798397824138001, 0.10947152234747914, 0.2595274073339729, 1.99, 2.277781581755706] as const

/** Combined MOR-weighted index E (nM) per gram of powder: Σ c_k e^(−λ_k τ). */
const LEVEL_NM_PER_G = [14.560077654968358, 10.043733689897083, 300.59118291341076, -1632.3840745102586, 1307.1890802519817]

/** Steady-state daily mean of E (nM) when taking 1 g/day, however it is split. 100 % = this × baseline. */
export const PK_REF_NM_PER_G_DAY = 75.5490164830535

/** Mitragynine still in the body (mg) per gram of powder, assuming complete absorption (upper estimate). */
const MG_MG_PER_G = [7.036242566331531, 0, 10.38122013740629, -17.417462703737822, 0]

/** 7-hydroxymitragynine still in the body (mg) per gram of powder, same assumption. */
const OH_MG_PER_G = [0.19781456343650616, 1.4827018282530364, -0.294343369948653, -10.66057949876085, 9.27440647701996]

/** Doses older than this contribute < 0.02 % of their peak and are ignored. */
export const PK_MEMORY_DAYS = 14

const HOUR_MS = 3_600_000

export interface PkDose {
  /** ISO instant. */
  takenAt: string
  grams: number
}

export interface PkPoint {
  /** Epoch milliseconds. */
  t: number
  /** Combined index E in nM (relative scale: see levelPct). */
  levelNM: number
  /** mg of mitragynine still in the body. */
  mgMG: number
  /** mg of 7-hydroxymitragynine still in the body. */
  mgOH: number
}

function unitResponse(coef: readonly number[], hours: number): number {
  let sum = 0
  for (let k = 0; k < PK_LAMBDA.length; k++) sum += coef[k] * Math.exp(-PK_LAMBDA[k] * hours)
  return sum
}

/**
 * Model state at time `t` (epoch ms) from the given doses. Doses after `t` are ignored
 * (a dose logged ahead of time counts once its time comes), as are doses older than PK_MEMORY_DAYS.
 */
export function pkAt(doses: readonly PkDose[], t: number): PkPoint {
  let levelNM = 0
  let mgMG = 0
  let mgOH = 0
  for (const d of doses) {
    const hours = (t - new Date(d.takenAt).getTime()) / HOUR_MS
    if (hours < 0 || hours > PK_MEMORY_DAYS * 24 || !(d.grams > 0)) continue
    levelNM += d.grams * unitResponse(LEVEL_NM_PER_G, hours)
    mgMG += d.grams * unitResponse(MG_MG_PER_G, hours)
    mgOH += d.grams * unitResponse(OH_MG_PER_G, hours)
  }
  // Clamp tiny negative rounding at τ = 0.
  return { t, levelNM: Math.max(0, levelNM), mgMG: Math.max(0, mgMG), mgOH: Math.max(0, mgOH) }
}

/** Points every `stepMin` minutes from `from` to `to` (epoch ms, inclusive). */
export function pkSeries(doses: readonly PkDose[], from: number, to: number, stepMin = 10): PkPoint[] {
  const out: PkPoint[] = []
  const step = stepMin * 60_000
  for (let t = from; t <= to; t += step) out.push(pkAt(doses, t))
  return out
}

/** Level as % of the steady-state daily mean at the plan baseline (g/day); null without a baseline. */
export function levelPct(levelNM: number, baselineG: number | null | undefined): number | null {
  if (!baselineG || baselineG <= 0) return null
  return (100 * levelNM) / (PK_REF_NM_PER_G_DAY * baselineG)
}

/**
 * Projection "if you take nothing more": for each threshold (nM), the first moment after `from` at which the
 * level, past its coming peak, falls below it. Only doses up to `from` count. null when the threshold is not
 * below the peak, or not reached within PK_MEMORY_DAYS. Times are on a `stepMin` grid.
 */
export function pkTimesBelow(doses: readonly PkDose[], from: number, thresholdsNM: readonly number[], stepMin = 5): (number | null)[] {
  const past = doses.filter((d) => new Date(d.takenAt).getTime() <= from)
  const out: (number | null)[] = thresholdsNM.map(() => null)
  if (!past.length) return out
  const step = stepMin * 60_000
  const end = from + PK_MEMORY_DAYS * 24 * HOUR_MS
  let prev = pkAt(past, from).levelNM
  let peak = prev
  let falling = false
  for (let t = from + step; t <= end; t += step) {
    const level = pkAt(past, t).levelNM
    if (!falling && level < prev) falling = true
    if (!falling) peak = Math.max(peak, level)
    if (falling) {
      thresholdsNM.forEach((thr, i) => {
        if (out[i] === null && thr < peak && level < thr) out[i] = t
      })
      if (out.every((v, i) => v !== null || !(thresholdsNM[i] < peak))) break
    }
    prev = level
  }
  return out
}

/** Peak of the combined index after 1 g of powder (nM, about 1.7 h after the dose); found numerically once. */
export const PK_PEAK_NM_PER_G = (() => {
  let best = 0
  for (let i = 0; i <= 6000; i++) best = Math.max(best, unitResponse(LEVEL_NM_PER_G, i / 1000))
  return best
})()

/**
 * "Kratom by effect": the combined level expressed in grams of powder, scaled so that a single 1 g dose shows
 * 1 g at its peak. Not an amount of powder in the body – it follows the level (and the % line) exactly.
 */
export function kratomEffectGrams(levelNM: number): number {
  return levelNM / PK_PEAK_NM_PER_G
}
