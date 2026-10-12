import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { backend } from '../api'
import { PlanPreviewChart } from '../components/charts'
import { BareLayout } from '../components/layout'
import { NumberStepper } from '../components/NumberStepper'
import { Button, Card, cx, errorMessage, Loading } from '../components/ui'
import { useActivePlan, useRefreshAfterChange, useToday } from '../hooks/queries'
import { cs } from '../i18n/cs'
import {
  generatePlan,
  groupPlanSteps,
  limitOn,
  MAX_BASELINE_G,
  MAX_DURATION_DAYS,
  PRESET_DAYS,
  PRESETS,
  validatePlan,
  type Curve,
  type Preset,
} from '../lib/plan'

const STEPS = 3

export default function PlanWizardPage() {
  const plan = useActivePlan()
  if (plan.isPending) return <BareLayout><Loading /></BareLayout>
  return <Wizard existing={!!plan.data} currentLimit={plan.data ?? null} />
}

function Wizard({
  existing,
  currentLimit,
}: {
  existing: boolean
  currentLimit: ReturnType<typeof useActivePlan>['data'] | null
}) {
  const navigate = useNavigate()
  const refresh = useRefreshAfterChange()
  const today = useToday()
  const heldLimit = currentLimit ? (limitOn(currentLimit.days, today)?.limitG ?? currentLimit.targetG) : null

  const [step, setStep] = useState(1)
  const [baseline, setBaseline] = useState<number | null>(heldLimit && heldLimit > 0 ? heldLimit : null)
  const [target, setTarget] = useState<number | null>(0)
  const [preset, setPreset] = useState<Preset>('medium')
  const [customDays, setCustomDays] = useState<number | null>(21)
  const [curve, setCurve] = useState<Curve>('decelerating')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const duration = preset === 'custom' ? (customDays ?? 0) : PRESET_DAYS[preset]
  const params = { baselineG: baseline ?? 0, targetG: target ?? 0, durationDays: duration, curve }
  const validation = validatePlan(params)
  const limits = validation ? null : generatePlan(params)

  const baselineError = baseline !== null && (baseline < 1 || baseline > MAX_BASELINE_G) ? cs.wizard.errors.invalid_baseline : null
  const targetError = target !== null && baseline !== null && target >= baseline ? cs.wizard.errors.invalid_target : null

  async function submit() {
    if (!limits) return
    setBusy(true)
    setError(null)
    try {
      await backend.createPlan({ baselineG: params.baselineG, targetG: params.targetG, durationDays: duration, curve, preset })
      await refresh()
      navigate('/', { replace: true })
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <BareLayout>
      <div className="mb-6 flex items-center justify-between">
        {step > 1 || existing ? (
          <button
            type="button"
            className="min-h-10 font-medium text-accent"
            onClick={() => (step > 1 ? setStep(step - 1) : navigate(-1))}
          >
            ← {cs.common.back}
          </button>
        ) : (
          <span />
        )}
        <span className="text-sm text-muted">{cs.wizard.step(step, STEPS)}</span>
      </div>
      <h1 className="mb-6 font-display text-3xl font-semibold tracking-tight">
        {existing ? cs.wizard.changeTitle : cs.wizard.title}
      </h1>

      {step === 1 && (
        <div className="space-y-6">
          <Card className="space-y-4">
            <h2 className="text-lg font-semibold">{cs.wizard.baselineQ}</h2>
            <NumberStepper label={cs.wizard.baselineQ} value={baseline} onChange={setBaseline} integer min={1} max={MAX_BASELINE_G} suffix="g" />
            <p className={cx('text-sm', baselineError ? 'text-over' : 'text-muted')}>{baselineError ?? cs.wizard.baselineHint}</p>
          </Card>
          <Button className="w-full" disabled={!baseline || !!baselineError} onClick={() => setStep(2)}>
            {cs.common.next}
          </Button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-6">
          <Card className="space-y-4">
            <h2 className="text-lg font-semibold">{cs.wizard.targetQ}</h2>
            <NumberStepper label={cs.wizard.targetQ} value={target} onChange={setTarget} integer min={0} max={(baseline ?? 1) - 1} suffix="g" />
            <p className={cx('text-sm', targetError ? 'text-over' : 'text-muted')}>{targetError ?? cs.wizard.targetHint}</p>
          </Card>
          <Button className="w-full" disabled={target === null || !!targetError} onClick={() => setStep(3)}>
            {cs.common.next}
          </Button>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-5">
          <Card className="space-y-3">
            <h2 className="text-lg font-semibold">{cs.wizard.paceQ}</h2>
            <div className="grid grid-cols-2 gap-2">
              {PRESETS.map((p) => {
                const info = cs.wizard.presets[p]
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPreset(p)}
                    className={cx(
                      'min-h-16 rounded-2xl border p-3 text-left transition',
                      preset === p ? 'border-accent bg-accent/10' : 'border-line bg-bg',
                    )}
                  >
                    <div className="font-semibold">
                      {info.emoji} {info.name}
                    </div>
                    <div className="text-sm text-muted">{info.days ? cs.common.days(info.days) : '…'}</div>
                  </button>
                )
              })}
            </div>
            {preset === 'custom' && (
              <div className="space-y-2 pt-2">
                <div className="text-sm font-semibold">{cs.wizard.customDays}</div>
                <NumberStepper label={cs.wizard.customDays} value={customDays} onChange={setCustomDays} integer min={1} max={MAX_DURATION_DAYS} />
                {validation === 'invalid_duration' && <p className="text-sm text-over">{cs.wizard.errors.invalid_duration}</p>}
              </div>
            )}
            {preset === 'express' && (
              <div className="rounded-2xl border border-over/30 bg-over/10 p-4 text-sm leading-relaxed" role="alert">
                <strong>⚠️ </strong>
                {cs.wizard.expressWarning}
                {(baseline ?? 0) > 10 && <strong className="mt-2 block">{cs.wizard.expressHighDose}</strong>}
              </div>
            )}
          </Card>

          <Card className="space-y-3">
            <h2 className="text-lg font-semibold">{cs.wizard.curveQ}</h2>
            {(['decelerating', 'linear'] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCurve(c)}
                className={cx(
                  'block w-full rounded-2xl border p-3 text-left transition',
                  curve === c ? 'border-accent bg-accent/10' : 'border-line bg-bg',
                )}
              >
                <div className="font-semibold">{cs.wizard.curves[c].name}</div>
                <div className="text-sm text-muted">{cs.wizard.curves[c].desc}</div>
              </button>
            ))}
          </Card>

          {limits && (
            <Card className="space-y-3">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-lg font-semibold">{cs.wizard.preview}</h2>
                <span className="text-sm font-semibold text-accent">
                  {cs.wizard.summary(params.baselineG, params.targetG, duration)}
                </span>
              </div>
              <PlanPreviewChart limits={limits} />
              <ul className="max-h-48 divide-y divide-line overflow-y-auto rounded-2xl border border-line text-sm">
                {groupPlanSteps(limits).map((s) => (
                  <li key={s.fromDay} className="flex justify-between px-4 py-2">
                    <span className="text-muted">{cs.wizard.stepRow(s.fromDay + 1, s.toDay + 1)}</span>
                    <span className="font-semibold tabular-nums">{s.limitG} g</span>
                  </li>
                ))}
              </ul>
              <p className="text-sm text-muted">{cs.wizard.afterEnd}</p>
            </Card>
          )}

          {existing && <p className="text-sm text-muted">{cs.wizard.replaceNote}</p>}
          {error && <p className="text-sm text-over" role="alert">{error}</p>}
          <Button className="w-full" disabled={!limits || busy} onClick={submit}>
            {cs.wizard.start}
          </Button>
        </div>
      )}
    </BareLayout>
  )
}
