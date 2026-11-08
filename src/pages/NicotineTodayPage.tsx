import { Fragment, useEffect, useState } from 'react'
import { backend, type Intake } from '../api'
import { useMe } from '../auth/SessionProvider'
import { NicotineSheet } from '../components/NicotineSheet'
import { Button, Card, cx, ErrorState, errorMessage, Loading } from '../components/ui'
import { useIntakeStats, useNow, useRefreshIntakes, useSettings, useToday } from '../hooks/queries'
import { cs } from '../i18n/cs'
import { EDIT_WINDOW_DAYS } from '../lib/days'
import { moneySpent } from '../lib/nicotine'
import { NICOTINE_FORMS, trackedForms, type NicotineForm } from '../lib/substances'
import { addDays, formatLongDate, formatWeekday, pragueTime, type ISODate } from '../lib/time'
import { formatDuration, formatMoney, formatNumber } from '../lib/units'

const entryBefore = (all: Intake[], day: Intake[]) => (day.length ? all[all.indexOf(day[0]) - 1] : undefined)
const countOf = (list: Intake[], form: NicotineForm) => list.filter((i) => i.substance === form).length

/** One piece of `form`, taken right now. */
const pieceNow = (form: NicotineForm) => ({ substance: form, takenAt: new Date(), amount: 1, presetName: null, presetCount: null })

