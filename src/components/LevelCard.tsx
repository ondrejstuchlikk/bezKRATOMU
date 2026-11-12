import { lazy, Suspense, useMemo, useState } from 'react'
import { useMyDoses } from '../hooks/queries'
import { cs } from '../i18n/cs'
import {
  kratomEffectGrams,
  levelPct,
  pkAt,
  pkAverageGramsPerDay,
  pkRangeVariants,
  pkSeries,
  pkTimesBelow,
  pkVariantLevel,
  pkVariantPeak,
  PK_HEAVY_G_PER_DAY,
  PK_MEMORY_DAYS,
  PK_CENTRAL,
  PK_PEAK_NM_PER_G,
  PK_VARIANT_MEMORY_DAYS,
  type PkDose,
  type PkVariant,
} from '../lib/pk'
import { addDays, formatWeekdayDate, pragueDate, pragueTime, type ISODate } from '../lib/time'
import { formatNumber } from '../lib/units'
import { DAY_OPTIONS, HOUR_OPTIONS, type PastHours } from '../lib/levelRange'
import { LevelRangePicker } from './LevelRangePicker'
import { Card } from './ui'

// Recharts is big; keep it out of the first page load (like the Graf page).
const LevelChart = lazy(() => import('./LevelChart'))

const CHART_HEIGHT = 150
const HOUR = 3_600_000
const FUTURE_H = 12

const PAST_OPTIONS: PastHours[] = [...HOUR_OPTIONS, ...DAY_OPTIONS]
const DEFAULT_PAST_H: PastHours = 24
const RANGE_KEY = 'levelRangeH'
/** Projection thresholds, % of the baseline level (the same steps as the milestone notifications). */
const PROJECTION_PCT = [75, 50, 25, 10]
const PROJECTION_ROWS = 2

/** The chosen chart range is a per-device convenience, so localStorage is fine (and optional). */
function readPastHours(): PastHours {
  try {
    const v = Number(localStorage.getItem(RANGE_KEY))
    return PAST_OPTIONS.includes(v as PastHours) ? (v as PastHours) : DEFAULT_PAST_H
  } catch {
    return DEFAULT_PAST_H
  }
}

function savePastHours(h: PastHours) {
  try {
    localStorage.setItem(RANGE_KEY, String(h))
  } catch {
    // ignore (private mode etc.)
  }
}

/** "98", "5,2", "0,4" – whole mg from 10 up, one decimal below. */
function formatMg(mg: number): string {
  return formatNumber(mg >= 10 ? Math.round(mg) : Math.round(mg * 10) / 10)
}

/** "1,3", "12,5"; "< 0,1" for tiny non-zero amounts – the estimate isn't more precise than that. */
function formatKratomG(g: number): string {
  if (g > 0 && g < 0.05) return '< 0,1'
  return formatNumber(Math.round(g * 10) / 10)
}

/** Rounded to 5 %, as the model is only a rough estimate. */
function roundPct(pct: number): number {
  return Math.round(pct / 5) * 5
}

/** "dnes kolem 21:40", "zítra kolem 06:10", "po 9. 11. kolem 14:00" (rounded to 10 minutes). */
function formatWhen(t: number, today: ISODate): string {
  const at = new Date(Math.round(t / 600_000) * 600_000)
  const date = pragueDate(at)
  const day = date === today ? cs.level.today : date === addDays(today, 1) ? cs.level.tomorrow : formatWeekdayDate(date)
  return cs.level.projectionWhen(day, pragueTime(at))
}

/** "dnes 21:40" – the short form used inside the range line. */
function formatWhenShort(t: number, today: ISODate): string {
  const at = new Date(Math.round(t / 600_000) * 600_000)
  const date = pragueDate(at)
  const day = date === today ? cs.level.today : date === addDays(today, 1) ? cs.level.tomorrow : formatWeekdayDate(date)
  return `${day} ${pragueTime(at)}`
}

/**
 * "If you take nothing more": when the level falls below the next steps (with a plan), else to ½ and ⅒ of now.
 * `t` is the central estimate; `early`/`late` the fast and slow ends of the range (late null = not within 3 weeks).
 */
