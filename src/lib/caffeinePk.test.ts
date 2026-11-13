// Pins the model to the check values written by docs/caffeine-pk-model/model.py (ts_constants.json).
import { describe, expect, it } from 'vitest'
import constants from '../../docs/caffeine-pk-model/ts_constants.json'
import {
  CAF_BASE_CLEARANCE,
  CAF_KA,
  CAF_KE,
  CAF_SLEEP_REF_MG_PER_KG,
  CAF_SMOKE_EC50,
  CAF_SMOKE_EMAX,
  CAF_SMOKE_KDEG,
  CAF_SMOKE_START_AVG_DAYS,
  CAF_SMOKE_WINDOW_DAYS,
  CAF_V_L_PER_KG,
  cafAt,
  cafCups,
  cafSleepRefMg,
  cafSmokeTarget,
  cafSmokingClearance,
  cafTimeBelow,
  nextClockTime,
} from './caffeinePk'
import { pragueLocalToInstant } from './time'

const H = 3_600_000
const t0 = Date.UTC(2026, 10, 8, 8, 0)
const dose = (mg: number, hoursAfterT0 = 0) => ({ takenAt: new Date(t0 + hoursAfterT0 * H).toISOString(), amount: mg })

describe('caffeine model', () => {
  it('uses the constants from the report', () => {
    expect(CAF_KA).toBe(constants.KA_PER_H)
    expect(CAF_KE).toBe(constants.KE_PER_H)
    expect(CAF_V_L_PER_KG).toBe(constants.V_L_PER_KG)
    expect(CAF_SLEEP_REF_MG_PER_KG).toBe(constants.SLEEP_REF_MG_PER_KG)
  })

  it('matches the check values of model.py', () => {
    const c = constants.check_values
    expect(cafAt([dose(150)], t0 + 1 * H).bodyMg).toBeCloseTo(c['150mg_after_1h'], 1)
    expect(cafAt([dose(150)], t0 + 6 * H).bodyMg).toBeCloseTo(c['150mg_after_6h'], 1)
    expect(cafAt([dose(150)], t0 + 12 * H).bodyMg).toBeCloseTo(c['150mg_after_12h'], 1)
    expect(cafAt([dose(150)], t0 + 0.5 * H).gutMg).toBeCloseTo(c['gut_150mg_after_0.5h'], 1)
  })

  it('adds entries up and ignores future and very old ones', () => {
    const one = cafAt([dose(150)], t0 + 3 * H).bodyMg
    expect(cafAt([dose(150), dose(150)], t0 + 3 * H).bodyMg).toBeCloseTo(2 * one, 6)
    expect(cafAt([dose(150), dose(75, 5)], t0 + 3 * H).bodyMg).toBeCloseTo(one, 6)
    expect(cafAt([dose(150, -80)], t0).bodyMg).toBe(0)
    expect(cafAt([dose(150)], t0).bodyMg).toBe(0)
    expect(cafAt([dose(150)], t0).gutMg).toBe(150)
  })

  it('scales the sleep reference with weight and converts to cups', () => {
    expect(cafSleepRefMg(null)).toBeCloseTo(36.37, 1)
    expect(cafSleepRefMg(100)).toBeCloseTo(51.96, 1)
    expect(cafCups(150)).toBe(1.5)
  })

  it('finds when the amount falls below a level, after the coming peak', () => {
    // 150 mg falls below the 70 kg reference about 10.9 h later (report, section 7.1).
    const t = cafTimeBelow([dose(150)], t0 + 0.1 * H, cafSleepRefMg(70))!
    expect((t - t0) / H).toBeGreaterThan(10.7)
    expect((t - t0) / H).toBeLessThan(11.1)
    // Already low and fully absorbed: now.
    expect(cafTimeBelow([dose(20)], t0 + 3 * H, 36)).toBe(t0 + 3 * H)
    // Nothing taken.
    expect(cafTimeBelow([], t0, 36)).toBeNull()
  })

  it('finds the next bedtime', () => {
    const evening = pragueLocalToInstant('2026-11-08', '21:00').getTime()
    expect(nextClockTime(evening, '23:00')).toBe(pragueLocalToInstant('2026-11-08', '23:00').getTime())
    const late = pragueLocalToInstant('2026-11-08', '23:30').getTime()
    expect(nextClockTime(late, '23:00')).toBe(pragueLocalToInstant('2026-11-09', '23:00').getTime())
    const night = pragueLocalToInstant('2026-11-08', '21:00').getTime()
    expect(nextClockTime(night, '00:30')).toBe(pragueLocalToInstant('2026-11-09', '00:30').getTime())
  })
})

