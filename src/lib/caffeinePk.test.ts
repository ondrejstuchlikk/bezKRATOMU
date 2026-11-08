// Pins the model to the check values written by docs/caffeine-pk-model/model.py (ts_constants.json).
import { describe, expect, it } from 'vitest'
import constants from '../../docs/caffeine-pk-model/ts_constants.json'
import { cafAt, cafCups, cafSleepRefMg, cafTimeBelow, CAF_KA, CAF_KE, CAF_SLEEP_REF_MG_PER_KG, CAF_V_L_PER_KG, nextClockTime } from './caffeinePk'
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
