import { useState } from 'react'
import { DailyTotalChart, TimeOfDayChart } from '../components/charts'
import { Card, ErrorState, Loading, PageHeader, Segmented, StatTile } from '../components/ui'
import { useIntakeStats, useNow, useToday } from '../hooks/queries'
import { cs } from '../i18n/cs'
import { dailyTotals } from '../lib/intakeStats'
import { addDays, formatShortDate } from '../lib/time'
import { formatDuration, formatMg } from '../lib/units'

const CAFFEINE = ['caffeine'] as const

/** Graf tab for a substance without a plan (caffeine). */
export function IntakeChartsPage() {
  const today = useToday()
  const now = useNow()
  const [range, setRange] = useState<14 | 30 | 0>(14)
  const all = useIntakeStats(CAFFEINE, today, now)

  if (all.isPending) return <Loading />
  if (all.isError) return <ErrorState error={all.error} onRetry={() => all.refetch()} />

  const stats = all.stats!
  const title = cs.chart.title
  if (!stats.firstDate) {
    return (
      <div>
        <PageHeader title={title} />
        <Card className="text-center text-muted">{cs.caffeine.chart.empty}</Card>
      </div>
    )
  }

  const from = range ? addDays(today, -(range - 1)) : stats.firstDate
  const inRange = all.data.filter((i) => i.localDate >= from)
  const mg = (v: number | null) => (v === null ? '–' : formatMg(v))
  const duration = (v: number | null) => (v === null ? '–' : formatDuration(v))

  return (
    <div className="space-y-5">
      <PageHeader title={title} />
      <Segmented
        value={range}
        onChange={setRange}
        options={([14, 30, 0] as const).map((r) => ({ value: r, label: cs.chart.ranges[r] }))}
      />

      <Card className="space-y-2 px-3">
        <h2 className="px-2 font-semibold">{cs.caffeine.chart.daily}</h2>
        <DailyTotalChart rows={dailyTotals(all.data, from, today)} unit="mg" label={cs.caffeine.chart.dailyTooltip} />
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <StatTile label={cs.caffeine.stats.today} value={mg(stats.todayTotal)} />
        <StatTile
          label={cs.caffeine.stats.maxDay}
          value={mg(stats.maxDay?.total ?? null)}
          hint={stats.maxDay ? formatShortDate(stats.maxDay.date) : undefined}
        />
        <StatTile label={cs.caffeine.stats.avg7d} value={mg(stats.avg7d)} />
        <StatTile label={cs.caffeine.stats.avgAll} value={mg(stats.avgAll)} />
        <StatTile
          className="col-span-2"
          label={cs.caffeine.stats.recordGap}
          value={duration(stats.recordGapMin)}
          hint={stats.recordGapRunning ? cs.stats.recordGapRunning : undefined}
        />
        <StatTile label={cs.caffeine.stats.avgGap5d} value={duration(stats.avgGap5dMin)} hint={cs.stats.gapHint} />
        <StatTile label={cs.caffeine.stats.avgGapAll} value={duration(stats.avgGapAllMin)} hint={cs.stats.gapHint} />
      </div>
      <p className="px-1 text-sm text-muted">{cs.caffeine.stats.emptyDaysNote}</p>

      <Card className="space-y-2 px-3">
        <h2 className="px-2 font-semibold">{cs.caffeine.chart.timeOfDay}</h2>
        <p className="px-2 text-sm text-muted">{cs.caffeine.chart.timeOfDayHint}</p>
        <TimeOfDayChart doses={inRange} label={cs.caffeine.chart.timeOfDayHint} />
      </Card>
    </div>
  )
}
