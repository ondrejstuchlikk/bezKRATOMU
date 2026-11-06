import { describe, expect, it } from 'vitest'
import { levelPct, pkAt, pkSeries, PK_REF_NM_PER_G_DAY, type PkDose } from './pk'

// Independent check: integrate the model ODEs (docs/pk-model/kratom-pk-model.pdf, eqs. 1–3) with RK4
// from the raw published parameters, and compare with the closed-form constants in pk.ts.
const P = { ka: 1.99, CL: 17.85, Vc: 115.71, Q: 10.76, Vp: 355.64, CLm: 106.29, Vcm: 50.61, Qm: 8.52, Vpm: 71.76, Fm: 0.65 }
const F_REL = 0.2774447728796639
const S_OH = 1.847779726956397
const W = 339 / 34.5
const MG_PER_G = 16 // 1.6 % mitragynine

type State = [number, number, number, number, number] // gut, MG central, MG periph., 7-OH central, 7-OH periph. (mg)

function deriv([g, a1, a2, a3, a4]: State): State {
  const e1 = (P.CL / P.Vc) * a1
  const q1 = (P.Q / P.Vc) * a1 - (P.Q / P.Vp) * a2
  const q2 = (P.Qm / P.Vcm) * a3 - (P.Qm / P.Vpm) * a4
  return [-P.ka * g, P.ka * g - e1 - q1, q1, P.Fm * e1 - (P.CLm / P.Vcm) * a3 - q2, q2]
}

/** State after `hours` for 1 mg MG put in the gut at time 0. */
function integrate(hours: number, dt = 0.002): State {
  let x: State = [1, 0, 0, 0, 0]
  const add = (a: State, b: State, h: number) => a.map((v, i) => v + h * b[i]) as State
  for (let t = 0; t < hours - 1e-9; t += dt) {
    const h = Math.min(dt, hours - t)
    const k1 = deriv(x)
    const k2 = deriv(add(x, k1, h / 2))
    const k3 = deriv(add(x, k2, h / 2))
    const k4 = deriv(add(x, k3, h))
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
