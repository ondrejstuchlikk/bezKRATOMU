import { lazy, Suspense, useMemo, useState } from 'react'
import { useMyDoses } from '../hooks/queries'
import { cs } from '../i18n/cs'
import { levelPct, pkAt, pkSeries, pkTimesBelow, PK_MEMORY_DAYS, PK_REF_NM_PER_G_DAY } from '../lib/pk'
import { addDays, formatWeekdayDate, pragueDate, pragueTime, type ISODate } from '../lib/time'
import { formatNumber } from '../lib/units'
import { Card, Segmented } from './ui'

// Recharts is big; keep it out of the first page load (like the Graf page).
const LevelChart = lazy(() => import('./LevelChart'))

const CHART_HEIGHT = 150
const HOUR = 3_600_000
const FUTURE_H = 12

type PastHours = 12 | 24 | 48
const PAST_OPTIONS: PastHours[] = [12, 24, 48]
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

/** "If you take nothing more": when the level falls below the next steps (with a plan), else to ½ and ⅒ of now. */
type ProjectionRow = { label: string; t: number | null }
const reached = (rows: ProjectionRow[]) => rows.filter((r): r is { label: string; t: number } => r.t !== null)

function projection(doses: Parameters<typeof pkTimesBelow>[0], from: number, currentNM: number, baselineG: number | null) {
  if (baselineG && baselineG > 0) {
    const ref = PK_REF_NM_PER_G_DAY * baselineG
    const times = pkTimesBelow(doses, from, PROJECTION_PCT.map((p) => (p / 100) * ref))
    const rows = reached(PROJECTION_PCT.map((p, i) => ({ label: cs.level.projectionPct(p), t: times[i] })))
    // Already below the last step: fall back to half / a tenth of now.
    if (rows.length) return rows.slice(0, PROJECTION_ROWS)
  }
  if (currentNM < 1) return []
  const [half, tenth] = pkTimesBelow(doses, from, [currentNM / 2, currentNM / 10])
  return reached([
    { label: cs.level.projectionHalf, t: half },
    { label: cs.level.projectionTenth, t: tenth },
  ])
}

/**
 * Estimated mitragynine + 7-OH in the body from the user's own doses (src/lib/pk.ts).
 * Only ever shown for yourself: other users' dose times are private.
 */
export function LevelCard({ today, now, baselineG }: { today: ISODate; now: Date; baselineG: number | null }) {
  const doses = useMyDoses(addDays(today, -PK_MEMORY_DAYS), today)
  const [pastH, setPastH] = useState<PastHours>(readPastHours)
  // Recompute once a minute, not on every render.
  const minute = Math.floor(now.getTime() / 60_000) * 60_000

  const model = useMemo(() => {
    if (!doses.data) return null
    const list = doses.data
    const current = pkAt(list, minute)
    const pastDoses = list.filter((d) => new Date(d.takenAt).getTime() <= minute)
    const toY = (levelNM: number) => levelPct(levelNM, baselineG) ?? levelNM
    const past = pkSeries(pastDoses, minute - pastH * HOUR, minute, 10)
    // Projection: only doses that already happened ("if you take nothing more").
    const future = pkSeries(pastDoses, minute, minute + FUTURE_H * HOUR, 10)
    const data = [
      ...past.map((p) => ({ t: p.t, past: toY(p.levelNM), future: null as number | null })),
      ...future.slice(1).map((p) => ({ t: p.t, past: null as number | null, future: toY(p.levelNM) })),
    ]
    // Join the two lines at "now".
    data[past.length - 1].future = data[past.length - 1].past
    const markers = pastDoses
      .map((d) => new Date(d.takenAt).getTime())
      .filter((t) => t >= minute - pastH * HOUR)
    const ahead = projection(pastDoses, minute, current.levelNM, baselineG).map((r) => ({ label: r.label, when: formatWhen(r.t, today) }))
    return { current, data, markers, ahead, hasAny: pastDoses.length > 0 }
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
                ≈ {formatMg(model.current.mgMG)}
                <span className="ml-1 text-xl text-muted">mg</span>
              </div>
              <div className="text-sm text-muted">{cs.level.mitragynine}</div>
              <div className="mt-1 text-sm">
                <span className="font-semibold tabular-nums">≈ {formatMg(model.current.mgOH)} mg</span>{' '}
                <span className="text-muted">{cs.level.sevenOh}</span>
              </div>
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

          <div aria-hidden="true">
            <Segmented
              className="mb-2"
              value={pastH}
              options={PAST_OPTIONS.map((h) => ({ value: h, label: cs.level.range(h) }))}
              onChange={(h) => {
                setPastH(h)
                savePastHours(h)
              }}
            />
            <Suspense fallback={<div style={{ height: CHART_HEIGHT }} />}>
              <LevelChart data={model.data} markers={model.markers} now={minute} pastH={pastH} showPct={showPct} height={CHART_HEIGHT} />
            </Suspense>
            <div className="mt-1 flex justify-center gap-4 text-xs text-muted">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-0.5 w-4 rounded bg-accent" /> {cs.level.legendPast(pastH)}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-4 border-t-2 border-dashed border-accent" /> {cs.level.legendFuture}
              </span>
            </div>
          </div>

          {model.ahead.length > 0 && (
            <div className="text-sm">
              <div className="text-muted">{cs.level.projectionTitle}</div>
              <ul className="mt-1 space-y-0.5">
                {model.ahead.map((r) => (
                  <li key={r.label} className="flex justify-between gap-3">
                    <span>{r.label}</span>
                    <span className="font-medium tabular-nums">{r.when}</span>
                  </li>
                ))}
              </ul>
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
