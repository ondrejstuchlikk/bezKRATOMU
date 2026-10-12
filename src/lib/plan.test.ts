import { describe, expect, it } from 'vitest'
import { buildPlanDays, generatePlan, groupPlanSteps, limitOn, validatePlan, type PlanParams } from './plan'

const isNonIncreasing = (xs: number[]) => xs.every((x, i) => i === 0 || x <= xs[i - 1])

function checkInvariants(p: PlanParams) {
  const limits = generatePlan(p)
  expect(limits).toHaveLength(p.durationDays + 1)
  expect(limits[0]).toBe(p.baselineG)
  expect(limits[limits.length - 1]).toBe(p.targetG)
  expect(limits.every(Number.isInteger)).toBe(true)
  expect(isNonIncreasing(limits)).toBe(true)
  // The target is reached only on the last day.
  expect(limits.slice(0, -1).every((l) => l > p.targetG)).toBe(true)
  return limits
}

describe('generatePlan', () => {
  it('handles baseline 1 → 0', () => {
    expect(checkInvariants({ baselineG: 1, targetG: 0, durationDays: 14, curve: 'decelerating' })).toEqual([
      1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0,
    ])
    expect(checkInvariants({ baselineG: 1, targetG: 0, durationDays: 1, curve: 'linear' })).toEqual([1, 0])
  })

  it('handles baseline 50 → 0 in 5 days', () => {
    expect(checkInvariants({ baselineG: 50, targetG: 0, durationDays: 5, curve: 'linear' })).toEqual([
      50, 40, 30, 20, 10, 0,
    ])
    expect(checkInvariants({ baselineG: 50, targetG: 0, durationDays: 5, curve: 'decelerating' })).toEqual([
      50, 32, 18, 8, 2, 0,
    ])
  })

  it('handles baseline 3 → 0 in 84 days with plateaus', () => {
    const limits = checkInvariants({ baselineG: 3, targetG: 0, durationDays: 84, curve: 'decelerating' })
    expect(groupPlanSteps(limits)).toEqual([
      { fromDay: 0, toDay: 15, limitG: 3 },
      { fromDay: 16, toDay: 35, limitG: 2 },
      { fromDay: 36, toDay: 83, limitG: 1 },
      { fromDay: 84, toDay: 84, limitG: 0 },
    ])
    checkInvariants({ baselineG: 3, targetG: 0, durationDays: 84, curve: 'linear' })
  })

  it('supports a maintenance target above zero', () => {
    const limits = checkInvariants({ baselineG: 20, targetG: 5, durationDays: 28, curve: 'decelerating' })
    expect(limits[1]).toBe(19)
    checkInvariants({ baselineG: 20, targetG: 5, durationDays: 28, curve: 'linear' })
  })

  it('front-loads the drops with the decelerating curve', () => {
    const lin = generatePlan({ baselineG: 40, targetG: 0, durationDays: 28, curve: 'linear' })
    const dec = generatePlan({ baselineG: 40, targetG: 0, durationDays: 28, curve: 'decelerating' })
    expect(dec[7]).toBeLessThan(lin[7])
    expect(dec[0] - dec[7]).toBeGreaterThan(dec[21] - dec[28])
  })

  it('keeps invariants across many combinations', () => {
    for (const baselineG of [1, 2, 7, 30, 120, 300])
      for (const durationDays of [1, 5, 14, 28, 56, 84, 365])
        for (const curve of ['linear', 'decelerating'] as const)
          for (const targetG of [0, Math.floor(baselineG / 2)])
            if (targetG < baselineG) checkInvariants({ baselineG, targetG, durationDays, curve })
  })

  it('rejects invalid input', () => {
    expect(validatePlan({ baselineG: 10, targetG: 10, durationDays: 14, curve: 'linear' })).toBe('invalid_target')
    expect(validatePlan({ baselineG: 0, targetG: 0, durationDays: 14, curve: 'linear' })).toBe('invalid_baseline')
    expect(validatePlan({ baselineG: 10.5, targetG: 0, durationDays: 14, curve: 'linear' })).toBe('invalid_baseline')
    expect(validatePlan({ baselineG: 10, targetG: 0, durationDays: 0, curve: 'linear' })).toBe('invalid_duration')
    expect(() => generatePlan({ baselineG: 5, targetG: 5, durationDays: 5, curve: 'linear' })).toThrow()
  })
})

describe('buildPlanDays', () => {
  const plan = {
    id: 'p1',
    baselineG: 10,
    targetG: 0,
    durationDays: 5,
    curve: 'linear' as const,
    startDate: '2026-03-27',
    endedOn: null,
  }

  it('writes one row per day without pauses', () => {
    const days = buildPlanDays(plan, [])
    expect(days.map((d) => [d.date, d.limitG])).toEqual([
      ['2026-03-27', 10],
      ['2026-03-28', 8],
      ['2026-03-29', 6],
      ['2026-03-30', 4],
      ['2026-03-31', 2],
      ['2026-04-01', 0],
    ])
  })

  it('shifts the schedule by a closed pause', () => {
    const days = buildPlanDays(plan, [{ startDate: '2026-03-28', endDate: '2026-03-29' }])
    expect(days.map((d) => [d.date, d.limitG, d.isPaused])).toEqual([
      ['2026-03-27', 10, false],
      ['2026-03-28', 8, true],
      ['2026-03-29', 8, true],
      ['2026-03-30', 8, false],
      ['2026-03-31', 6, false],
      ['2026-04-01', 4, false],
      ['2026-04-02', 2, false],
      ['2026-04-03', 0, false],
    ])
  })

  it('holds the limit indefinitely during an open pause', () => {
    const days = buildPlanDays(plan, [{ startDate: '2026-03-29', endDate: null }])
    expect(days.map((d) => [d.date, d.limitG, d.isPaused])).toEqual([
      ['2026-03-27', 10, false],
      ['2026-03-28', 8, false],
      ['2026-03-29', 6, true],
    ])
    expect(limitOn(days, '2026-05-01')).toMatchObject({ limitG: 6, isPaused: true })
  })

  it('stops at the replacement date and keeps the target after the end', () => {
    expect(buildPlanDays({ ...plan, endedOn: '2026-03-29' }, []).map((d) => d.date)).toEqual([
      '2026-03-27',
      '2026-03-28',
    ])
    const days = buildPlanDays(plan, [])
    expect(limitOn(days, '2026-12-24')?.limitG).toBe(0)
    expect(limitOn(days, '2026-03-26')).toBeNull()
  })
})
