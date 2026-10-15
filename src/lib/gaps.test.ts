// Same scenario and numbers as the "Time between doses" checks in
// supabase/tests/rls_and_scoring.sql, so the TS mirror matches private.gap_stats.

import { describe, expect, it } from 'vitest'
import { computeGapStats, gapMean } from './gaps'
import { pragueLocalToInstant } from './time'
import { formatDuration } from './units'

const at = (s: string) => pragueLocalToInstant(s.slice(0, 10), s.slice(11))

// 10-05 is not logged (breaks the gap across it), 10-07 and 10-09 are zero days.
const doses = [
  '2026-10-03 08:00', '2026-10-03 20:00', '2026-10-04 08:00', '2026-10-06 10:00',
  '2026-10-08 10:00', '2026-10-08 16:30', '2026-10-10 09:00',
].map((s) => ({ takenAt: at(s).toISOString(), localDate: s.slice(0, 10) }))
const zeroDays = new Set(['2026-10-07', '2026-10-09'])

const summary = (now: string) => {
  const g = computeGapStats(doses, zeroDays, at(now))
  return [g.recordGapMin, g.recordGapRunning, g.avgGap5dMin, g.avgGapAllMin]
}

describe('time between doses (SQL parity)', () => {
  it('counts the running gap as the record', () => {
    expect(summary('2026-10-12 12:00')).toEqual([3060, true, 2190, 1700])
  })

  it('leaves a short running gap out of the averages', () => {
    expect(summary('2026-10-10 10:00')).toEqual([2880, false, 1900, 1428])
  })

  it('breaks the running gap on days nobody logged', () => {
    expect(summary('2026-10-14 12:00')).toEqual([2880, false, 2430, 1428])
  })

  it('has nothing before the first dose', () => {
    expect(summary('2026-10-03 07:00')).toEqual([null, false, null, null])
  })

  it('ignores doses later than now', () => {
    expect(computeGapStats(doses, zeroDays, at('2026-10-09 12:00')).lastDoseAt).toBe(at('2026-10-08 16:30').toISOString())
  })
})

describe('gap helpers', () => {
  it('averages in the running gap only when it raises the average', () => {
    expect(gapMean([3600, 7200], 60)).toBe(5400)
    expect(gapMean([3600, 7200], 9000)).toBe(6600)
    expect(gapMean([], 60)).toBe(60)
    expect(gapMean([], null)).toBeNull()
  })

  it('formats durations', () => {
    expect(formatDuration(45)).toBe('45 min')
    expect(formatDuration(60)).toBe('1 h 0 min')
    expect(formatDuration(312)).toBe('5 h 12 min')
    expect(formatDuration(1620)).toBe('1 d 3 h')
  })
})
