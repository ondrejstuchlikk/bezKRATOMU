// Checks that the TypeScript scoring mirror produces exactly what the database
// produced for the scenario in supabase/tests/rls_and_scoring.sql (user "Jana").
// Regenerate the fixture with supabase/tests/run.sh after changing the SQL.

import { describe, expect, it } from 'vitest'
import sqlRows from './__fixtures__/sql_user_days.json'
import { computeDays, type DayActivity } from './days'
import { buildPlanDays } from './plan'
import { addDays, diffDays } from './time'

const TODAY = '2026-10-12'
const at = (offset: number) => addDays(TODAY, offset)

describe('SQL ↔ TypeScript parity', () => {
  it('matches the finalized + provisional days computed by Postgres', () => {
    const plan = { id: 'b1', baselineG: 20, targetG: 2, durationDays: 10, curve: 'decelerating' as const, startDate: at(-12), endedOn: null }
    const planDays = buildPlanDays(plan, [{ startDate: at(-8), endDate: at(-7) }])
    const doses: [number, number][] = [
      [-12, 10], [-12, 9.5], [-11, 17], [-8, 5.25], [-8, 5.25], [-8, 5.25], [-6, 30],
      [-5, 8.33], [-5, 2], [-4, 6], [-3, 4], [-3, 0.01], [-2, 3],
    ]
    const activity = new Map<string, DayActivity>()
    for (const [offset, grams] of doses) {
      const a = activity.get(at(offset)) ?? { totalCg: 0, doseCount: 0, zeroDay: false }
      a.totalCg += Math.round(grams * 100)
      a.doseCount++
      activity.set(at(offset), a)
    }
    activity.set(at(-7), { totalCg: 0, doseCount: 0, zeroDay: true })

    const ts = computeDays(planDays, new Map([['b1', 20]]), activity, TODAY).map((r) => ({
      offset: diffDays(r.date, TODAY),
      limit_g: r.limitG,
      total_g: r.totalG,
      is_paused: r.isPaused,
      status: r.status,
      points: r.points,
      streak_after: r.streakAfter,
      missed_run: r.missedRun,
    }))
    expect(ts).toEqual(sqlRows.map((r) => ({ ...r, total_g: Number(r.total_g) })))
  })
})
