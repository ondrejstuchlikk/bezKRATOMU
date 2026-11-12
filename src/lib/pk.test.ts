import { describe, expect, it } from 'vitest'
import constants from '../../docs/pk-model/ts_constants.json'
import {
  kratomEffectGrams,
  levelPct,
  pkAt,
  pkAverageGramsPerDay,
  pkRangeVariants,
  pkSeries,
  pkTimesBelow,
  pkVariantLevel,
  PK_CENTRAL,
  PK_HEAVY_G_PER_DAY,
  PK_LAMBDA,
  PK_PEAK_NM_PER_G,
  PK_REF_NM_PER_G_DAY,
  PK_VARIANTS,
  type PkDose,
} from './pk'

// Independent check: integrate the model ODEs (docs/pk-model/kratom-pk-model.pdf, eqs. 1–3) with RK4
// from the raw published parameters, and compare with the closed-form constants in pk.ts.
const P = { ka: 1.99, CL: 17.85, Vc: 115.71, Q: 10.76, Vp: 355.64, CLm: 106.29, Vcm: 50.61, Qm: 8.52, Vpm: 71.76, Fm: 0.65 }
const F_REL = 0.2774447728796639
const S_OH = 1.847779726956397
const W = 339 / 34.5
const MG_PER_G = 16 // 1.6 % mitragynine

type State = [number, number, number, number, number] // gut, MG central, MG periph., 7-OH central, 7-OH periph. (mg)

/** Disposition clearances multiplied by `s` (the range variants, report § "Regular and heavy users"). */
function deriv([g, a1, a2, a3, a4]: State, s = 1): State {
  const e1 = ((s * P.CL) / P.Vc) * a1
  const q1 = ((s * P.Q) / P.Vc) * a1 - ((s * P.Q) / P.Vp) * a2
  const q2 = ((s * P.Qm) / P.Vcm) * a3 - ((s * P.Qm) / P.Vpm) * a4
  return [-P.ka * g, P.ka * g - e1 - q1, q1, P.Fm * e1 - ((s * P.CLm) / P.Vcm) * a3 - q2, q2]
}

/** State after `hours` for 1 mg MG put in the gut at time 0. */
function integrate(hours: number, dt = 0.002, s = 1): State {
  let x: State = [1, 0, 0, 0, 0]
  const add = (a: State, b: State, h: number) => a.map((v, i) => v + h * b[i]) as State
  for (let t = 0; t < hours - 1e-9; t += dt) {
    const h = Math.min(dt, hours - t)
    const k1 = deriv(x, s)
    const k2 = deriv(add(x, k1, h / 2), s)
    const k3 = deriv(add(x, k2, h / 2), s)
    const k4 = deriv(add(x, k3, h), s)
    x = x.map((v, i) => v + (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i])) as State
  }
  return x
}

const T0 = Date.UTC(2026, 0, 10, 8, 0)
const H = 3_600_000
const dose = (hoursFromT0: number, grams: number): PkDose => ({ takenAt: new Date(T0 + hoursFromT0 * H).toISOString(), grams })

describe('pk closed form matches the ODE model', () => {
  for (const hours of [0.5, 1, 2, 6, 12, 24, 72, 200]) {
    it(`1 g, ${hours} h after the dose`, () => {
      const x = integrate(hours)
      const cMG = (F_REL * MG_PER_G * 1000 * x[1]) / P.Vc // ng/mL
      const cOH = (S_OH * F_REL * MG_PER_G * 1000 * x[3]) / P.Vcm
      const levelNM = (cMG * 1000) / 398.5 + (W * cOH * 1000) / 414.5
      const p = pkAt([dose(0, 1)], T0 + hours * H)
      expect(p.levelNM).toBeCloseTo(levelNM, 3)
      expect(p.mgMG).toBeCloseTo(MG_PER_G * (x[1] + x[2]), 4)
      expect(p.mgOH).toBeCloseTo(S_OH * MG_PER_G * (x[3] + x[4]), 4)
    })
  }
})

