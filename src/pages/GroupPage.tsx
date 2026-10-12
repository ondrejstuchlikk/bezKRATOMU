import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMe } from '../auth/SessionProvider'
import { Card, cx, ErrorState, Loading, PageHeader } from '../components/ui'
import { useFeed, useGroupSummary, useLeaderboard, useToday } from '../hooks/queries'
import { cs } from '../i18n/cs'
import { formatShortDate } from '../lib/time'

export function GroupPage() {
  const me = useMe()
  const today = useToday()
  const summary = useGroupSummary()
  const board = useLeaderboard()
  const [feedOpen, setFeedOpen] = useState(false)
  const feed = useFeed(feedOpen)

  if (summary.isPending || board.isPending) return <Loading />
  if (summary.isError || board.isError) {
    return <ErrorState error={summary.error ?? board.error} onRetry={() => { summary.refetch(); board.refetch() }} />
  }

  const { today: t, yesterday: y } = summary.data
  const members = board.data.filter((r) => r.hasPlan)
  const order = { met: 0, pending: 1, over: 2, missed: 3, none: 4 }
  members.sort((a, b) => order[a.todayStatus] - order[b.todayStatus] || a.nickname.localeCompare(b.nickname, 'cs'))

  return (
    <div className="space-y-5">
      <PageHeader title={cs.group.title} />

      <Card className="space-y-3">
        <p className="font-display text-xl font-semibold">{cs.group.todaySummary(t.met, t.participants, t.pending)}</p>
        <div className="flex h-3 overflow-hidden rounded-full bg-line/70" aria-hidden>
          <div className="bg-accent" style={{ width: `${(100 * t.met) / Math.max(1, t.participants)}%` }} />
          <div className="bg-warn" style={{ width: `${(100 * t.over) / Math.max(1, t.participants)}%` }} />
        </div>
        {y.participants > 0 && <p className="text-sm text-muted">{cs.group.yesterdaySummary(y.met, y.participants)}</p>}
      </Card>

      <section className="space-y-2">
        <h2 className="px-1 font-semibold">{cs.group.members}</h2>
        <ul className="grid grid-cols-2 gap-2">
          {members.map((m) => (
            <li key={m.userId}>
              <Link
                to={`/u/${m.userId}/${today}`}
                className={cx(
                  'flex min-h-16 items-center gap-2 rounded-2xl border px-3 py-2 transition active:scale-[.98]',
                  m.userId === me.id ? 'border-accent bg-accent/8' : 'border-line bg-surface',
                )}
              >
                <span className="text-xl" aria-hidden>
                  {cs.statusIcon[m.todayStatus]}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{m.nickname}</span>
                  <span className="block text-xs text-muted">{cs.status[m.todayStatus]}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-3xl border border-line bg-surface">
        <button
          type="button"
          onClick={() => setFeedOpen(!feedOpen)}
          className="flex min-h-14 w-full items-center justify-between px-5 font-semibold"
          aria-expanded={feedOpen}
        >
          {cs.group.feed}
          <span className="text-sm font-medium text-accent">{feedOpen ? cs.group.hideFeed : cs.group.showFeed}</span>
        </button>
        {feedOpen && (
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
    </div>
  )
}
