import { useQueries } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { backend, type DayResult, type GroupMemberToday, type LeaderboardRow } from '../api'
import { useMe } from '../auth/SessionProvider'
import { Card, cx, ErrorState, Loading, PageHeader } from '../components/ui'
import { keys, useFeed, useGroupSummary, useGroupToday, useLeaderboard, useToday } from '../hooks/queries'
import { cs } from '../i18n/cs'
import { addDays, formatShortDate, type ISODate } from '../lib/time'
import { formatDuration, formatNumber, formatPct } from '../lib/units'

/** Finished days shown as squares: the 5 days before today, oldest first. */
const LAST_DAYS = 5

type RankTab = 'streak' | 'met' | 'reduction' | 'recordGap' | 'avgGap'
type Tab = 'today' | RankTab

const metric: Record<RankTab, (r: LeaderboardRow) => number | null> = {
  streak: (r) => r.currentStreak,
  met: (r) => r.metPct,
  reduction: (r) => r.reductionLimitPct,
  recordGap: (r) => r.recordGapMin,
  avgGap: (r) => r.avgGap5dMin,
}

function display(tab: RankTab, r: LeaderboardRow): string {
  const v = metric[tab](r)
  if (v === null) return '–'
  if (tab === 'streak') return `🔥 ${v}`
  if (tab === 'recordGap') return `${r.recordGapRunning ? '⏱ ' : ''}${formatDuration(v)}`
  if (tab === 'avgGap') return formatDuration(v)
  return formatPct(v)
}

export function GroupPage() {
  const [tab, setTab] = useState<Tab>('streak')

  return (
    <div className="space-y-4">
      <PageHeader title={cs.group.title} />
      <div className="-mx-4 overflow-x-auto px-4">
        <div className="flex min-w-max gap-2">
          {(Object.keys(cs.group.tabs) as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cx(
                'min-h-10 rounded-full border px-4 text-sm font-semibold whitespace-nowrap transition',
                t === tab ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface text-muted',
              )}
            >
              {cs.group.tabs[t]}
            </button>
          ))}
        </div>
      </div>

      {tab === 'today' ? <TodayTab /> : <Ranking tab={tab} />}

      <Feed />
    </div>
  )
}

/** Lowest share of the limit first; over a 0 g limit next, nothing logged last. */
function sortKey(m: GroupMemberToday): number {
  if (!m.logged) return Infinity
  return m.pctOfLimit ?? Number.MAX_VALUE
}

/** Everyone sharing the group's longest time between doses. */
function groupRecord(rows: LeaderboardRow[]) {
  const best = Math.max(...rows.map((r) => r.recordGapMin ?? -1))
  if (best < 0) return null
  const holders = rows.filter((r) => r.recordGapMin === best)
  return {
    minutes: best,
    names: holders.map((r) => r.nickname).sort((a, b) => a.localeCompare(b, 'cs')).join(', '),
    running: holders.some((r) => r.recordGapRunning),
  }
}

