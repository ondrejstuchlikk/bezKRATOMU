import { Fragment, useState } from 'react'
import type { Intake } from '../api'
import { useMe } from '../auth/SessionProvider'
import { PlusIcon } from '../components/icons'
import { CaffeineLevelCard } from '../components/CaffeineLevelCard'
import { IntakeSheet } from '../components/IntakeSheet'
import { Button, Card, cx, ErrorState, Loading } from '../components/ui'
import { useIntakePresets, useIntakeStats, useNow, useSettings, useToday } from '../hooks/queries'
import { cs } from '../i18n/cs'
import { EDIT_WINDOW_DAYS } from '../lib/days'
import { round1 } from '../lib/substances'
import { addDays, formatLongDate, formatWeekday, pragueTime, type ISODate } from '../lib/time'
import { formatDuration, formatMg, formatNumber } from '../lib/units'

const sum = (list: Intake[]) => round1(list.reduce((s, i) => s + i.amount, 0))

const CAFFEINE = ['caffeine'] as const

/** The entry right before the first one of `day` (all lists sorted by time). */
const entryBefore = (all: Intake[], day: Intake[]) => (day.length ? all[all.indexOf(day[0]) - 1] : undefined)

/** Dnes tab for a substance without a plan (caffeine). */
export function IntakeTodayPage({ substance }: { substance: 'caffeine' }) {
  const me = useMe()
  const today = useToday()
  const now = useNow()
  // All entries: the statistics need them anyway, and the lists below are a slice of them.
  const all = useIntakeStats(CAFFEINE, today, now)
  const presets = useIntakePresets(substance)
  const settings = useSettings()
  const [sheet, setSheet] = useState<{ intake: Intake | null; date: ISODate } | null>(null)

  if (all.isPending || presets.isPending) return <Loading />
  if (all.isError || presets.isError) {
    return (
      <ErrorState
        error={all.error ?? presets.error}
        onRetry={() => {
          all.refetch()
          presets.refetch()
        }}
      />
    )
  }

  const intakes = all.data
  const stats = all.stats!
  const todayList = intakes.filter((i) => i.localDate === today)
  // Latest entry that has already happened (one logged for later today doesn't count yet).
  const sinceLastMin = stats.lastDoseAt ? (now.getTime() - new Date(stats.lastDoseAt).getTime()) / 60000 : null

  return (
    <div className="space-y-5">
      <header>
        <p className="text-sm font-medium text-muted first-letter:uppercase">{formatLongDate(today)}</p>
        <h1 className="font-display text-3xl font-semibold tracking-tight">{cs.today.greeting(me.nickname)}</h1>
      </header>

      <Card className="space-y-4">
        <div>
          <div className="text-xs font-medium tracking-wide text-muted uppercase">
            {cs.substances.emoji[substance]} {cs.caffeine.todayTotal}
          </div>
          <div className="font-display text-5xl font-semibold tabular-nums">
            {formatNumber(stats.todayTotal)}
            <span className="ml-1 text-2xl text-muted">mg</span>
          </div>
          <div className="mt-1 text-sm text-muted">{cs.caffeine.entries(todayList.length)}</div>
        </div>
        {stats.avg7d !== null && <p className="text-sm text-muted">{cs.caffeine.avg7d(formatMg(stats.avg7d))}</p>}
        {sinceLastMin !== null && (
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-bg px-3 py-2">
            <span className="text-sm text-muted">⏱ {cs.caffeine.sinceLast}</span>
            <span className="font-semibold tabular-nums">{formatDuration(sinceLastMin)}</span>
          </div>
        )}
      </Card>

      <Button className="w-full text-lg" onClick={() => setSheet({ intake: null, date: today })}>
        <PlusIcon className="size-5" /> {cs.caffeine.add}
      </Button>

      <Card className="space-y-3">
        <h2 className="font-semibold">{cs.caffeine.list}</h2>
        <IntakeList list={todayList} previous={entryBefore(intakes, todayList)} onEdit={(i) => setSheet({ intake: i, date: today })} />
      </Card>

      <CaffeineLevelCard
        intakes={intakes}
        today={today}
        now={now}
        weightKg={settings.data?.bodyWeightKg ?? null}
        bedtime={settings.data?.bedtime ?? '23:00'}
      />

      <LastDaysCard
        today={today}
        all={intakes}
        onAdd={(date) => setSheet({ intake: null, date })}
        onEdit={(i) => setSheet({ intake: i, date: i.localDate })}
      />

      <p className="text-center text-sm text-muted">🔒 {cs.caffeine.privateNote}</p>

      <IntakeSheet
        substance={substance}
        open={!!sheet}
        onClose={() => setSheet(null)}
        intake={sheet?.intake}
        defaultDate={sheet?.date ?? today}
        presets={presets.data}
        lastIntake={intakes[intakes.length - 1] ?? null}
      />
    </div>
  )
}

