import { Link } from 'react-router-dom'
import type { DayResult } from '../api'
import { cs } from '../i18n/cs'
import { formatWeekdayDate } from '../lib/time'
import { formatGrams, formatPct } from '../lib/units'

/** One line in a "recent days" list, linking to the day detail. */
export function DayRowLink({ userId, day }: { userId: string; day: DayResult }) {
  const value = !day.logged
    ? cs.status.missed
    : day.zeroDay
      ? '0 g 🌱'
      : day.totalG !== null && day.limitG !== null
        ? `${formatGrams(day.totalG)} / ${formatGrams(day.limitG)}`
        : day.actualPct !== null
          ? `${formatPct(day.planPct > 0 ? (100 * day.actualPct) / day.planPct : day.actualPct)} ${cs.day.ofLimit}`
          : ''
  return (
    <li>
      <Link to={`/u/${userId}/${day.date}`} className="flex min-h-14 items-center gap-3 px-1 py-2 active:bg-bg">
        <span aria-hidden className="text-lg">
          {cs.statusIcon[day.status]}
        </span>
        <span className="flex-1">
          <span className="block font-semibold first-letter:uppercase">{formatWeekdayDate(day.date)}</span>
          <span className="block text-sm text-muted">
            {value}
            {!day.isFinal && ` · ${cs.common.provisional}`}
            {day.isPaused && ' · ⏸'}
          </span>
        </span>
        <span aria-hidden className="text-muted">›</span>
      </Link>
    </li>
  )
}