/** Dnes tab for nicotine: one tap per cigarette or pouch. */
export function NicotineTodayPage() {
  const me = useMe()
  const today = useToday()
  const now = useNow()
  const settings = useSettings()
  // Both forms together: the time between entries counts across cigarettes and snus.
  const all = useIntakeStats(NICOTINE_FORMS, today, now)
  const refresh = useRefreshIntakes()
  const [sheet, setSheet] = useState<{ intake: Intake | null; date: ISODate } | null>(null)
  const [added, setAdded] = useState<{ id: string; time: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // The "Zapsáno ✓ · Zpět" line disappears after a while.
  useEffect(() => {
    if (!added) return
    const id = setTimeout(() => setAdded(null), 8000)
    return () => clearTimeout(id)
  }, [added])

  if (all.isPending || settings.isPending) return <Loading />
  if (all.isError || settings.isError) {
    return (
      <ErrorState
        error={all.error ?? settings.error}
        onRetry={() => {
          all.refetch()
          settings.refetch()
        }}
      />
    )
  }

  const forms = trackedForms(settings.data)
  const intakes = all.data
  const stats = all.stats!
  const todayList = intakes.filter((i) => i.localDate === today)
  // Forms shown on the page: tracked ones, plus any with entries today (e.g. just switched off).
  const shownForms = NICOTINE_FORMS.filter((f) => forms.includes(f) || countOf(todayList, f) > 0)
  const spentToday = moneySpent(todayList, settings.data)
  const sinceLastMin = stats.lastDoseAt ? (now.getTime() - new Date(stats.lastDoseAt).getTime()) / 60000 : null

  async function addNow(form: NicotineForm) {
    setBusy(true)
    setError(null)
    try {
      const input = pieceNow(form)
      const id = await backend.addIntake(input)
      await refresh()
      setAdded({ id, time: pragueTime(input.takenAt) })
    } catch (err) {
      setError(errorMessage(err))
    }
    setBusy(false)
  }

  async function undo() {
    if (!added) return
    setBusy(true)
    try {
      await backend.deleteIntake(added.id)
      await refresh()
      setAdded(null)
    } catch (err) {
      setError(errorMessage(err))
    }
    setBusy(false)
  }

  return (
    <div className="space-y-5">
      <header>
        <p className="text-sm font-medium text-muted first-letter:uppercase">{formatLongDate(today)}</p>
        <h1 className="font-display text-3xl font-semibold tracking-tight">{cs.today.greeting(me.nickname)}</h1>
      </header>

      <Card className="space-y-4">
        <div className="text-xs font-medium tracking-wide text-muted uppercase">
          {cs.substances.emoji.nicotine} {cs.nicotine.todayTitle}
        </div>
        <div className={cx('grid gap-3', shownForms.length > 1 ? 'grid-cols-2' : 'grid-cols-1')}>
          {shownForms.map((f) => (
            <div key={f}>
              <div className="font-display text-5xl font-semibold tabular-nums">{countOf(todayList, f)}</div>
              <div className="text-sm text-muted">
                {cs.nicotine.forms[f].emoji} {cs.nicotine.forms[f].name}
              </div>
            </div>
          ))}
        </div>
        {(spentToday !== null || stats.avg7d !== null) && (
          <div className="space-y-0.5 text-sm text-muted">
            {spentToday !== null && <p>💸 {cs.nicotine.spentToday(formatMoney(spentToday))}</p>}
            {stats.avg7d !== null && <p>{cs.nicotine.avg7d(formatNumber(stats.avg7d))}</p>}
          </div>
        )}
        {sinceLastMin !== null && (
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-bg px-3 py-2">
            <span className="text-sm text-muted">⏱ {cs.nicotine.sinceLast}</span>
            <span className="font-semibold tabular-nums">{formatDuration(sinceLastMin)}</span>
          </div>
        )}
      </Card>

      <div className="space-y-2">
        <div className={cx('grid gap-3', forms.length > 1 ? 'grid-cols-2' : 'grid-cols-1')}>
          {forms.map((f) => (
            <Button key={f} className="min-h-16 w-full text-lg" disabled={busy} onClick={() => addNow(f)}>
              {cs.nicotine.forms[f].emoji} {cs.nicotine.forms[f].add}
            </Button>
          ))}
        </div>
        {added && (
          <div className="flex min-h-11 items-center justify-between rounded-2xl bg-accent/12 px-4" role="status">
            <span className="font-semibold text-accent">{cs.nicotine.added(added.time)}</span>
            <button type="button" className="min-h-10 px-2 text-sm font-semibold text-muted" disabled={busy} onClick={undo}>
              {cs.nicotine.undo}
            </button>
          </div>
        )}
        {error && (
          <p className="text-sm text-over" role="alert">
            {error}
          </p>
        )}
        <button
          type="button"
          className="min-h-10 w-full text-sm font-semibold text-accent"
          onClick={() => setSheet({ intake: null, date: today })}
        >
          {cs.nicotine.addWithTime}
        </button>
      </div>

      <Card className="space-y-3">
        <h2 className="font-semibold">{cs.nicotine.list}</h2>
        <EntryList list={todayList} previous={entryBefore(intakes, todayList)} onEdit={(i) => setSheet({ intake: i, date: today })} />
      </Card>

      <LastDaysCard
        today={today}
        all={intakes}
        onAdd={(date) => setSheet({ intake: null, date })}
        onEdit={(i) => setSheet({ intake: i, date: i.localDate })}
      />

      <p className="text-center text-sm text-muted">🔒 {cs.nicotine.privateNote}</p>

      <NicotineSheet
        open={!!sheet}
        onClose={() => setSheet(null)}
        intake={sheet?.intake}
        defaultDate={sheet?.date ?? today}
        forms={forms.length ? forms : ['cigarette']}
      />
    </div>
  )
}

function EntryList({ list, previous, onEdit }: { list: Intake[]; previous?: Intake; onEdit: (i: Intake) => void }) {
  if (!list.length) return <p className="text-sm text-muted">{cs.nicotine.none}</p>
  return (
    <ul className="-mx-2">
      {list.map((i, n) => {
        const from = n > 0 ? list[n - 1] : previous
        const form = cs.nicotine.forms[i.substance as NicotineForm]
        const gap = from && formatDuration((new Date(i.takenAt).getTime() - new Date(from.takenAt).getTime()) / 60000)
        return (
          <Fragment key={i.id}>
            {gap && (
              <li className="flex items-center gap-2 px-2 text-sm font-medium text-muted tabular-nums">
                <span>{n === 0 ? cs.nicotine.sincePrevious(gap) : gap}</span>
                <span className="h-px flex-1 bg-line" />
              </li>
            )}
            <li>
              <button
                type="button"
                onClick={() => onEdit(i)}
                className="flex min-h-12 w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left active:bg-bg"
              >
                <span className="w-12 shrink-0 font-semibold text-muted tabular-nums">{pragueTime(new Date(i.takenAt))}</span>
                <span className="flex-1 font-semibold">
                  {form.emoji} {form.one}
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
  const summary = (day: Intake[]) =>
    NICOTINE_FORMS.filter((f) => countOf(day, f) > 0)
      .map((f) => cs.nicotine.forms[f].count(countOf(day, f)))
      .join(' · ') || '0'
  return (
    <Card className="space-y-3">
      <h2 className="font-semibold">{cs.nicotine.lastDays}</h2>
      <div className="grid grid-cols-7 gap-1">
        {dates.map((d) => {
          const day = all.filter((i) => i.localDate === d)
          return (
            <button
              key={d}
              type="button"
              aria-pressed={d === selected}
              aria-label={`${formatLongDate(d)}: ${summary(day)}`}
              onClick={() => setSelected(d === selected ? null : d)}
              className={cx(
                'flex min-h-16 flex-col items-center justify-center rounded-2xl border transition',
                d === selected ? 'border-accent bg-accent/12' : 'border-line bg-bg',
              )}
            >
              <span className="text-xs text-muted">{formatWeekday(d)}</span>
              <span className="font-semibold tabular-nums">{Number(d.slice(8))}.</span>
              <span className={cx('text-[11px] tabular-nums', day.length ? 'text-ink' : 'text-muted')}>{day.length}</span>
            </button>
          )
        })}
      </div>
      {selected ? (
        <>
          <div className="pt-1">
            <h3 className="font-semibold first-letter:uppercase">{formatLongDate(selected)}</h3>
            <p className="text-sm text-muted">{summary(list)}</p>
          </div>
          <EntryList list={list} previous={entryBefore(all, list)} onEdit={onEdit} />
          <Button variant="secondary" className="w-full" onClick={() => onAdd(selected)}>
            {cs.nicotine.addToDay}
          </Button>
        </>
      ) : (
        <p className="text-sm text-muted">{cs.nicotine.lastDaysHint}</p>
      )}
    </Card>
  )
}
