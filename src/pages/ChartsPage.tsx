import { useState } from 'react'
import type { DayResult } from '../api'
import { useMe } from '../auth/SessionProvider'
import { FeelingsChart, PlanVsActualChart, PointsChart, TimeOfDayChart } from '../components/charts'
import { StatsGrid } from '../components/StatsGrid'
import { ButtonLink, Card, ErrorState, Loading, PageHeader, Segmented } from '../components/ui'
import { useActivePlan, useMyDoses, useSettings, useToday, useUserDays, useUserStats } from '../hooks/queries'
import { cs } from '../i18n/cs'
import { addDays } from '../lib/time'
import { formatMoney } from '../lib/units'

const ALL_FROM = '2000-01-01'

function moneySaved(days: DayResult[], price: number): number {
  return days.reduce(
    (sum, d) => (d.logged && d.baselineG !== null && d.totalG !== null && d.totalG < d.baselineG ? sum + (d.baselineG - d.totalG) * price : sum),
    0,
  )
}

export default function ChartsPage() {
  const me = useMe()
  const today = useToday()
  const [range, setRange] = useState<14 | 30 | 0>(14)
  const from = range ? addDays(today, -(range - 1)) : ALL_FROM

  const plan = useActivePlan()
  const days = useUserDays(me.id, from, today)
  const allDays = useUserDays(me.id, ALL_FROM, today)
  const doses = useMyDoses(from, today)
  const stats = useUserStats(me.id)
  const settings = useSettings()

  if (plan.isPending || days.isPending || doses.isPending || stats.isPending) return <Loading />
  if (days.isError || doses.isError || stats.isError) {
    return <ErrorState error={days.error ?? doses.error ?? stats.error} onRetry={() => { days.refetch(); doses.refetch(); stats.refetch() }} />
  }

  if (!plan.data && !days.data.length) {
    return (
      <div>
        <PageHeader title={cs.chart.title} />
        <Card className="space-y-4 text-center">
          <p className="text-muted">{cs.chart.noPlan}</p>
          <ButtonLink to="/plan/novy" className="w-full">
            {cs.plan.create}
          </ButtonLink>
        </Card>
      </div>
    )
  }

  const price = settings.data?.pricePerGram
  const saved = price && allDays.data ? moneySaved(allDays.data, price) : null

  return (
    <div className="space-y-5">
      <PageHeader title={cs.chart.title} />
      <Segmented
        value={range}
        onChange={setRange}
        options={([14, 30, 0] as const).map((r) => ({ value: r, label: cs.chart.ranges[r] }))}
      />

      <Card className="space-y-2 px-3">
        <h2 className="px-2 font-semibold">{cs.chart.main}</h2>
        <Legend />
        <PlanVsActualChart days={days.data} unit="g" />
      </Card>

      <StatsGrid stats={stats.data} />

      {saved !== null && saved > 0 && (
        <div className="flex items-center justify-between rounded-2xl border border-dashed border-line px-4 py-3 text-sm">
          <span className="text-muted">💰 {cs.stats.moneySaved}</span>
          <span className="font-semibold">{formatMoney(saved)}</span>
        </div>
      )}

      <Card className="space-y-2 px-3">
        <h2 className="px-2 font-semibold">{cs.chart.timeOfDay}</h2>
        <p className="px-2 text-sm text-muted">{cs.chart.timeOfDayHint}</p>
        <TimeOfDayChart doses={doses.data} />
      </Card>

      <Card className="space-y-2 px-3">
        <h2 className="px-2 font-semibold">{cs.chart.feelings}</h2>
        <FeelingsChart days={days.data} doses={doses.data} unit="g" />
      </Card>

      <Card className="space-y-2 px-3">
        <h2 className="px-2 font-semibold">{cs.chart.points}</h2>
        <PointsChart days={allDays.data ?? days.data} />
      </Card>
    </div>
  )
}

export function Legend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 px-2 text-xs text-muted">
      <span className="flex items-center gap-1.5">
        <span className="h-0.5 w-4 bg-ink" /> {cs.chart.plan}
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-2.5 rounded-sm bg-accent/60" /> {cs.chart.actual}
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-2.5 rounded-sm bg-over/80" /> {cs.status.over}
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-2.5 rounded-sm bg-warn/25" /> {cs.chart.paused}
      </span>
    </div>
  )
}