function IntakeList({ list, previous, onEdit }: { list: Intake[]; previous?: Intake; onEdit: (i: Intake) => void }) {
  if (!list.length) return <p className="text-sm text-muted">{cs.caffeine.none}</p>
  return (
    <ul className="-mx-2">
      {list.map((i, n) => {
        const from = n > 0 ? list[n - 1] : previous
        return (
          <Fragment key={i.id}>
            {from && (
              <li className="flex items-center gap-2 px-2 text-sm font-medium text-muted tabular-nums">
                <span>
                  {(() => {
                    const d = formatDuration((new Date(i.takenAt).getTime() - new Date(from.takenAt).getTime()) / 60000)
                    return n === 0 ? cs.caffeine.sincePrevious(d) : d
                  })()}
                </span>
                <span className="h-px flex-1 bg-line" />
              </li>
            )}
            <li>
              <button
                type="button"
                onClick={() => onEdit(i)}
                className="flex min-h-14 w-full items-center gap-3 rounded-xl px-2 py-2 text-left active:bg-bg"
              >
                <span className="w-12 shrink-0 font-semibold text-muted tabular-nums">{pragueTime(new Date(i.takenAt))}</span>
                <span className="flex-1">
                  <span className="font-semibold">{formatMg(i.amount)}</span>
                  {i.presetName && (
                    <span className="ml-1.5 text-sm text-muted">
                      ({i.presetCount === 1 ? '' : `${formatNumber(i.presetCount ?? 0)} × `}
                      {i.presetName})
                    </span>
                  )}
                </span>
              </button>
            </li>
          </Fragment>
        )
      })}
    </ul>
  )
}

/** The 7 editable days before today: pick one, then see and edit its entries. */
function LastDaysCard({
  today,
  all,
  onAdd,
  onEdit,
}: {
  today: ISODate
  all: Intake[]
  onAdd: (date: ISODate) => void
  onEdit: (i: Intake) => void
}) {
  const [selected, setSelected] = useState<ISODate | null>(null)
  const dates = Array.from({ length: EDIT_WINDOW_DAYS }, (_, i) => addDays(today, -EDIT_WINDOW_DAYS + i))
  const list = all.filter((i) => i.localDate === selected)
  return (
    <Card className="space-y-3">
      <h2 className="font-semibold">{cs.caffeine.lastDays}</h2>
      <div className="grid grid-cols-7 gap-1">
        {dates.map((d) => {
          const total = sum(all.filter((i) => i.localDate === d))
          return (
            <button
              key={d}
              type="button"
              aria-pressed={d === selected}
              aria-label={`${formatLongDate(d)}: ${formatMg(total)}`}
              onClick={() => setSelected(d === selected ? null : d)}
              className={cx(
                'flex min-h-16 flex-col items-center justify-center rounded-2xl border transition',
                d === selected ? 'border-accent bg-accent/12' : 'border-line bg-bg',
              )}
            >
              <span className="text-xs text-muted">{formatWeekday(d)}</span>
              <span className="font-semibold tabular-nums">{Number(d.slice(8))}.</span>
              <span className={cx('text-[11px] tabular-nums', total ? 'text-ink' : 'text-muted')}>{formatNumber(total)}</span>
            </button>
          )
        })}
      </div>
      {selected ? (
        <>
          <div className="pt-1">
            <h3 className="font-semibold first-letter:uppercase">{formatLongDate(selected)}</h3>
            <p className="text-sm text-muted">{cs.caffeine.dayTotal(formatMg(sum(list)), list.length)}</p>
          </div>
          <IntakeList list={list} previous={entryBefore(all, list)} onEdit={onEdit} />
          <Button variant="secondary" className="w-full" onClick={() => onAdd(selected)}>
            <PlusIcon className="size-5" /> {cs.caffeine.addToDay}
          </Button>
        </>
      ) : (
        <p className="text-sm text-muted">{cs.caffeine.lastDaysHint}</p>
      )}
    </Card>
  )
}