type ProjectionRow = { label: string; t: number | null; early: number | null; late: number | null }
type ReachedRow = ProjectionRow & { t: number }
const reached = (rows: ProjectionRow[]) => rows.filter((r): r is ReachedRow => r.t !== null)

/** Range of the crossing times over the central model and both ends (null counts as "later than we look"). */
function spread(times: (number | null)[]): { early: number | null; late: number | null } {
  const found = times.filter((t): t is number => t !== null)
  return { early: found.length ? Math.min(...found) : null, late: found.length === times.length ? Math.max(...found) : null }
}

function projection(doses: readonly PkDose[], from: number, currentNM: number, baselineG: number | null, range: PkVariant[]) {
  const ends = [PK_CENTRAL, ...range]
  if (baselineG && baselineG > 0) {
    // Each variant against its own reference (see pk.ts): the same "% of your usual level".
    const times = ends.map((v) => pkTimesBelow(doses, from, PROJECTION_PCT.map((p) => (p / 100) * v.ref * baselineG), 5, v))
    const rows = reached(PROJECTION_PCT.map((p, i) => ({ label: cs.level.projectionPct(p), t: times[0][i], ...spread(times.map((x) => x[i])) })))
    // Already below the last step: fall back to half / a tenth of now.
    if (rows.length) return rows.slice(0, PROJECTION_ROWS)
  }
  if (currentNM < 1) return []
  const times = ends.map((v) => {
    const now = pkVariantLevel(v, doses, from)
    return pkTimesBelow(doses, from, [now / 2, now / 10], 5, v)
  })
  return reached([
    { label: cs.level.projectionHalf, t: times[0][0], ...spread(times.map((x) => x[0])) },
    { label: cs.level.projectionTenth, t: times[0][1], ...spread(times.map((x) => x[1])) },
  ])
}

/**
 * Estimated mitragynine + 7-OH in the body from the user's own doses (src/lib/pk.ts).
 * Only ever shown for yourself: other users' dose times are private.
 */