describe('smoking (model version 2)', () => {
  const sm = constants.smoking
  const c = sm.check_values
  // Scenario of model.py: 20 cigarettes a day 7:00–22:00 on days 0–13, then none; caffeine 150 mg at 8:00 and 14:00
  // on day 13 (smoking) and day 15 (quitting). Hours from day 0, 0:00.
  const at = (h: number) => t0 + h * H
  const cigs = Array.from({ length: 14 * 20 }, (_, i) => at(Math.floor(i / 20) * 24 + 7 + ((i % 20) * 15) / 19))
  const coffee = [13 * 24 + 8, 13 * 24 + 14, 15 * 24 + 8, 15 * 24 + 14].map((h) => ({ takenAt: new Date(at(h)).toISOString(), amount: 150 }))
  const now = at(21 * 24)
  const clearance = cafSmokingClearance(cigs, now)

  it('uses the constants from the report', () => {
    expect(CAF_SMOKE_EMAX).toBe(sm.EMAX)
    expect(CAF_SMOKE_EC50).toBe(sm.EC50_CIG_PER_DAY)
    expect(CAF_SMOKE_KDEG).toBe(sm.KDEG_PER_H)
    expect(CAF_SMOKE_WINDOW_DAYS).toBe(sm.WINDOW_DAYS)
    expect(CAF_SMOKE_START_AVG_DAYS).toBe(sm.START_AVG_DAYS)
    expect(cafSmokeTarget(10)).toBeCloseTo(c.M_target_10, 3)
    expect(cafSmokeTarget(20)).toBeCloseTo(c.M_target_20, 3)
    expect(cafSmokeTarget(0)).toBe(1)
  })

  it('follows smoking and quitting like model.py', () => {
    expect(clearance.factor(at(13 * 24 + 23))).toBeCloseTo(c.M_day13_23h, 2)
    expect(clearance.factor(at(16 * 24))).toBeCloseTo(c.M_day16_0h, 2)
    expect(clearance.factor(at(21 * 24))).toBeCloseTo(c.M_day21_0h, 2)
    // Before the first cigarette: as in the first week.
    expect(clearance.factor(at(-48))).toBeCloseTo(c.M_target_20, 2)
  })

  it('matches the caffeine check values of model.py', () => {
    expect(cafAt(coffee, at(13 * 24 + 20), clearance).bodyMg).toBeCloseTo(c.body_day13_20h, 0)
    expect(cafAt(coffee, at(15 * 24 + 20), clearance).bodyMg).toBeCloseTo(c.body_day15_20h, 0)
    expect(cafAt(coffee, at(13 * 24 + 23), clearance).bodyMg).toBeCloseTo(c.body_day13_23h, 0)
  })

  it('keeps the factor after now and ignores old histories', () => {
    const mid = at(13 * 24 + 12)
    const cl = cafSmokingClearance(cigs, mid)
    expect(cl.factor(mid + 10 * H)).toBeCloseTo(cl.factor(mid), 6)
    expect(cl.elim(mid, mid + 5 * H)).toBeCloseTo(CAF_KE * cl.factor(mid) * 5, 6)
    // No cigarettes, or only ones older than the window: exactly version 1.
    expect(cafSmokingClearance([], now)).toBe(CAF_BASE_CLEARANCE)
    expect(cafSmokingClearance(cigs, at(14 * 24 + CAF_SMOKE_WINDOW_DAYS * 24))).toBe(CAF_BASE_CLEARANCE)
    // Cigarettes after now don't count yet.
    expect(cafSmokingClearance(cigs, at(-1))).toBe(CAF_BASE_CLEARANCE)
  })

  it('makes the caffeine disappear faster for a smoker', () => {
    const base = cafAt(coffee, at(13 * 24 + 23)).bodyMg
    const smoker = cafAt(coffee, at(13 * 24 + 23), clearance).bodyMg
    expect(smoker).toBeLessThan(base / 2)
    const tBase = cafTimeBelow(coffee.slice(0, 2), at(13 * 24 + 15), 36)!
    const tSmoker = cafTimeBelow(coffee.slice(0, 2), at(13 * 24 + 15), 36, 5, clearance)!
    expect(tSmoker).toBeLessThan(tBase)
  })
})

