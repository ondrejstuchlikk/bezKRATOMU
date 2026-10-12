import { useParams } from 'react-router-dom'
import { useMe } from '../auth/SessionProvider'
import { PlanVsActualChart } from '../components/charts'
import { DayRowLink } from '../components/DayRow'
import { StatsGrid } from '../components/StatsGrid'
import { Card, ErrorState, Loading, PageHeader } from '../components/ui'
import { useProfile, useToday, useUserDays, useUserStats } from '../hooks/queries'
import { cs } from '../i18n/cs'
import { addDays } from '../lib/time'
import { Legend } from './ChartsPage'

export default function ProfilePage() {
  const { userId = '' } = useParams()
  const me = useMe()
  const today = useToday()
  const profile = useProfile(userId)
  const stats = useUserStats(userId)
  const days = useUserDays(userId, addDays(today, -29), today)

  if (profile.isPending || stats.isPending || days.isPending) return <Loading />
  if (profile.isError || stats.isError || days.isError) {
    return <ErrorState error={profile.error ?? stats.error ?? days.error} onRetry={() => { profile.refetch(); stats.refetch(); days.refetch() }} />
  }
  if (!profile.data) return <ErrorState error={null} />

  const isMe = userId === me.id
  const showGrams = isMe || profile.data.shareGrams
  const recent = [...days.data].reverse().slice(0, 14)

  return (
    <div className="space-y-5">
      <PageHeader title={profile.data.nickname} back="/zebricek">
        {isMe && <span className="rounded-full bg-accent/15 px-3 py-1 text-xs font-semibold text-accent">{cs.profile.isYou}</span>}
      </PageHeader>

      {!stats.data.hasPlan ? (
        <Card>
          <p className="text-muted">{cs.profile.noPlan}</p>
        </Card>
      ) : (
        <>
          <Card className="space-y-2 px-3">
            <h2 className="px-2 font-semibold">{cs.chart.main}</h2>
            <Legend />
            <PlanVsActualChart days={days.data} unit={showGrams ? 'g' : 'pct'} />
            {!showGrams && <p className="px-2 text-xs text-muted">{cs.chart.pctNote(profile.data.nickname)}</p>}
          </Card>
          <StatsGrid stats={stats.data} />
          <Card>
            <h2 className="mb-1 font-semibold">{cs.profile.recentDays}</h2>
            <ul className="divide-y divide-line">
              {recent.map((d) => (
                <DayRowLink key={d.date} userId={userId} day={d} />
              ))}
            </ul>
          </Card>
        </>
      )}
    </div>
  )
}