function TodayTab() {
  const me = useMe()
  const today = useToday()
  const summary = useGroupSummary()
  const group = useGroupToday()
  const board = useLeaderboard()

  if (summary.isPending || group.isPending) return <Loading />
  if (summary.isError || group.isError) {
    return <ErrorState error={summary.error ?? group.error} onRetry={() => { summary.refetch(); group.refetch() }} />
  }

  const { today: t, yesterday: y } = summary.data
  const record = board.data ? groupRecord(board.data) : null
  const members = [...group.data].sort(
    (a, b) => sortKey(a) - sortKey(b) || a.nickname.localeCompare(b.nickname, 'cs'),
  )

  return (
    <div className="space-y-5">
      <Card className="space-y-3">
        <p className="font-display text-xl font-semibold">{cs.group.todaySummary(t.met, t.participants, t.pending)}</p>
        <div className="flex h-3 overflow-hidden rounded-full bg-line/70" aria-hidden>
          <div className="bg-accent" style={{ width: `${(100 * t.met) / Math.max(1, t.participants)}%` }} />
          <div className="bg-warn" style={{ width: `${(100 * t.over) / Math.max(1, t.participants)}%` }} />
        </div>
        {y.participants > 0 && <p className="text-sm text-muted">{cs.group.yesterdaySummary(y.met, y.participants)}</p>}
      </Card>

      {record && (
        <div className="rounded-2xl border border-line bg-surface px-4 py-3">
          <div className="text-xs font-medium tracking-wide text-muted uppercase">🏆 {cs.group.recordGap}</div>
          <div className="mt-1 font-semibold">
            {record.names} · <span className="tabular-nums">{formatDuration(record.minutes)}</span>
            {record.running && <span className="ml-1.5 text-sm font-normal text-muted">⏱ {cs.group.recordGapRunning}</span>}
          </div>
        </div>
      )}

      <section className="space-y-2">
        <h2 className="px-1 font-semibold">{cs.group.members}</h2>
        <ul className="space-y-2">
          {members.map((m) => (
            <li key={m.userId}>
              <Link
                to={`/u/${m.userId}/${today}`}
                className={cx(
                  'flex min-h-16 items-center gap-3 rounded-2xl border px-4 py-2 transition active:scale-[.98]',
                  m.userId === me.id ? 'border-accent bg-accent/8' : 'border-line bg-surface',
                )}
              >
                <span className="text-xl" aria-hidden>
                  {cs.statusIcon[m.status]}
                </span>
                <span className="min-w-0 flex-1 truncate font-semibold">{m.nickname}</span>
                <span className="shrink-0 text-right tabular-nums">
                  <span className={cx('block text-lg font-semibold', m.status === 'over' && 'text-over')}>
                    {!m.logged ? '–' : m.pctOfLimit === null ? cs.group.overZeroLimit : cs.group.pctOfLimit(m.pctOfLimit)}
                  </span>
                  {m.logged && m.totalG !== null && m.limitG !== null && (
                    <span className="block text-xs text-muted">
                      {cs.group.gramsOfLimit(formatNumber(m.totalG), formatNumber(m.limitG))}
                    </span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

const squareColor = (status: DayResult['status'] | undefined) =>
  status === 'met' ? 'bg-accent' : status === 'over' ? 'bg-over' : 'bg-muted/35'

function LastDaysSquares({ dates, days }: { dates: ISODate[]; days: DayResult[] | undefined }) {
  return (
    <span className="flex shrink-0 gap-1">
      {dates.map((date) => {
        const status = days?.find((d) => d.date === date)?.status
        const label = cs.group.dayTitle(
          formatShortDate(date),
          status === 'met' || status === 'over' ? cs.status[status] : cs.group.legend.none,
        )
        return <span key={date} title={label} aria-label={label} className={cx('size-3.5 rounded-[4px]', squareColor(status))} />
      })}
    </span>
  )
}

function Ranking({ tab }: { tab: RankTab }) {
  const me = useMe()
  const board = useLeaderboard()
  const today = useToday()

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
      {withPlan.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <span>{cs.group.lastDays}</span>
          {(['met', 'over', 'none'] as const).map((k) => (
            <span key={k} className="flex items-center gap-1">
              <span className={cx('size-3 rounded-[3px]', squareColor(k === 'none' ? undefined : k))} />
              {cs.group.legend[k]}
            </span>
          ))}
        </div>
      )}

      {!board.data.length ? (
        <p className="py-10 text-center text-muted">{cs.group.empty}</p>
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
                <span className="text-sm">{cs.group.noPlan}</span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

function Feed() {
  const [open, setOpen] = useState(false)
  const feed = useFeed(open)

  return (
    <section className="rounded-3xl border border-line bg-surface">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex min-h-14 w-full items-center justify-between px-5 font-semibold"
        aria-expanded={open}
      >
        {cs.group.feed}
        <span className="text-sm font-medium text-accent">{open ? cs.group.hideFeed : cs.group.showFeed}</span>
      </button>
      {open && (
        <div className="border-t border-line px-5 py-3">
          {feed.isPending ? (
            <Loading />
          ) : feed.isError ? (
            <ErrorState error={feed.error} onRetry={() => feed.refetch()} />
          ) : !feed.data.length ? (
            <p className="py-4 text-sm text-muted">{cs.group.feedEmpty}</p>
          ) : (
            <ul className="divide-y divide-line">
              {feed.data.map((e) => (
                <li key={e.id} className="flex gap-3 py-3 text-sm">
                  <span className="w-12 shrink-0 text-muted tabular-nums">{formatShortDate(e.eventDate)}</span>
                  <Link to={`/u/${e.userId}`} className="flex-1">
                    {cs.group.events[e.type](e.nickname, e.payload)}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
