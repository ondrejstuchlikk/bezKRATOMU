import { useState } from 'react'
import { Link } from 'react-router-dom'
import { backend, type DayResult, type Dose } from '../api'
import { useMe } from '../auth/SessionProvider'
import { DoseSheet } from '../components/DoseSheet'
import { PlusIcon } from '../components/icons'
import { Button, Card, cx, ErrorState, errorMessage, Loading, Points, StatusBadge } from '../components/ui'
import {
  useActivePlan,
  useGroupSummary,
  useMyDoses,
  useRefreshAfterChange,
  useSettings,
  useToday,
  useUserDays,
  useUserStats,
} from '../hooks/queries'
import { cs } from '../i18n/cs'
import { addDays, formatLongDate, pragueTime, type ISODate } from '../lib/time'
import { formatGrams, formatNumber, gramsToTeaspoons, round2 } from '../lib/units'

function sumGrams(doses: Dose[]) {
  return round2(doses.reduce((s, d) => s + d.grams, 0))
}

function encouragement(date: ISODate) {
  const list = cs.today.encouragement
  return list[Number(date.replaceAll('-', '')) % list.length]
}

export function TodayPage() {
  const me = useMe()
  const today = useToday()
  const yesterday = addDays(today, -1)
  const plan = useActivePlan()
  const days = useUserDays(me.id, yesterday, today)
  const doses = useMyDoses(yesterday, today)
  const settings = useSettings()
  const stats = useUserStats(me.id)
  const group = useGroupSummary()

  const [sheet, setSheet] = useState<{ dose: Dose | null; date: ISODate } | null>(null)

  if (days.isPending || doses.isPending || settings.isPending) return <Loading />
  if (days.isError || doses.isError || settings.isError) {
    return (
      <ErrorState
        error={days.error ?? doses.error ?? settings.error}
        onRetry={() => {
          days.refetch()
          doses.refetch()
          settings.refetch()
        }}
      />
    )
  }

  const todayRow = days.data.find((d) => d.date === today)
  const yesterdayRow = days.data.find((d) => d.date === yesterday)
  const todayDoses = doses.data.filter((d) => d.localDate === today)
  const yesterdayDoses = doses.data.filter((d) => d.localDate === yesterday)
  const lastDose = doses.data[doses.data.length - 1] ?? null

  return (
    <div className="space-y-5">
      <header>
        <p className="text-sm font-medium text-muted first-letter:uppercase">{formatLongDate(today)}</p>
        <h1 className="font-display text-3xl font-semibold tracking-tight">{cs.today.greeting(me.nickname)}</h1>
      </header>

      {plan.data?.isPaused && (
        <Link to="/plan" className="block rounded-2xl bg-warn/15 px-4 py-3 text-sm font-medium">
          ⏸ {cs.today.paused}
        </Link>
      )}

      {todayRow && <TodayCard row={todayRow} doses={todayDoses} teaspoonGrams={settings.data.teaspoonGrams} />}

      <Button className="w-full text-lg" onClick={() => setSheet({ dose: null, date: today })}>
        <PlusIcon className="size-5" /> {cs.today.addDose}
      </Button>

      <ZeroDayControl date={today} row={todayRow} hasDoses={todayDoses.length > 0} label={cs.today.zeroDay} marked={cs.today.zeroMarked} />

      <Card className="space-y-3">
        <h2 className="font-semibold">{cs.today.doses}</h2>
        <DoseList doses={todayDoses} onEdit={(d) => setSheet({ dose: d, date: today })} />
      </Card>

      {yesterdayRow && (
        <YesterdayCard
          row={yesterdayRow}
          doses={yesterdayDoses}
          onAdd={() => setSheet({ dose: null, date: yesterday })}
          onEdit={(d) => setSheet({ dose: d, date: yesterday })}
        />
      )}

      {stats.data && (
        <div className="grid grid-cols-2 gap-3">
          <Card className="p-4">
            <div className="text-xs font-medium tracking-wide text-muted uppercase">{cs.today.streak}</div>
            <div className="font-display text-2xl font-semibold">🔥 {cs.common.days(stats.data.currentStreak)}</div>
          </Card>
          <Card className="p-4">
            <div className="text-xs font-medium tracking-wide text-muted uppercase">{cs.today.total}</div>
            <div className="font-display text-2xl font-semibold tabular-nums">{cs.common.pointsLong(stats.data.totalPoints)}</div>
          </Card>
        </div>
      )}

      {group.data && group.data.today.participants > 0 && (
        <Link to="/skupina" className="block rounded-3xl border border-line bg-surface p-5 transition active:scale-[.99]">
          <div className="text-xs font-medium tracking-wide text-muted uppercase">{cs.group.title}</div>
          <div className="mt-1 font-semibold">
            {cs.group.todaySummary(group.data.today.met, group.data.today.participants, group.data.today.pending)}
          </div>
          {group.data.yesterday.participants > 0 && (
            <div className="text-sm text-muted">
              {cs.group.yesterdaySummary(group.data.yesterday.met, group.data.yesterday.participants)}
            </div>
          )}
        </Link>
      )}

      <DoseSheet
        open={!!sheet}
        onClose={() => setSheet(null)}
        dose={sheet?.dose}
        defaultDate={sheet?.date ?? today}
        teaspoonGrams={settings.data.teaspoonGrams}
        lastDose={lastDose}
      />
    </div>
  )
}

