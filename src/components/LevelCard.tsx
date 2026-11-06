import { lazy, Suspense, useMemo, useState } from 'react'
import { useMyDoses } from '../hooks/queries'
import { cs } from '../i18n/cs'
import { levelPct, pkAt, pkSeries, PK_MEMORY_DAYS } from '../lib/pk'
import { addDays, type ISODate } from '../lib/time'
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
    return { current, data, markers, hasAny: pastDoses.length > 0 }
  }, [doses.data, minute, baselineG, pastH])

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
