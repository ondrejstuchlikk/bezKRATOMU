import { useState } from 'react'
import { CountsByFormChart, TimeOfDayChart } from '../components/charts'
import { Card, ErrorState, Loading, PageHeader, Segmented, StatTile } from '../components/ui'
import { useIntakeStats, useNow, useSettings, useToday } from '../hooks/queries'
import { cs } from '../i18n/cs'
import { dailyCountsByForm, moneySpent } from '../lib/nicotine'
import { NICOTINE_FORMS, trackedForms } from '../lib/substances'
import { addDays, formatShortDate } from '../lib/time'
import { formatDuration, formatMoney, formatNumber } from '../lib/units'

/** Graf tab for nicotine: pieces per day by form, averages, time between entries and money spent. */
export function NicotineChartsPage() {
  const today = useToday()
  const now = useNow()
  const [range, setRange] = useState<14 | 30 | 0>(14)
  const settings = useSettings()
  const all = useIntakeStats(NICOTINE_FORMS, today, now)

  if (all.isPending || settings.isPending) return <Loading />
  if (all.isError || settings.isError) {
    return <ErrorState error={all.error ?? settings.error} onRetry={() => (all.refetch(), settings.refetch())} />
  }

  const stats = all.stats!
  if (!stats.firstDate) {
    return (
      <div>
        <PageHeader title={cs.chart.title} />
        <Card className="text-center text-muted">{cs.nicotine.chart.empty}</Card>
      </div>
    )
  }

  const from = range ? addDays(today, -(range - 1)) : stats.firstDate
  const inRange = all.data.filter((i) => i.localDate >= from)
  // Forms in the chart: tracked ones plus any that have entries.
  const tracked = trackedForms(settings.data)
  const forms = NICOTINE_FORMS.filter((f) => tracked.includes(f) || all.data.some((i) => i.substance === f))
  const n = (v: number | null) => (v === null ? '–' : formatNumber(v))
  const duration = (v: number | null) => (v === null ? '–' : formatDuration(v))

  const weekAgo = addDays(today, -6)
  const spentToday = moneySpent(all.data.filter((i) => i.localDate === today), settings.data)
  const spent7d = moneySpent(all.data.filter((i) => i.localDate >= weekAgo), settings.data)
  const spentAll = moneySpent(all.data, settings.data)
  const pastDays = Math.round((Date.parse(today) - Date.parse(stats.firstDate)) / 86_400_000)
  const spentBeforeToday = moneySpent(all.data.filter((i) => i.localDate < today), settings.data)
  const perDay = spentBeforeToday !== null && pastDays > 0 ? spentBeforeToday / pastDays : null
  const money = (v: number | null) => (v === null ? '–' : formatMoney(v))

  return (
    <div className="space-y-5">
      <PageHeader title={cs.chart.title} />
      <Segmented
        value={range}
        onChange={setRange}
        options={([14, 30, 0] as const).map((r) => ({ value: r, label: cs.chart.ranges[r] }))}
      />

      <Card className="space-y-2 px-3">
        <h2 className="px-2 font-semibold">{cs.nicotine.chart.daily}</h2>
        {forms.length > 1 && (
          <div className="flex flex-wrap gap-x-4 px-2 text-xs text-muted">
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-accent/75" /> {cs.nicotine.forms.cigarette.name}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-warn/75" /> {cs.nicotine.forms.snus.name}
            </span>
          </div>
        )}
        <CountsByFormChart
          rows={dailyCountsByForm(all.data, from, today)}
          series={forms.map((f) => ({ key: f, label: cs.nicotine.forms[f].name, tone: f === 'cigarette' ? 'accent' : 'warn' }))}
        />
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <StatTile label={cs.nicotine.stats.today} value={n(stats.todayTotal)} />
        <StatTile
          label={cs.nicotine.stats.maxDay}
          value={n(stats.maxDay?.total ?? null)}
          hint={stats.maxDay ? formatShortDate(stats.maxDay.date) : undefined}
        />
        <StatTile label={cs.nicotine.stats.avg7d} value={n(stats.avg7d)} />
        <StatTile label={cs.nicotine.stats.avgAll} value={n(stats.avgAll)} />
        <StatTile
          className="col-span-2"
          label={cs.nicotine.stats.recordGap}
          value={duration(stats.recordGapMin)}
          hint={stats.recordGapRunning ? cs.stats.recordGapRunning : forms.length > 1 ? cs.nicotine.stats.bothForms : undefined}
        />
        <StatTile label={cs.nicotine.stats.avgGap5d} value={duration(stats.avgGap5dMin)} hint={cs.stats.gapHint} />
        <StatTile label={cs.nicotine.stats.avgGapAll} value={duration(stats.avgGapAllMin)} hint={cs.stats.gapHint} />
      </div>
      <p className="px-1 text-sm text-muted">{cs.nicotine.stats.emptyDaysNote}</p>

      <Card className="space-y-3">
        <h2 className="font-semibold">💸 {cs.nicotine.stats.money}</h2>
        {spentAll === null ? (
          <p className="text-sm text-muted">{cs.nicotine.stats.moneyNoPrice}</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <StatTile label={cs.nicotine.stats.moneyToday} value={money(spentToday)} />
              <StatTile label={cs.nicotine.stats.money7d} value={money(spent7d)} />
              <StatTile label={cs.nicotine.stats.moneyAll} value={money(spentAll)} />
              <StatTile label={cs.nicotine.stats.moneyPerDay} value={money(perDay)} />
            </div>
            <p className="text-sm text-muted">{cs.nicotine.stats.moneyHint}</p>
          </>
        )}
      </Card>

      <Card className="space-y-2 px-3">
        <h2 className="px-2 font-semibold">{cs.nicotine.chart.timeOfDay}</h2>
        <p className="px-2 text-sm text-muted">{cs.nicotine.chart.timeOfDayHint}</p>
        <TimeOfDayChart doses={inRange} label={cs.nicotine.chart.timeOfDayHint} />
      </Card>
    </div>
  )
}
