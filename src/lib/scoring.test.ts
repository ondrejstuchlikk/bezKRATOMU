import { describe, expect, it } from 'vitest'
import { computeDays, computeStats } from './days'
import { applyStreakBonus, metBasePoints, missedPenalty, overPenalty, scoreDay } from './scoring'

const fresh = { streak: 0, missedRun: 0 }

describe('daily points', () => {
  it('gives +10 plus up to +5 for staying below the limit', () => {
    expect(metBasePoints(1000, 10)).toBe(10) // exactly at the limit
    expect(metBasePoints(500, 10)).toBe(13) // 5 · 0.5 = 2.5 → 3
    expect(metBasePoints(0, 10)).toBe(15)
    expect(metBasePoints(0, 0)).toBe(15) // L = 0 and A = 0
    expect(metBasePoints(100, 1.5)).toBe(12) // half-gram limit: 5 · 0.5 / 1.5 = 1.67 → 2
  })

  it('penalizes going over relative to the baseline, between −1 and −20', () => {
    expect(overPenalty(1050, 10, 40)).toBe(-1) // 100 · 0.5 / 40 = 1.25 → 1
    expect(overPenalty(1001, 10, 40)).toBe(-1) // minimum penalty
    expect(overPenalty(1500, 10, 40)).toBe(-13) // 12.5 → 13
    expect(overPenalty(5000, 10, 40)).toBe(-20) // capped
    expect(overPenalty(200, 0, 10)).toBe(-20) // works when L = 0
    expect(overPenalty(250, 1.5, 2.5)).toBe(-20) // 1 g over a 2.5 g baseline = 40 % → capped
    expect(overPenalty(155, 1.5, 12.5)).toBe(-1) // 0.05 g over 12.5 g = 0.4 % → minimum
  })

  it('grades consecutive missed days and caps at −40', () => {
    expect([1, 2, 3, 4, 5, 6].map(missedPenalty)).toEqual([-20, -25, -30, -35, -40, -40])
  })

  it('never makes a missed day better than a logged bad day', () => {
    expect(missedPenalty(1)).toBeLessThanOrEqual(overPenalty(100000, 1, 1))
  })

  it('adds +10 % per full week of streak, capped at +50 %', () => {
    expect(applyStreakBonus(15, 6)).toBe(15)
    expect(applyStreakBonus(15, 7)).toBe(17) // 16.5 → 17
    expect(applyStreakBonus(10, 14)).toBe(12)
    expect(applyStreakBonus(10, 70)).toBe(15)
    expect(applyStreakBonus(-5, 70)).toBe(-5)
  })
})

describe('scoreDay', () => {
  const base = { limitG: 10, baselineG: 20, isToday: false }

  it('treats an unlogged today as pending without touching the streak', () => {
    const r = scoreDay({ ...base, totalCg: 0, logged: false, isToday: true }, { streak: 3, missedRun: 0 })
    expect(r).toEqual({ status: 'pending', points: 0, state: { streak: 3, missedRun: 0 } })
  })

  it('resets the streak on over and missed days', () => {
    expect(scoreDay({ ...base, totalCg: 1200, logged: true }, { streak: 5, missedRun: 0 }).state.streak).toBe(0)
    const missed = scoreDay({ ...base, totalCg: 0, logged: false }, { streak: 5, missedRun: 1 })
    expect(missed).toEqual({ status: 'missed', points: -25, state: { streak: 0, missedRun: 2 } })
  })

  it('counts an explicit zero day as met', () => {
    expect(scoreDay({ ...base, totalCg: 0, logged: true }, fresh)).toMatchObject({ status: 'met', points: 15 })
  })
})

describe('computeDays + computeStats', () => {
  it('evaluates a short history', () => {
    const planDays = [
      { date: '2026-10-01', planId: 'p', limitG: 10, isPaused: false },
      { date: '2026-10-02', planId: 'p', limitG: 8, isPaused: false },
      { date: '2026-10-03', planId: 'p', limitG: 6, isPaused: false },
    ]
    const activity = new Map([
      ['2026-10-01', { totalCg: 1000, doseCount: 2, zeroDay: false }],
      ['2026-10-02', { totalCg: 900, doseCount: 1, zeroDay: false }],
      ['2026-10-04', { totalCg: 300, doseCount: 1, zeroDay: false }],
    ])
    const rows = computeDays(planDays, new Map([['p', 10]]), activity, '2026-10-06')
    expect(rows.map((r) => [r.date, r.limitG, r.status, r.points])).toEqual([
      ['2026-10-01', 10, 'met', 10],
      ['2026-10-02', 8, 'over', -10], // 100 · 1 / 10
      ['2026-10-03', 6, 'missed', -20],
      ['2026-10-04', 6, 'met', 13], // 5 · 3/6 = 2.5 → 3
      ['2026-10-05', 6, 'missed', -20],
      ['2026-10-06', 6, 'pending', 0],
    ])
    expect(rows.map((r) => r.isFinal)).toEqual([true, true, true, true, false, false])
    const stats = computeStats(rows, 10, '2026-10-06')
    expect(stats).toMatchObject({
      totalPoints: -27,
      metDays: 2,
      scoredDays: 5,
      metPct: 40,
      currentStreak: 0,
      bestStreak: 1,
      reductionLimitPct: 40,
      todayStatus: 'pending',
      currentLimitG: 6,
    })
  })
})
