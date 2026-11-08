import { lazy, Suspense, useMemo } from 'react'
import type { Intake } from '../api'
import { cs } from '../i18n/cs'
import { cafAt, cafCups, cafSeries, cafSleepRefMg, cafTimeBelow, nextClockTime } from '../lib/caffeinePk'
import { addDays, formatWeekdayDate, pragueDate, pragueTime, type ISODate } from '../lib/time'
import { formatNumber } from '../lib/units'
import { Card } from './ui'

// Recharts is big; keep it out of the first page load.
const CaffeineChart = lazy(() => import('./CaffeineChart'))

const CHART_HEIGHT = 150
const HOUR = 3_600_000
const PAST_H = 24
/** The projection runs at least this long, and past bedtime by an hour. */
const MIN_FUTURE_H = 8

/** Whole mg from 10 up, one decimal below. */
const mg = (v: number) => formatNumber(v >= 10 ? Math.round(v) : Math.round(v * 10) / 10)
/** Cups to 0.1. */
const cups = (v: number) => Math.round(v * 10) / 10

function dayWord(t: number, today: ISODate): string {
  const date = pragueDate(new Date(t))
  return date === today ? cs.caffeineLevel.today : date === addDays(today, 1) ? cs.caffeineLevel.tomorrow : formatWeekdayDate(date)
}

/**
 * Estimated caffeine in the body from the user's own entries (src/lib/caffeinePk.ts). Only shown to the
 * owner, like the kratom estimate.
 */
export function CaffeineLevelCard({
  intakes,
  today,
  now,
  weightKg,
  bedtime,
}: {
  intakes: Intake[]
  today: ISODate
  now: Date
  weightKg: number | null
  bedtime: string
}) {
  // Recompute once a minute.
  const minute = Math.floor(now.getTime() / 60_000) * 60_000
  const refMg = cafSleepRefMg(weightKg)

  const model = useMemo(() => {
    const past = intakes.filter((i) => new Date(i.takenAt).getTime() <= minute)
    const current = cafAt(past, minute)
    const bed = nextClockTime(minute, bedtime)
    const futureEnd = Math.max(minute + MIN_FUTURE_H * HOUR, bed + HOUR)
    const pastSeries = cafSeries(past, minute - PAST_H * HOUR, minute, 10)
    const futureSeries = cafSeries(past, minute, futureEnd, 10)
    const data = [
      ...pastSeries.map((p) => ({ t: p.t, past: p.bodyMg, future: null as number | null })),
      ...futureSeries.slice(1).map((p) => ({ t: p.t, past: null as number | null, future: p.bodyMg })),
    ]
    data[pastSeries.length - 1].future = data[pastSeries.length - 1].past
    const markers = past.map((i) => new Date(i.takenAt).getTime()).filter((t) => t >= minute - PAST_H * HOUR)
    const atBed = cafAt(past, bed).bodyMg
    const below = cafTimeBelow(past, minute, refMg)
    const hasAny = past.some((i) => minute - new Date(i.takenAt).getTime() < 72 * HOUR)
    return { current, data, markers, bed, atBed, below, hasAny }
  }, [intakes, minute, bedtime, refMg])

  const roundedBelow = model.below === null ? null : Math.round(model.below / 600_000) * 600_000

  return (
    <Card className="space-y-4">
      <div className="text-xs font-medium tracking-wide text-muted uppercase">{cs.caffeineLevel.title}</div>

      {!model.hasAny ? (
        <p className="text-sm text-muted">{cs.caffeineLevel.none}</p>
      ) : (
        <>
          <div>
            <div className="font-display text-4xl font-semibold tabular-nums">
              ≈ {mg(model.current.bodyMg)}
              <span className="ml-1 text-xl text-muted">mg</span>
            </div>
            <div className="text-sm text-muted">
              {cs.caffeineLevel.unit} · {cs.caffeineLevel.cups(cups(cafCups(model.current.bodyMg)))}
            </div>
            {model.current.gutMg >= 1 && (
              <div className="mt-1 text-xs text-muted tabular-nums">{cs.caffeineLevel.absorbing(mg(model.current.gutMg))}</div>
            )}
          </div>

          <div>
            <div aria-hidden="true">
              <Suspense fallback={<div style={{ height: CHART_HEIGHT }} />}>
                <CaffeineChart data={model.data} markers={model.markers} now={minute} bedtime={model.bed} refMg={refMg} height={CHART_HEIGHT} />
              </Suspense>
            </div>
            <div className="mt-1 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-0.5 w-4 rounded bg-accent" /> {cs.caffeineLevel.legendPast}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-4 border-t-2 border-dashed border-accent" /> {cs.caffeineLevel.legendFuture}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-4 border-t-2 border-dashed border-warn" /> {cs.caffeineLevel.legendRef}
              </span>
            </div>
          </div>

          <ul className="space-y-0.5 text-sm">
            <li className="flex justify-between gap-3">
              <span>🌙 {cs.caffeineLevel.bedtime(pragueTime(new Date(model.bed)), dayWord(model.bed, today))}</span>
              <span className="font-medium tabular-nums">{cs.caffeineLevel.bedtimeValue(mg(model.atBed))}</span>
            </li>
            <li className="flex justify-between gap-3">
              <span>{cs.caffeineLevel.belowRef(mg(refMg))}</span>
              <span className="font-medium tabular-nums">
                {roundedBelow === null
                  ? '–'
                  : roundedBelow <= minute
                    ? cs.caffeineLevel.belowRefNow
                    : cs.caffeineLevel.belowRefWhen(dayWord(roundedBelow, today), pragueTime(new Date(roundedBelow)))}
              </span>
            </li>
          </ul>
          <p className="text-xs text-muted">{cs.caffeineLevel.refHint(mg(refMg))}</p>
        </>
      )}

      <p className="text-xs text-muted">{cs.caffeineLevel.disclaimer}</p>
      <details className="text-sm">
        <summary className="cursor-pointer font-medium text-accent">{cs.caffeineLevel.howTitle}</summary>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-muted">
          {cs.caffeineLevel.how.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </details>
    </Card>
  )
}