describe('drinking time', () => {
  const c = constants.drink_time.check_values
  const sip = (mg: number, minutes: number, hoursAfterT0 = 0) => ({ ...dose(mg, hoursAfterT0), minutes })

  it('matches the check values of model.py', () => {
    expect(cafAt([sip(150, 60)], t0 + 0.5 * H).bodyMg).toBeCloseTo(c['150mg_60min_after_0.5h'], 1)
    expect(cafAt([sip(150, 60)], t0 + 1 * H).bodyMg).toBeCloseTo(c['150mg_60min_after_1h'], 1)
    expect(cafAt([sip(150, 60)], t0 + 6 * H).bodyMg).toBeCloseTo(c['150mg_60min_after_6h'], 1)
    expect(cafAt([sip(150, 60)], t0 + 12 * H).bodyMg).toBeCloseTo(c['150mg_60min_after_12h'], 1)
    expect(cafAt([sip(150, 60)], t0 + 0.5 * H).gutMg).toBeCloseTo(c['gut_150mg_60min_after_0.5h'], 1)
    expect(cafAt([sip(150, 60)], t0 + 0.5 * H).undrunkMg).toBeCloseTo(c['undrunk_150mg_60min_after_0.5h'], 6)
  })

  it('is the single dose for 0 minutes and close to it for very short drinking', () => {
    for (const h of [0.3, 1, 6]) {
      const once = cafAt([dose(150)], t0 + h * H).bodyMg
      expect(cafAt([sip(150, 0)], t0 + h * H).bodyMg).toBe(once)
      expect(cafAt([sip(150, 0.01)], t0 + h * H).bodyMg).toBeCloseTo(once, 1)
    }
    expect(cafAt([sip(150, 30)], t0).undrunkMg).toBe(150)
    expect(cafAt([sip(150, 30)], t0 + 1 * H).undrunkMg).toBe(0)
  })

  it('keeps counting a drink that is still being sipped in the projection', () => {
    // 20 mg sipped over an hour, 10 min in: still rising, so not "below already" but after the coming peak.
    const from = t0 + (10 / 60) * H
    expect(cafTimeBelow([sip(20, 60)], from, 36)!).toBeGreaterThan(t0 + 1 * H)
    expect(cafTimeBelow([sip(200, 60)], from, 36)!).toBeGreaterThan(cafTimeBelow([dose(200)], from, 36)!)
  })

  it('matches model.py with smoking', () => {
    const at = (h: number) => t0 + h * H
    const cigs = Array.from({ length: 14 * 20 }, (_, i) => at(Math.floor(i / 20) * 24 + 7 + ((i % 20) * 15) / 19))
    const coffee = [13 * 24 + 8, 13 * 24 + 14, 15 * 24 + 8, 15 * 24 + 14].map((h) => ({
      takenAt: new Date(at(h)).toISOString(),
      amount: 150,
      minutes: 60,
    }))
    const clearance = cafSmokingClearance(cigs, at(21 * 24))
    expect(cafAt(coffee, at(13 * 24 + 20), clearance).bodyMg).toBeCloseTo(c.smoking_scenario_60min_body_day13_20h, 0)
    expect(cafAt(coffee, at(15 * 24 + 20), clearance).bodyMg).toBeCloseTo(c.smoking_scenario_60min_body_day15_20h, 0)
  })
})