describe('pk behaviour', () => {
  it('is zero before and at the moment of a dose, peaks about 1.7 h later', () => {
    expect(pkAt([dose(0, 1)], T0 - H).levelNM).toBe(0)
    expect(pkAt([dose(0, 1)], T0).levelNM).toBeCloseTo(0, 6)
    const series = pkSeries([dose(0, 1)], T0, T0 + 6 * H, 5)
    const peak = series.reduce((a, b) => (b.levelNM > a.levelNM ? b : a))
    expect((peak.t - T0) / H).toBeCloseTo(1.66, 1)
    expect(peak.levelNM).toBeCloseTo(187.7, 0)
  })

  it('is linear in dose and superposes doses', () => {
    const t = T0 + 5 * H
    const one = pkAt([dose(0, 1)], t)
    const three = pkAt([dose(0, 3)], t)
    expect(three.levelNM).toBeCloseTo(3 * one.levelNM, 9)
    const both = pkAt([dose(0, 1), dose(2, 2)], t)
    expect(both.mgMG).toBeCloseTo(pkAt([dose(0, 1)], t).mgMG + pkAt([dose(2, 2)], t).mgMG, 9)
  })

  it('ignores doses in the future and doses older than 14 days', () => {
    expect(pkAt([dose(1, 5)], T0).levelNM).toBe(0)
    expect(pkAt([dose(-15 * 24, 5)], T0).levelNM).toBe(0)
  })

  it('daily mean is 100 % of the baseline at steady state, however the day is split', () => {
    const baseline = 6
    const splits: [number, number][][] = [
      [[8, 6]],
      [[8, 3], [20, 3]],
      [[8, 2.4], [14, 2.1], [20.5, 1.5]],
    ]
    for (const split of splits) {
      const doses = Array.from({ length: 21 }, (_, d) => split.map(([h, g]) => dose(24 * d + h, g))).flat()
      const day = pkSeries(doses, T0 + 20 * 24 * H, T0 + 21 * 24 * H - 60_000, 1)
      const mean = day.reduce((s, p) => s + p.levelNM, 0) / day.length
      // 14-day memory cuts off < 0.1 % of the tail.
      expect(levelPct(mean, baseline)).toBeGreaterThan(99.5)
      expect(levelPct(mean, baseline)).toBeLessThan(100.5)
    }
  })

  it('6 g/day in three doses: 87–121 mg mitragynine and 3.8–6.8 mg 7-OH on day 14', () => {
    const doses = Array.from({ length: 14 }, (_, d) =>
      [[0, 0.4], [6, 0.35], [12.5, 0.25]].map(([h, f]) => dose(24 * d + h, 6 * f)),
    ).flat()
    const day = pkSeries(doses, T0 + 13 * 24 * H, T0 + 14 * 24 * H, 3)
    const mg = day.map((p) => p.mgMG)
    const oh = day.map((p) => p.mgOH)
    expect(Math.min(...mg)).toBeCloseTo(87, -0.5)
    expect(Math.max(...mg)).toBeCloseTo(121, -0.5)
    expect(Math.min(...oh)).toBeCloseTo(3.8, 0)
    expect(Math.max(...oh)).toBeCloseTo(6.8, 0)
  })

  it('has no percentage without a baseline', () => {
    expect(levelPct(100, null)).toBeNull()
    expect(levelPct(100, 0)).toBeNull()
    expect(levelPct(PK_REF_NM_PER_G_DAY * 4, 4)).toBeCloseTo(100, 9)
  })
})

describe('SQL parity (private.pk_level, supabase/tests/rls_and_scoring.sql)', () => {
  it('gives the same levels as the SQL checks', () => {
    expect(pkAt([dose(0, 1)], T0 + 2 * H).levelNM).toBeCloseTo(184.226, 3)
    expect(pkAt([dose(0, 1)], T0 + 12 * H).levelNM).toBeCloseTo(27.783, 3)
  })
})

describe('pkTimesBelow', () => {
  const STEP = 5 * 60_000
  it('finds when the level falls below each threshold, starting from the coming peak', () => {
    const doses = [dose(0, 1)]
    const peak = 187.68
    // Asked right at the dose: the level is still rising, so the crossing is after the peak.
    const [half, tenth, above] = pkTimesBelow(doses, T0, [peak / 2, peak / 10, peak * 2])
    expect(above).toBeNull()
    for (const [t, thr] of [[half, peak / 2], [tenth, peak / 10]] as const) {
      expect(t).not.toBeNull()
      expect(pkAt(doses, t!).levelNM).toBeLessThan(thr)
      expect(pkAt(doses, t! - STEP).levelNM).toBeGreaterThanOrEqual(thr)
    }
    expect((half! - T0) / H).toBeCloseTo(5.3, 0)
  })

  it('ignores doses after the start ("if you take nothing more") and returns null without doses', () => {
    expect(pkTimesBelow([dose(1, 5)], T0, [1])).toEqual([null])
    const a = pkTimesBelow([dose(0, 1)], T0 + H, [50])
    expect(pkTimesBelow([dose(0, 1), dose(3, 4)], T0 + H, [50])).toEqual(a)
  })
})

describe('kratomEffectGrams', () => {
  it('shows a dose as its grams at its peak, then follows the level', () => {
    expect(PK_PEAK_NM_PER_G).toBeCloseTo(187.68, 1)
    const peakOf3g = Math.max(...pkSeries([dose(0, 3)], T0, T0 + 4 * H, 1).map((p) => kratomEffectGrams(p.levelNM)))
    expect(peakOf3g).toBeCloseTo(3, 2)
    expect(kratomEffectGrams(pkAt([dose(0, 3)], T0 + 6 * H).levelNM)).toBeCloseTo(1.3, 1)
  })
})

