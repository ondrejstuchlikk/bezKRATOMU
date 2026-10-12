import { useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { backend, type ReactionEmoji } from '../api'
import { useMe } from '../auth/SessionProvider'
import { Button, Card, cx, ErrorState, errorMessage, Loading, PageHeader, Points, StatusBadge } from '../components/ui'
import { keys, useDaySocial, useProfile, useUserDays } from '../hooks/queries'
import { cs } from '../i18n/cs'
import { formatLongDate, formatShortDate, pragueDate, pragueTime } from '../lib/time'
import { formatGrams, formatPct } from '../lib/units'

export function DayPage() {
  const { userId = '', date = '' } = useParams()
  const me = useMe()
  const queryClient = useQueryClient()
  const profile = useProfile(userId)
  const days = useUserDays(userId, date, date)
  const social = useDaySocial(userId, date)
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (profile.isPending || days.isPending || social.isPending) return <Loading />
  if (profile.isError || days.isError || social.isError || !profile.data) {
    return <ErrorState error={profile.error ?? days.error ?? social.error} onRetry={() => { profile.refetch(); days.refetch(); social.refetch() }} />
  }

  const day = days.data[0]
  const isMe = userId === me.id
  const refreshSocial = () => queryClient.invalidateQueries({ queryKey: keys.social(userId, date) })

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await action()
      await refreshSocial()
    } catch (err) {
      setError(errorMessage(err))
    }
    setBusy(false)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    const text = body.trim()
    if (!text) return
    await run(async () => {
      await backend.addComment(userId, date, text)
      setBody('')
    })
  }

  return (
    <div className="space-y-5">
      <PageHeader title={profile.data.nickname} back={`/u/${userId}`} />
      <p className="-mt-3 text-muted first-letter:uppercase">{formatLongDate(date)}</p>

      {day && (
        <Card className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <StatusBadge status={day.status} provisional={!day.isFinal && day.status !== 'pending'} />
            {day.status !== 'pending' && <Points value={day.points} className="text-lg" />}
          </div>
          {day.zeroDay ? (
            <p className="font-semibold text-accent">{cs.day.zeroDay}</p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-sm text-muted">{cs.day.limit}</div>
                <div className="text-xl font-semibold">{day.limitG !== null ? `${day.limitG} g` : formatPct(day.planPct)}</div>
              </div>
              <div>
                <div className="text-sm text-muted">{cs.day.intake}</div>
                <div className="text-xl font-semibold">
                  {!day.logged
                    ? '–'
                    : day.totalG !== null
                      ? formatGrams(day.totalG)
                      : `${formatPct(day.planPct > 0 ? (100 * day.actualPct!) / day.planPct : day.actualPct!)} ${cs.day.ofLimit}`}
                </div>
              </div>
            </div>
          )}
        </Card>
      )}

      <Card className="space-y-3">
        <h2 className="font-semibold">{cs.day.reactions}</h2>
        <div className="grid grid-cols-4 gap-2">
          {social.data.reactions.map((r) => (
            <button
              key={r.emoji}
              type="button"
              disabled={isMe || busy}
              title={r.names.join(', ')}
              aria-pressed={r.mine}
              onClick={() => run(() => backend.toggleReaction(userId, date, r.emoji as ReactionEmoji))}
              className={cx(
                'flex min-h-14 items-center justify-center gap-1.5 rounded-2xl border text-2xl transition active:scale-95',
                r.mine ? 'border-accent bg-accent/12' : 'border-line bg-bg',
                isMe && 'cursor-default',
              )}
            >
              {r.emoji}
              {r.count > 0 && <span className="text-sm font-semibold text-muted">{r.count}</span>}
            </button>
          ))}
        </div>
        {isMe && <p className="text-xs text-muted">{cs.day.ownDayNote}</p>}
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">{cs.day.comments}</h2>
        {!social.data.comments.length && <p className="text-sm text-muted">{cs.day.noComments}</p>}
        <ul className="space-y-3">
          {social.data.comments.map((c) => (
            <li key={c.id} className="rounded-2xl bg-bg p-3">
              <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                <span className="font-semibold">{c.authorNickname}</span>
                <span className="text-xs text-muted">
                  {formatShortDate(pragueDate(new Date(c.createdAt)))} {pragueTime(new Date(c.createdAt))}
                </span>
              </div>
              {/* Rendered as plain text: React escapes everything. */}
              <p className="text-sm leading-relaxed break-words whitespace-pre-wrap">{c.body}</p>
              {(c.authorId === me.id || isMe) && (
                <button
                  type="button"
                  disabled={busy}
                  className="mt-1 text-xs font-medium text-over"
                  onClick={() => run(() => backend.deleteComment(c.id))}
                >
                  {cs.common.delete}
                </button>
              )}
            </li>
          ))}
        </ul>
        <form onSubmit={submit} className="space-y-2">
          <textarea
            className="block min-h-20 w-full rounded-2xl border border-line bg-bg p-3 text-base outline-none focus:border-accent"
            placeholder={cs.day.placeholder}
            maxLength={280}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted tabular-nums">{body.length} / 280</span>
            <Button type="submit" disabled={busy || !body.trim()}>
              {cs.day.send}
            </Button>
          </div>
        </form>
        {error && <p className="text-sm text-over">{error}</p>}
      </Card>
    </div>
  )
}
