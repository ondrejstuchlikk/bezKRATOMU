import { useState } from 'react'
import { backend } from '../api'
import { PlanPreviewChart } from '../components/charts'
import { Button, ButtonLink, Card, ErrorState, errorMessage, Loading, PageHeader } from '../components/ui'
import { useActivePlan, useRefreshAfterChange, useSettings, useToday } from '../hooks/queries'
import { cs } from '../i18n/cs'
import { formatShortDate, formatWeekdayDate } from '../lib/time'
import { limitOn } from '../lib/plan'
import { formatGrams, gramsToTeaspoons } from '../lib/units'

export default function PlanPage() {
  const plan = useActivePlan()
  const today = useToday()
  const settings = useSettings()
  const refresh = useRefreshAfterChange()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (plan.isPending) return <Loading />
  if (plan.isError) return <ErrorState error={plan.error} onRetry={() => plan.refetch()} />

  if (!plan.data) {
    return (
      <div>
        <PageHeader title={cs.plan.title} back="/nastaveni" />
        <Card className="space-y-4 text-center">
          <p className="text-muted">{cs.plan.none}</p>
          <ButtonLink to="/plan/novy" className="w-full">
            {cs.plan.create}
          </ButtonLink>
        </Card>
      </div>
    )
  }

  const p = plan.data
  const currentLimit = limitOn(p.days, today)?.limitG ?? p.targetG
  const teaspoonGrams = settings.data?.teaspoonGrams ?? null
  const finished = !p.isPaused && p.endDate !== null && today >= p.endDate
  const preset = cs.wizard.presets[p.preset]

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await action()
      await refresh()
    } catch (err) {
      setError(errorMessage(err))
    }
    setBusy(false)
  }

  return (
    <div className="space-y-5">
      <PageHeader title={cs.plan.title} back="/nastaveni" />

      <Card className="space-y-4">
        <div className="flex items-baseline justify-between">
          <div className="font-display text-2xl font-semibold">{cs.wizard.summary(p.baselineG, p.targetG, p.durationDays)}</div>
        </div>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-muted">{cs.plan.todayLimit}</dt>
            <dd className="text-lg font-semibold">{formatGrams(currentLimit)}</dd>
            {teaspoonGrams && currentLimit > 0 && (
              <dd className="text-sm text-muted">{cs.dose.tspApprox(gramsToTeaspoons(currentLimit, teaspoonGrams))}</dd>
            )}
          </div>
          <div>
            <dt className="text-muted">{cs.plan.preset}</dt>
            <dd className="text-lg font-semibold">
              {preset.emoji} {preset.name}
            </dd>
          </div>
          <div>
            <dt className="text-muted">{cs.plan.started}</dt>
            <dd className="font-semibold first-letter:uppercase">{formatWeekdayDate(p.startDate)}</dd>
          </div>
          <div>
            <dt className="text-muted">{cs.plan.ends}</dt>
            <dd className="font-semibold first-letter:uppercase">
              {p.endDate ? formatWeekdayDate(p.endDate) : cs.plan.endsPaused}
            </dd>
          </div>
          <div className="col-span-2">
            <dt className="text-muted">{cs.plan.curve}</dt>
            <dd className="font-semibold">{cs.wizard.curves[p.curve].name}</dd>
          </div>
        </dl>
        <PlanPreviewChart limits={p.days.map((d) => d.limitG)} />
      </Card>

      {finished ? (
        <Card>
          <p className="font-semibold text-accent">{cs.plan.finished(p.targetG)}</p>
        </Card>
      ) : p.isPaused ? (
        <Card className="space-y-3">
          <p className="font-semibold">⏸ {cs.plan.pausedSince(formatShortDate(p.pauseStart!))}</p>
          <Button className="w-full" disabled={busy} onClick={() => run(() => backend.resumePlan())}>
            ▶ {cs.plan.resume}
          </Button>
        </Card>
      ) : (
        <Card className="space-y-3">
          <Button variant="secondary" className="w-full" disabled={busy} onClick={() => run(() => backend.pausePlan())}>
            ⏸ {cs.plan.pause}
          </Button>
          <p className="text-sm leading-relaxed text-muted">{cs.plan.pauseHint}</p>
        </Card>
      )}

      {error && <p className="text-sm text-over">{error}</p>}

      <ButtonLink to="/plan/novy" variant="secondary" className="w-full">
        {cs.plan.change}
      </ButtonLink>
    </div>
  )
}