describe('uncertainty range (model version 2)', () => {
  const variants = [
    ['fast', PK_VARIANTS.fast, 20],
    ['slow', PK_VARIANTS.slow, 60],
    ['slowHeavy', PK_VARIANTS.slowHeavy, 84],
  ] as const

  it('uses the constants written by docs/pk-model/model.py', () => {
    expect([...PK_LAMBDA]).toEqual(constants.lambda_per_h)
    expect(PK_HEAVY_G_PER_DAY).toBe(constants.heavy_g_per_day)
    for (const [name, v] of variants) {
      expect([...v.lambda]).toEqual(constants.variants[name].lambda_per_h)
      expect([...v.level]).toEqual(constants.variants[name].level_nM_per_g)
      expect(v.ref).toBe(constants.variants[name].R_daily_mean_nM_per_g_per_day)
    }
  })

  for (const [name, v, tHalf] of variants) {
    // Scaling every disposition clearance by s scales the terminal rate constant by s.
    const s = Math.log(2) / tHalf / PK_LAMBDA[0]
    it(`${name}: terminal half-life ${tHalf} h and the closed form matches the scaled ODEs`, () => {
      expect(Math.log(2) / Math.min(...v.lambda)).toBeCloseTo(tHalf, 6)
      for (const hours of [1, 6, 24, 120]) {
        const x = integrate(hours, 0.002, s)
        const cMG = (F_REL * MG_PER_G * 1000 * x[1]) / P.Vc
        const cOH = (S_OH * F_REL * MG_PER_G * 1000 * x[3]) / P.Vcm
        expect(pkVariantLevel(v, [dose(0, 1)], T0 + hours * H)).toBeCloseTo((cMG * 1000) / 398.5 + (W * cOH * 1000) / 414.5, 3)
      }
    })

    it(`${name}: its own reference is the steady-state daily mean at 1 g/day`, () => {
      const doses = Array.from({ length: 30 }, (_, d) => [dose(24 * d + 8, 0.5), dose(24 * d + 20, 0.5)]).flat()
      let sum = 0
      let n = 0
      for (let t = T0 + 29 * 24 * H; t < T0 + 30 * 24 * H; t += 60_000) {
        sum += pkVariantLevel(v, doses, t)
        n++
      }
      // 21-day memory cuts off < 1 % of the slowest variant's tail.
      expect(sum / n / v.ref).toBeGreaterThan(0.99)
      expect(sum / n / v.ref).toBeLessThan(1.001)
    })
  }

  it('after stopping 6 g/day, the level falls below 50 % of the baseline fastest at the fast end (report table)', () => {
    const doses = Array.from({ length: 30 }, (_, d) =>
      [[8, 0.4], [14, 0.35], [20.5, 0.25]].map(([h, f]) => dose(24 * d + h, 6 * f)),
    ).flat()
    const last = T0 + (29 * 24 + 20.5) * H
    const hoursTo50 = (v: typeof PK_CENTRAL) => (pkTimesBelow(doses, last, [0.5 * v.ref * 6], 5, v)[0]! - last) / H
    const [fast, central, slow, heavy] = [PK_VARIANTS.fast, PK_CENTRAL, PK_VARIANTS.slow, PK_VARIANTS.slowHeavy].map(hoursTo50)
    expect(fast).toBeCloseTo(7.1, 0)
    expect(central).toBeCloseTo(10.9, 0)
    expect(slow).toBeCloseTo(15.1, 0)
    expect(heavy).toBeCloseTo(19.7, 0)
  })

  it('central model through the variant helpers equals pkAt', () => {
    const doses = [dose(0, 2), dose(5, 1)]
    expect(pkVariantLevel(PK_CENTRAL, doses, T0 + 9 * H)).toBeCloseTo(pkAt(doses, T0 + 9 * H).levelNM, 9)
  })

  it('averages grams over 14 days, or since the first dose when the history is shorter', () => {
    const t = T0 + (29 * 24 + 12) * H
    const steady = Array.from({ length: 30 }, (_, d) => dose(24 * d, 10)) // 14 of them in the last 14 days
    expect(pkAverageGramsPerDay(steady, t)).toBeCloseTo(10, 9)
    const fresh = [dose(27.5 * 24, 15), dose(28.5 * 24, 15)] // first dose two days ago
    expect(pkAverageGramsPerDay(fresh, t)).toBeCloseTo(15, 9)
    expect(pkAverageGramsPerDay([dose(31 * 24, 50)], t)).toBe(0) // future doses don't count
  })

  it('extends the slow end above 12 g/day', () => {
    expect(pkRangeVariants(12).slow).toBe(PK_VARIANTS.slow)
    expect(pkRangeVariants(12.1).slow).toBe(PK_VARIANTS.slowHeavy)
    expect(pkRangeVariants(30).fast).toBe(PK_VARIANTS.fast)
  })
})
