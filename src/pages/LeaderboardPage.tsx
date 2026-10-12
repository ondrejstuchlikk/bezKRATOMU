import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { LeaderboardRow } from '../api'
import { useMe } from '../auth/SessionProvider'
import { cx, ErrorState, Loading, PageHeader } from '../components/ui'
import { useLeaderboard } from '../hooks/queries'
import { cs } from '../i18n/cs'
import { formatPct } from '../lib/units'

type Tab = 'points' | 'streak' | 'met' | 'reduction'

const metric: Record<Tab, (r: LeaderboardRow) => number | null> = {
  points: (r) => r.totalPoints,
  streak: (r) => r.currentStreak,
  met: (r) => r.metPct,
  reduction: (r) => r.reductionLimitPct,
}

function display(tab: Tab, r: LeaderboardRow): string {
  const v = metric[tab](r)
  if (v === null) return '–'
  if (tab === 'points') return String(v)
  if (tab === 'streak') return `🔥 ${v}`
  return formatPct(v)
}

export function LeaderboardPage() {
  const me = useMe()
  const board = useLeaderboard()
  const [tab, setTab] = useState<Tab>('points')

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
                  <span className="text-xs text-muted">
                    {cs.statusIcon[row.todayStatus]} {cs.status[row.todayStatus]}
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