function TodayCard({ row, doses, teaspoonGrams }: { row: DayResult; doses: Dose[]; teaspoonGrams: number | null }) {
  const limit = row.limitG ?? 0
  const taken = sumGrams(doses)
  const left = round2(limit - taken)
  const ratio = limit > 0 ? taken / limit : taken > 0 ? 2 : 0
  const tone = ratio > 1 ? 'over' : ratio >= 0.8 ? 'warn' : 'accent'
  const barColor = { over: 'bg-over', warn: 'bg-warn', accent: 'bg-accent' }[tone]

  return (
    <Card className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-medium tracking-wide text-muted uppercase">{cs.today.limit}</div>
          <div className="font-display text-5xl font-semibold tabular-nums">
            {formatNumber(limit)}
            <span className="ml-1 text-2xl text-muted">g</span>
          </div>
          {teaspoonGrams && limit > 0 && (
            <div className="mt-1 font-semibold text-muted tabular-nums">{cs.dose.tspApprox(gramsToTeaspoons(limit, teaspoonGrams))}</div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <StatusBadge status={row.status} provisional={row.status !== 'pending'} />
          {row.status !== 'pending' && <Points value={row.points} className="text-sm" />}
        </div>
      </div>

      <div
        className="h-4 overflow-hidden rounded-full bg-line/70"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={taken}
      >
        <div className={cx('h-full rounded-full transition-all duration-500', barColor)} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-sm text-muted">{cs.today.taken}</div>
          <div className="text-xl font-semibold tabular-nums">{formatGrams(taken)}</div>
        </div>
        <div className="text-right">
          <div className="text-sm text-muted">{left < 0 ? cs.today.overBy : cs.today.remaining}</div>
          <div className={cx('text-xl font-semibold tabular-nums', left < 0 && 'text-over')}>
            {formatGrams(Math.abs(left))}
          </div>
          {teaspoonGrams && left > 0 && (
            <div className="text-sm text-muted tabular-nums">{cs.dose.tspApprox(gramsToTeaspoons(left, teaspoonGrams))}</div>
          )}
        </div>
      </div>

      {limit === 0 && taken === 0 && <p className="text-sm font-medium text-accent">{cs.today.zeroTarget}</p>}
      {row.status === 'over' && <p className="rounded-2xl bg-bg p-3 text-sm leading-relaxed">{encouragement(row.date)}</p>}
    </Card>
  )
}

function DoseList({ doses, onEdit }: { doses: Dose[]; onEdit: (d: Dose) => void }) {
  if (!doses.length) return <p className="text-sm text-muted">{cs.today.noDoses}</p>
  return (
    <ul className="-mx-2 divide-y divide-line">
      {doses.map((d) => (
        <li key={d.id}>
          <button
            type="button"
            onClick={() => onEdit(d)}
            className="flex min-h-14 w-full items-center gap-3 rounded-xl px-2 py-2 text-left active:bg-bg"
          >
            <span className="w-12 shrink-0 font-semibold text-muted tabular-nums">{pragueTime(new Date(d.takenAt))}</span>
            <span className="flex-1">
              <span className="font-semibold">{formatGrams(d.grams)}</span>
              {d.inputUnit === 'tsp' && (
                <span className="ml-1.5 text-sm text-muted">({formatNumber(d.inputAmount)} lž.)</span>
              )}
              {d.note && <span className="block truncate text-sm text-muted">{d.note}</span>}
            </span>
            {d.feeling && (
              <span className="text-2xl" aria-label={cs.feelings[d.feeling - 1].label}>
                {cs.feelings[d.feeling - 1].emoji}
              </span>
            )}
          </button>
        </li>
      ))}
    </ul>
  )
}

function ZeroDayControl({
  date,
  row,
  hasDoses,
  label,
  marked,
}: {
  date: ISODate
  row?: DayResult
  hasDoses: boolean
  label: string
  marked: string
}) {
  const refresh = useRefreshAfterChange()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (hasDoses) return null

  async function toggle(on: boolean) {
    setBusy(true)
    setError(null)
    try {
      await backend.setZeroDay(date, on)
      await refresh()
    } catch (err) {
      setError(errorMessage(err))
    }
    setBusy(false)
  }

  return (
    <div>
      {row?.zeroDay ? (
        <div className="flex min-h-12 items-center justify-between rounded-2xl bg-accent/12 px-4">
          <span className="font-semibold text-accent">{marked}</span>
          <button type="button" className="min-h-10 px-2 text-sm font-medium text-muted" disabled={busy} onClick={() => toggle(false)}>
            {cs.today.undo}
          </button>
        </div>
      ) : (
        <Button variant="secondary" className="w-full" disabled={busy} onClick={() => toggle(true)}>
          🌱 {label}
        </Button>
      )}
      {error && <p className="mt-2 text-sm text-over">{error}</p>}
    </div>
  )
}

function YesterdayCard({
  row,
  doses,
  onAdd,
  onEdit,
}: {
  row: DayResult
  doses: Dose[]
  onAdd: () => void
  onEdit: (d: Dose) => void
}) {
  const [expanded, setExpanded] = useState(!row.logged)
  return (
    <Card className="space-y-3">
      <button type="button" className="flex w-full items-center justify-between gap-2 text-left" onClick={() => setExpanded(!expanded)}>
        <div>
          <h2 className="font-semibold">{cs.today.yesterday}</h2>
          <p className="text-sm text-muted">
            {row.zeroDay ? cs.day.zeroDay : `${formatGrams(row.totalG ?? 0)} / ${formatGrams(row.limitG ?? 0)} · ${cs.today.yesterdayDoses(doses.length)}`}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <StatusBadge status={row.status} provisional />
          <Points value={row.points} className="text-sm" />
        </div>
      </button>
      {!row.logged && <p className="rounded-2xl bg-warn/12 p-3 text-sm">{cs.today.yesterdayMissing}</p>}
      {expanded && (
        <div className="space-y-3">
          <DoseList doses={doses} onEdit={onEdit} />
          <Button variant="secondary" className="w-full" onClick={onAdd}>
            <PlusIcon className="size-5" /> {cs.today.yesterdayAdd}
          </Button>
          <ZeroDayControl
            date={row.date}
            row={row}
            hasDoses={doses.length > 0}
            label={cs.today.yesterdayZero}
            marked={cs.day.zeroDay}
          />
        </div>
      )}
    </Card>
  )
}
