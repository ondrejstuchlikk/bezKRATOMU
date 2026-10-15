import { useQueries } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { backend, type DayResult, type LeaderboardRow } from '../api'
import { useMe } from '../auth/SessionProvider'
import { cx, ErrorState, Loading, PageHeader } from '../components/ui'
import { keys, useLeaderboard, useToday } from '../hooks/queries'
import { cs } from '../i18n/cs'
import { addDays, formatShortDate, type ISODate } from '../lib/time'
import { formatDuration, formatPct } from '../lib/units'

/** Finished days shown as squares: the 5 days before today, oldest first. */
const LAST_DAYS = 5

const squareColor = (status: DayResult['status'] | undefined) =>
  status === 'met' ? 'bg-accent' : status === 'over' ? 'bg-over' : 'bg-muted/35'

function LastDaysSquares({ dates, days }: { dates: ISODate[]; days: DayResult[] | undefined }) {
  return (
    <span className="flex shrink-0 gap-1">
      {dates.map((date) => {
        const status = days?.find((d) => d.date === date)?.status
        const label = cs.leaderboard.dayTitle(
          formatShortDate(date),
          status === 'met' || status === 'over' ? cs.status[status] : cs.leaderboard.legend.none,
        )
        return <span key={date} title={label} aria-label={label} className={cx('size-3.5 rounded-[4px]', squareColor(status))} />
      })}
    </span>
  )
}

type Tab = 'points' | 'streak' | 'met' | 'reduction' | 'recordGap' | 'avgGap'

const metric: Record<Tab, (r: LeaderboardRow) => number | null> = {
  points: (r) => r.totalPoints,
  streak: (r) => r.currentStreak,
  met: (r) => r.metPct,
  reduction: (r) => r.reductionLimitPct,
  recordGap: (r) => r.recordGapMin,
  avgGap: (r) => r.avgGap5dMin,
}

function display(tab: Tab, r: LeaderboardRow): string {
  const v = metric[tab](r)
  if (v === null) return '–'
  if (tab === 'points') return String(v)
  if (tab === 'streak') return `🔥 ${v}`
  if (tab === 'recordGap') return `${r.recordGapRunning ? '⏱ ' : ''}${formatDuration(v)}`
  if (tab === 'avgGap') return formatDuration(v)
  return formatPct(v)
}

export function LeaderboardPage() {
  const me = useMe()
  const board = useLeaderboard()
  const today = useToday()
  const [tab, setTab] = useState<Tab>('streak')

  const dates = Array.from({ length: LAST_DAYS }, (_, i) => addDays(today, i - LAST_DAYS))
  const withPlanIds = (board.data ?? []).filter((r) => r.hasPlan).map((r) => r.userId)
  const recent = useQueries({
    queries: withPlanIds.map((id) => ({
      queryKey: keys.days(id, dates[0], dates[LAST_DAYS - 1]),
      queryFn: () => backend.getUserDays(id, dates[0], dates[LAST_DAYS - 1]),
    })),
  })
  const recentByUser = new Map(withPlanIds.map((id, i) => [id, recent[i]?.data]))

  if (board.isPending) return <Loading />
  if (board.isError) return <ErrorState error={board.error} onRetry={() => board.refetch()} />

  const withPlan = board.data.filter((r) => r.hasPlan)
  const withoutPlan = board.data.filter((r) => !r.hasPlan)
  const sorted = [...withPlan].sort(
    (a, b) => (metric[tab](b) ?? -Infinity) - (metric[tab](a) ?? -Infinity) || a.nickname.localeCompare(b.nickname, 'cs'),
  )

  // Equal values share the same rank.
  const ranked: { row: LeaderboardRow; rank: number }[] = []
  sorted.forEach((row, i) => {
    const prev = ranked[i - 1]
    const rank = prev && metric[tab](prev.row) === metric[tab](row) ? prev.rank : i + 1
    ranked.push({ row, rank })
  })

  return (
    <div className="space-y-4">
      <PageHeader title={cs.leaderboard.title} />
      <div className="-mx-4 overflow-x-auto px-4">
        <div className="flex min-w-max gap-2">
          {(Object.keys(cs.leaderboard.tabs) as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cx(
                'min-h-10 rounded-full border px-4 text-sm font-semibold whitespace-nowrap transition',
                t === tab ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface text-muted',
              )}
            >
              {cs.leaderboard.tabs[t]}
            </button>
          ))}
        </div>
      </div>

      {withPlan.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <span>{cs.leaderboard.lastDays}</span>
          {(['met', 'over', 'none'] as const).map((k) => (
            <span key={k} className="flex items-center gap-1">
              <span className={cx('size-3 rounded-[3px]', squareColor(k === 'none' ? undefined : k))} />
              {cs.leaderboard.legend[k]}
            </span>
          ))}
        </div>
      )}

      {!board.data.length ? (
        <p className="py-10 text-center text-muted">{cs.leaderboard.empty}</p>
      ) : (
        <ol className="space-y-2">
          {ranked.map(({ row, rank }) => (
            <li key={row.userId}>
              <Link
                to={`/u/${row.userId}`}
                className={cx(
                  'flex min-h-16 items-center gap-3 rounded-2xl border px-4 py-3 transition active:scale-[.99]',
                  row.userId === me.id ? 'border-accent bg-accent/8' : 'border-line bg-surface',
                )}
              >
                <span
                  className={cx(
                    'flex size-9 shrink-0 items-center justify-center rounded-full font-display text-lg font-semibold',
                    rank === 1 ? 'bg-warn/25' : rank <= 3 ? 'bg-accent/15' : 'bg-bg',
                  )}
                >
                  {rank}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">
                    {row.nickname}
                    {row.userId === me.id && <span className="ml-1.5 text-sm font-normal text-muted">({cs.common.you})</span>}
                  </span>
                  <span className="mt-1 flex items-center gap-2 text-xs text-muted">
                    <LastDaysSquares dates={dates} days={recentByUser.get(row.userId)} />
                    <span className="truncate">
                      {cs.statusIcon[row.todayStatus]} {cs.status[row.todayStatus]}
                    </span>
                  </span>
                </span>
                <span className="font-display text-xl font-semibold tabular-nums">{display(tab, row)}</span>
              </Link>
            </li>
          ))}
          {withoutPlan.map((row) => (
            <li key={row.userId}>
              <Link to={`/u/${row.userId}`} className="flex min-h-14 items-center gap-3 rounded-2xl border border-dashed border-line px-4 text-muted">
                <span className="flex-1 truncate">{row.nickname}</span>
                <span className="text-sm">{cs.leaderboard.noPlan}</span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
