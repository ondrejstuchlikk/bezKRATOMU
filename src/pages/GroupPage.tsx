import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMe } from '../auth/SessionProvider'
import type { GroupMemberToday } from '../api'
import { Card, cx, ErrorState, Loading, PageHeader } from '../components/ui'
import { useFeed, useGroupSummary, useGroupToday, useToday } from '../hooks/queries'
import { cs } from '../i18n/cs'
import { formatShortDate } from '../lib/time'
import { formatNumber } from '../lib/units'

/** Lowest share of the limit first; over a 0 g limit next, nothing logged last. */
function sortKey(m: GroupMemberToday): number {
  if (!m.logged) return Infinity
  return m.pctOfLimit ?? Number.MAX_VALUE
}

export function GroupPage() {
  const me = useMe()
  const today = useToday()
  const summary = useGroupSummary()
  const group = useGroupToday()
  const [feedOpen, setFeedOpen] = useState(false)
  const feed = useFeed(feedOpen)

  if (summary.isPending || group.isPending) return <Loading />
  if (summary.isError || group.isError) {
    return <ErrorState error={summary.error ?? group.error} onRetry={() => { summary.refetch(); group.refetch() }} />
  }

  const { today: t, yesterday: y } = summary.data
  const members = [...group.data].sort(
    (a, b) => sortKey(a) - sortKey(b) || a.nickname.localeCompare(b.nickname, 'cs'),
  )

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
