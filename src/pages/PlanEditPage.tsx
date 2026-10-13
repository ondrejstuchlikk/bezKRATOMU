import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { backend, type ActivePlan } from '../api'
import { PlanPreviewChart } from '../components/charts'
import { DayLimitsEditor } from '../components/DayLimitsEditor'
import { Button, Card, ErrorState, errorMessage, Loading, PageHeader } from '../components/ui'
import { useActivePlan, useRefreshAfterChange, useSettings, useToday } from '../hooks/queries'
import { cs } from '../i18n/cs'
import { limitOn, MIN_CUSTOM_DAYS, validateCustomLimits } from '../lib/plan'
import { addDays, type ISODate } from '../lib/time'

/** The current plan's limits from today until its last day (at least two days). */
function remainingLimits(plan: ActivePlan, today: ISODate): number[] {
  const end = plan.endDate && plan.endDate > today ? plan.endDate : today
  const limits: number[] = []
  for (let d = today; d <= end; d = addDays(d, 1)) limits.push(limitOn(plan.days, d)?.limitG ?? plan.targetG)
  while (limits.length < MIN_CUSTOM_DAYS) limits.push(limits[limits.length - 1])
  return limits
}

export default function PlanEditPage() {
  const plan = useActivePlan()
  const today = useToday()
  const settings = useSettings()

  if (plan.isPending) return <Loading />
  if (plan.isError) return <ErrorState error={plan.error} onRetry={() => plan.refetch()} />
  if (!plan.data) return <Navigate to="/plan/novy" replace />
  return (
    <Editor
      today={today}
      initial={remainingLimits(plan.data, today)}
      teaspoonGrams={settings.data?.teaspoonGrams ?? null}
    />
  )
}

function Editor({ today, initial, teaspoonGrams }: { today: ISODate; initial: number[]; teaspoonGrams: number | null }) {
  const navigate = useNavigate()
  const refresh = useRefreshAfterChange()
  const [limits, setLimits] = useState<(number | null)[]>(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const validation = validateCustomLimits(limits)

  async function save() {
    setBusy(true)
    setError(null)
    try {
      await backend.createCustomPlan(limits as number[])
      await refresh()
      navigate('/plan', { replace: true })
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader title={cs.customPlan.title} back="/plan" />
      <p className="text-sm leading-relaxed text-muted">{cs.customPlan.intro}</p>
      <Card>
        <DayLimitsEditor startDate={today} limits={limits} onChange={setLimits} teaspoonGrams={teaspoonGrams} />
      </Card>
      {!validation && (
        <Card>
          <PlanPreviewChart limits={limits as number[]} />
        </Card>
      )}
      {validation && <p className="text-sm text-over">{cs.customPlan.errors[validation]}</p>}
      <p className="text-sm text-muted">{cs.customPlan.saveNote}</p>
      {error && <p className="text-sm text-over" role="alert">{error}</p>}
      <Button className="w-full" disabled={!!validation || busy} onClick={save}>
        {cs.customPlan.save}
      </Button>
    </div>
  )
}