export function LevelCard({ today, now, baselineG }: { today: ISODate; now: Date; baselineG: number | null }) {
  // The longest view (7 days) needs the doses of the 14 days before its start too; the range needs 21 days.
  const doses = useMyDoses(addDays(today, -Math.max(PK_MEMORY_DAYS + 7, PK_VARIANT_MEMORY_DAYS)), today)
  const [pastH, setPastH] = useState<PastHours>(readPastHours)
  // Recompute once a minute, not on every render.
  const minute = Math.floor(now.getTime() / 60_000) * 60_000

  const model = useMemo(() => {
    if (!doses.data) return null
    const list = doses.data
    const current = pkAt(list, minute)
    const pastDoses = list.filter((d) => new Date(d.takenAt).getTime() <= minute)
    const toY = (levelNM: number) => levelPct(levelNM, baselineG) ?? levelNM
    const past = pkSeries(pastDoses, minute - pastH * HOUR, minute, pastH > 48 ? 30 : 10)
    // Projection: only doses that already happened ("if you take nothing more").
    const future = pkSeries(pastDoses, minute, minute + FUTURE_H * HOUR, 10)
    // Uncertainty range of the projection: fast and slow ends, each on its own scale (own reference with a plan,
    // own 1 g peak without one), so they mean the same thing as the central line.
    const avgG = pkAverageGramsPerDay(list, minute)
    const ends = pkRangeVariants(avgG)
    const range = [ends.fast, ends.slow]
    const peaks = range.map(pkVariantPeak)
    const variantY = (i: number, t: number) => {
      const lv = pkVariantLevel(range[i], pastDoses, t)
      return baselineG && baselineG > 0 ? (100 * lv) / (range[i].ref * baselineG) : (lv / peaks[i]) * PK_PEAK_NM_PER_G
    }
    const data = [
      ...past.map((p) => ({ t: p.t, past: toY(p.levelNM), future: null as number | null, band: null as [number, number] | null })),
      ...future.map((p, k) => {
        const ys = [toY(p.levelNM), variantY(0, p.t), variantY(1, p.t)]
        return { t: p.t, past: null as number | null, future: k === 0 ? null : ys[0], band: [Math.min(...ys), Math.max(...ys)] as [number, number] }
      }),
    ]
    // Join the two lines at "now" (the first future point is "now" itself).
    const nowPoint = data[past.length]
    data[past.length - 1].future = data[past.length - 1].past
    data[past.length - 1].band = nowPoint.band
    data.splice(past.length, 1)
    const markers = pastDoses
      .map((d) => new Date(d.takenAt).getTime())
      .filter((t) => t >= minute - pastH * HOUR)
    const ahead = projection(pastDoses, minute, current.levelNM, baselineG, range).map((r) => ({
      label: r.label,
      when: formatWhen(r.t, today),
      range: r.early === null ? null : cs.level.projectionRange(formatWhenShort(r.early, today), r.late === null ? cs.level.rangeLater : formatWhenShort(r.late, today)),
    }))
    return { current, data, markers, ahead, heavy: avgG > PK_HEAVY_G_PER_DAY, hasAny: pastDoses.length > 0 }
  }, [doses.data, minute, baselineG, pastH, today])

  if (!model) return null
  const pct = levelPct(model.current.levelNM, baselineG)
  const showPct = pct !== null

  return (
    <Card className="space-y-4">
      <div className="text-xs font-medium tracking-wide text-muted uppercase">{cs.level.title}</div>

      {!model.hasAny ? (
        <p className="text-sm text-muted">{cs.level.noDoses}</p>
      ) : (
        <>
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <div className="font-display text-4xl font-semibold tabular-nums">
                ≈ {formatKratomG(kratomEffectGrams(model.current.levelNM))}
                <span className="ml-1 text-xl text-muted">g</span>
              </div>
              <div className="text-sm text-muted">{cs.level.kratom}</div>
              <div className="mt-1 text-xs text-muted tabular-nums">{cs.level.alkaloidsMg(formatMg(model.current.mgMG), formatMg(model.current.mgOH))}</div>
            </div>
            {showPct && (
              <div className="text-right">
                <div className="text-xs font-medium tracking-wide text-muted uppercase">{cs.level.level}</div>
                <div className="font-display text-3xl font-semibold tabular-nums">
                  {roundPct(pct)}
                  <span className="ml-0.5 text-lg text-muted">%</span>
                </div>
              </div>
            )}
          </div>

          <div>
            <LevelRangePicker
              value={pastH}
              onChange={(h) => {
                setPastH(h)
                savePastHours(h)
              }}
            />
            <div aria-hidden="true">
              <Suspense fallback={<div style={{ height: CHART_HEIGHT }} />}>
                <LevelChart data={model.data} markers={model.markers} now={minute} pastH={pastH} showPct={showPct} height={CHART_HEIGHT} />
              </Suspense>
            </div>
            <div className="mt-1 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-0.5 w-4 rounded bg-accent" /> {cs.level.legendPast(pastH)}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-4 border-t-2 border-dashed border-accent" /> {cs.level.legendFuture}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-4 rounded-sm bg-accent/20" /> {cs.level.legendRange}
              </span>
            </div>
          </div>

          {model.ahead.length > 0 && (
            <div className="text-sm">
              <div className="text-muted">{cs.level.projectionTitle}</div>
              <ul className="mt-1 space-y-0.5">
                {model.ahead.map((r) => (
                  <li key={r.label}>
                    <div className="flex justify-between gap-3">
                      <span>{r.label}</span>
                      <span className="font-medium tabular-nums">{r.when}</span>
                    </div>
                    {r.range && <div className="text-right text-xs text-muted tabular-nums">{r.range}</div>}
                  </li>
                ))}
              </ul>
              {model.heavy && <p className="mt-1.5 text-xs text-muted">{cs.level.heavyNote(PK_HEAVY_G_PER_DAY)}</p>}
            </div>
          )}

          <p className="text-xs text-muted">{showPct ? cs.level.pctHint : cs.level.noPlanHint}</p>
        </>
      )}

      <p className="text-xs text-muted">{cs.level.disclaimer}</p>
      <details className="text-sm">
        <summary className="cursor-pointer font-medium text-accent">{cs.level.howTitle}</summary>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-muted">
          {cs.level.how.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </details>
    </Card>
  )
}
