import type { UserStats } from '../api'
import { cs } from '../i18n/cs'
import { formatDuration, formatPct } from '../lib/units'
import { StatTile } from './ui'

export function StatsGrid({ stats }: { stats: UserStats }) {
  const pct = (v: number | null) => (v === null ? '–' : formatPct(v))
  const duration = (v: number | null) => (v === null ? '–' : formatDuration(v))
  return (
    <div className="grid grid-cols-2 gap-3">
      <StatTile
        className="col-span-2"
        label={cs.stats.metDays}
        value={pct(stats.metPct)}
        hint={`${stats.metDays} / ${stats.scoredDays}`}
      />
      <StatTile label={cs.stats.streak} value={`🔥 ${stats.currentStreak}`} />
      <StatTile label={cs.stats.bestStreak} value={stats.bestStreak} />
      <StatTile label={cs.stats.reductionLimit} value={pct(stats.reductionLimitPct)} />
      <StatTile label={cs.stats.reductionAvg} value={pct(stats.reductionAvgPct)} />
      <StatTile
        className="col-span-2"
        label={cs.stats.recordGap}
        value={duration(stats.recordGapMin)}
        hint={stats.recordGapRunning ? cs.stats.recordGapRunning : undefined}
      />
      <StatTile label={cs.stats.avgGap5d} value={duration(stats.avgGap5dMin)} hint={cs.stats.gapHint} />
      <StatTile label={cs.stats.avgGapAll} value={duration(stats.avgGapAllMin)} hint={cs.stats.gapHint} />
    </div>
  )
}
