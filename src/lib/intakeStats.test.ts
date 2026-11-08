import { describe, expect, it } from 'vitest'
import { computeIntakeStats, dailyTotals } from './intakeStats'
import { pragueLocalToInstant } from './time'

const at = (s: string) => pragueLocalToInstant(s.slice(0, 10), s.slice(11))
const entry = (s: string, amount: number) => ({ takenAt: at(s).toISOString(), localDate: s.slice(0, 10), amount })

// 10-02 has nothing logged: it counts as a day with 0 mg, and the time between entries runs across it.
const intakes = [
  entry('2026-10-01 08:00', 150),
  entry('2026-10-01 14:00', 75),
  entry('2026-10-03 09:00', 150),
  entry('2026-10-04 07:30', 80),
]

describe('caffeine statistics', () => {
  it('fills days without entries with 0', () => {
    expect(dailyTotals(intakes, '2026-09-30', '2026-10-04').map((r) => r.total)).toEqual([0, 225, 0, 150, 80])
  })

  it('averages over days since the first entry, without today', () => {
    const s = computeIntakeStats(intakes, at('2026-10-04 12:00'))
    expect(s.firstDate).toBe('2026-10-01')
    expect(s.todayTotal).toBe(80)
    expect(s.avgAll).toBe(125) // (225 + 0 + 150) / 3
    expect(s.avg7d).toBe(125)
    expect(s.maxDay).toEqual({ date: '2026-10-01', total: 225 })
  })

  it('counts gaps across empty days', () => {
    const s = computeIntakeStats(intakes, at('2026-10-04 12:00'))
    // 10-01 14:00 → 10-03 09:00 = 43 h
    expect(s.recordGapMin).toBe(43 * 60)
    expect(s.recordGapRunning).toBe(false)
    expect(s.lastDoseAt).toBe(at('2026-10-04 07:30').toISOString())
  })

  it('keeps the running gap going across days without entries', () => {
    const s = computeIntakeStats(intakes, at('2026-10-07 07:30'))
    expect(s.recordGapMin).toBe(72 * 60)
    expect(s.recordGapRunning).toBe(true)
    expect(s.todayTotal).toBe(0)
  })

  it('only uses the last 7 days for the short average', () => {
    const s = computeIntakeStats(intakes, at('2026-10-10 12:00'))
    // 10-03 … 10-09: 150 + 80, five empty days
    expect(s.avg7d).toBe(32.9)
  })

  it('handles no entries', () => {
    const s = computeIntakeStats([], at('2026-10-04 12:00'))
    expect([s.firstDate, s.todayTotal, s.avgAll, s.avg7d, s.maxDay, s.recordGapMin]).toEqual([null, 0, null, null, null, null])
  })
})
