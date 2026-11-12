// Rough pharmacokinetic estimate of kratom alkaloids in the body (mitragynine + 7-hydroxymitragynine).
//
// Linked parent→metabolite two-compartment model (Notario et al. 2026), calibrated to oral leaf powder
// (Huestis et al. 2024) for a powder with 1.6 % mitragynine. The model is linear, so each dose adds a
// fixed sum of exponentials. The derivation, sources, validation and limits are in
// docs/pk-model/kratom-pk-model.pdf; the constants below are copied from docs/pk-model/ts_constants.json
// (written by docs/pk-model/model.py). Population average for an adult (~70 kg), not a measurement.
// Model version 2 (2026-11-12) keeps the central curve and adds faster/slower variants (PK_VARIANTS) that give the
// range shown for the projection; the report's "Regular and heavy users" section explains the data behind them.

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

function unitResponse(coef: readonly number[], hours: number, lambda: readonly number[] = PK_LAMBDA): number {
  let sum = 0
  for (let k = 0; k < lambda.length; k++) sum += coef[k] * Math.exp(-lambda[k] * hours)
  return sum
}

// --- Uncertainty range (model version 2, "Regular and heavy users" in the report) ---------------------------
// The same model with every disposition clearance scaled so that the terminal half-life is 20 h (fast end) or
// 60 h (slow end; 84 h for heavy users) instead of the central 38.5 h. Each variant has its own steady-state
// reference, so "50 %" always means half of that variant's usual level: on a steady routine all variants agree,
// and they spread out when intake changes (e.g. how fast the level falls after a smaller day or a stop).

export interface PkVariant {
  /** Rate constants (1/h). */
  lambda: readonly number[]
  /** Combined index E (nM) per gram of powder. */
  level: readonly number[]
  /** Steady-state daily mean of E (nM) at 1 g/day (this variant's PK_REF_NM_PER_G_DAY). */
  ref: number
}

export const PK_VARIANTS = {
  fast: {
    lambda: [0.034657359027997214, 0.21096521595028772, 0.5001415378096337, 1.99, 4.3895679257788816],
    level: [14.68423273343754, 10.616727337289507, 349.13706021710294, -531.2099695739064, 156.7719492860765],
    ref: 39.20305951830047,
  },
  slow: {
    lambda: [0.011552453009332442, 0.07032173865009628, 0.16671384593654454, 1.4631893085929604, 1.99],
    level: [14.512745843235011, 9.838902490112106, 285.28972397967067, -714.07992909932, 404.43855678630234],
    ref: 117.6091785549013,
  },
  slowHeavy: {
    lambda: [0.008251752149523159, 0.05022981332149723, 0.11908131852610325, 1.0451352204235436, 1.99],
    level: [14.488574138915377, 9.736992224914516, 278.02640958127364, -398.13627230060365, 95.88429635550018],
    ref: 164.65284997686175,
  },
} as const satisfies Record<string, PkVariant>

/** Above this 14-day average (g/day) there are no human data; the slow end of the range is extended. */
export const PK_HEAVY_G_PER_DAY = 12

/** The slow variants keep doses longer (a 14-day cut would drop up to 2.8 % of the 84 h variant's exposure). */
export const PK_VARIANT_MEMORY_DAYS = 21

/** The central model as a variant, so the helpers below work for all of them. */
export const PK_CENTRAL: PkVariant = { lambda: PK_LAMBDA, level: LEVEL_NM_PER_G, ref: PK_REF_NM_PER_G_DAY }

/** Fast and slow ends of the range for a user with the given 14-day average (g/day). */
export function pkRangeVariants(avgGramsPerDay: number): { fast: PkVariant; slow: PkVariant } {
  return { fast: PK_VARIANTS.fast, slow: avgGramsPerDay > PK_HEAVY_G_PER_DAY ? PK_VARIANTS.slowHeavy : PK_VARIANTS.slow }
}

/** Combined index E (nM) of a variant at `t`; same rules as pkAt (future doses ignored), memory depends on the variant. */
export function pkVariantLevel(variant: PkVariant, doses: readonly PkDose[], t: number): number {
  const memoryH = (variant === PK_CENTRAL ? PK_MEMORY_DAYS : PK_VARIANT_MEMORY_DAYS) * 24
  let level = 0
  for (const d of doses) {
    const hours = (t - new Date(d.takenAt).getTime()) / HOUR_MS
    if (hours < 0 || hours > memoryH || !(d.grams > 0)) continue
    level += d.grams * unitResponse(variant.level, hours, variant.lambda)
  }
  return Math.max(0, level)
}

/** Peak of a variant's E after 1 g (nM), found numerically. */
export function pkVariantPeak(variant: PkVariant): number {
  let best = 0
  for (let i = 0; i <= 8000; i++) best = Math.max(best, unitResponse(variant.level, i / 1000, variant.lambda))
  return best
}

/**
 * Average grams per day over the 14 days before `t`. For someone with a shorter history (first dose less than 14 days
 * ago), the days since their first dose are used instead, so a new heavy user is not averaged down.
 */
export function pkAverageGramsPerDay(doses: readonly PkDose[], t: number): number {
  const day = 24 * HOUR_MS
  let grams = 0
  let earliest = t
  for (const d of doses) {
    const at = new Date(d.takenAt).getTime()
    if (at > t) continue
    earliest = Math.min(earliest, at)
    if (at > t - 14 * day && d.grams > 0) grams += d.grams
  }
  const days = Math.min(14, Math.max(1, (t - earliest) / day))
  return grams / days
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
export function pkTimesBelow(
  doses: readonly PkDose[],
  from: number,
  thresholdsNM: readonly number[],
  stepMin = 5,
  variant: PkVariant = PK_CENTRAL,
): (number | null)[] {
  const past = doses.filter((d) => new Date(d.takenAt).getTime() <= from)
  const out: (number | null)[] = thresholdsNM.map(() => null)
  if (!past.length) return out
  const step = stepMin * 60_000
  const end = from + (variant === PK_CENTRAL ? PK_MEMORY_DAYS : PK_VARIANT_MEMORY_DAYS) * 24 * HOUR_MS
  let prev = pkVariantLevel(variant, past, from)
  let peak = prev
  let falling = false
  for (let t = from + step; t <= end; t += step) {
    const level = pkVariantLevel(variant, past, t)
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
