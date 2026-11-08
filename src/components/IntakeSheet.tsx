import { useEffect, useState } from 'react'
import { backend, type Intake, type IntakePreset } from '../api'
import { useRefreshIntakes, useToday } from '../hooks/queries'
import { cs } from '../i18n/cs'
import { EDIT_WINDOW_DAYS } from '../lib/days'
import { MAX_CAFFEINE_MG, MAX_PRESET_COUNT, round1, type IntakeSubstance } from '../lib/substances'
import { addDays, formatWeekdayDate, pragueLocalToInstant, pragueTime, pragueToday, type ISODate } from '../lib/time'
import { formatMg, formatNumber } from '../lib/units'
import { NumberStepper } from './NumberStepper'
import { PresetForm } from './PresetForm'
import { Button, cx, errorMessage, inputClass } from './ui'

export interface IntakeSheetProps {
  substance: IntakeSubstance
  open: boolean
  onClose: () => void
  /** Existing entry to edit; omitted for a new one. */
  intake?: Intake | null
  defaultDate: ISODate
  presets: IntakePreset[]
  /** The latest entry, used as the starting point for a new one. */
  lastIntake?: Intake | null
}

export function IntakeSheet({ open, ...props }: IntakeSheetProps) {
  // Mount the form fresh each time so it starts from the right defaults.
  if (!open) return null
  return <IntakeForm key={props.intake?.id ?? `new-${props.defaultDate}`} {...props} />
}

type Choice = { kind: 'preset'; id: string } | { kind: 'custom' }

function initialChoice(template: Intake | null | undefined, presets: IntakePreset[]): Choice {
  if (template?.presetName) {
    const match = presets.find((p) => p.name === template.presetName)
    if (match) return { kind: 'preset', id: match.id }
  }
  if (template) return { kind: 'custom' }
  return presets.length ? { kind: 'preset', id: presets[0].id } : { kind: 'custom' }
}

function IntakeForm({ substance, onClose, intake, defaultDate, presets, lastIntake }: Omit<IntakeSheetProps, 'open'>) {
  const today = useToday()
  const refresh = useRefreshIntakes()
  const dayOptions = Array.from({ length: EDIT_WINDOW_DAYS + 1 }, (_, i) => {
    const d = addDays(today, -i)
    return { value: d, label: i === 0 ? cs.dose.todayLabel : i === 1 ? cs.dose.yesterdayLabel : formatWeekdayDate(d) }
  })

  const template = intake ?? lastIntake
  const [choice, setChoice] = useState<Choice>(() => initialChoice(template, presets))
  const [count, setCount] = useState<number | null>(template?.presetCount ?? 1)
  const [customMg, setCustomMg] = useState<number | null>(template ? template.amount : 100)
  const [date, setDate] = useState<ISODate>(intake?.localDate ?? defaultDate)
  const [time, setTime] = useState(() =>
    intake ? pragueTime(new Date(intake.takenAt)) : defaultDate === pragueToday() ? pragueTime(new Date()) : '12:00',
  )
  const [adding, setAdding] = useState(false)
  // Presets added in this sheet show up before the list refetches.
  const [added, setAdded] = useState<IntakePreset[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  const allPresets = [...presets, ...added.filter((a) => !presets.some((p) => p.id === a.id))]
  const preset = choice.kind === 'preset' ? allPresets.find((p) => p.id === choice.id) : undefined
  const amount = preset ? round1(preset.amountMg * (count ?? 0)) : round1(customMg ?? 0)
  const validCount = !preset || (count !== null && count > 0 && count <= MAX_PRESET_COUNT)
  const valid = validCount && amount > 0 && amount <= MAX_CAFFEINE_MG

  async function save() {
    setError(null)
    if (!valid) return setError(cs.caffeine.sheet.invalidAmount)
    setBusy(true)
    try {
      const input = {
        substance,
        takenAt: pragueLocalToInstant(date, time),
        amount,
        presetName: preset ? preset.name : null,
        presetCount: preset ? count : null,
      }
      if (intake) await backend.updateIntake(intake.id, input)
      else await backend.addIntake(input)
      await refresh()
      onClose()
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  async function remove() {
    if (!intake || !window.confirm(cs.caffeine.sheet.confirmDelete)) return
    setBusy(true)
    try {
      await backend.deleteIntake(intake.id)
      await refresh()
      onClose()
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  const title = intake ? cs.caffeine.sheet.editTitle : cs.caffeine.sheet.addTitle
  const option = (selected: boolean) =>
    cx(
      'flex min-h-14 w-full items-center gap-3 rounded-2xl border px-4 text-left transition',
      selected ? 'border-accent bg-accent/12' : 'border-line bg-bg',
    )

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label={cs.common.close} className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-[2rem] border border-line bg-surface px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl">
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-line" />
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-2xl font-semibold">
            {cs.substances.emoji[substance]} {title}
          </h2>
          <button type="button" onClick={onClose} className="min-h-10 px-2 text-sm font-medium text-muted">
            {cs.common.cancel}
          </button>
        </div>

        <div className="space-y-5">
          <div className="space-y-2" role="radiogroup" aria-label={cs.caffeine.sheet.what}>
            <div className="text-sm font-semibold">{cs.caffeine.sheet.what}</div>
            {allPresets.map((p) => {
              const selected = choice.kind === 'preset' && choice.id === p.id
              return (
                <button key={p.id} type="button" role="radio" aria-checked={selected} onClick={() => setChoice({ kind: 'preset', id: p.id })} className={option(selected)}>
                  <span className="flex-1 font-semibold">{p.name}</span>
                  <span className="text-sm text-muted tabular-nums">{formatMg(p.amountMg)}</span>
                </button>
              )
            })}
            <button type="button" role="radio" aria-checked={choice.kind === 'custom'} onClick={() => setChoice({ kind: 'custom' })} className={option(choice.kind === 'custom')}>
              <span className="flex-1 font-semibold">{cs.caffeine.sheet.custom}</span>
              <span className="text-sm text-muted">{cs.caffeine.sheet.customHint}</span>
            </button>
            {adding ? (
              <PresetForm
                substance={substance}
                onDone={(saved) => {
                  setAdding(false)
                  if (saved) {
                    setAdded((a) => [...a, saved])
                    setChoice({ kind: 'preset', id: saved.id })
                    setCount(1)
                  }
                }}
              />
            ) : (
              <button type="button" className="min-h-10 px-1 text-sm font-semibold text-accent" onClick={() => setAdding(true)}>
                {cs.caffeine.sheet.newPreset}
              </button>
            )}
          </div>

          <div className="space-y-2">
            {preset ? (
              <NumberStepper
                label={cs.caffeine.sheet.count}
                value={count}
                onChange={setCount}
                step={0.5}
                min={0.5}
                max={MAX_PRESET_COUNT}
                suffix={cs.caffeine.sheet.countSuffix}
              />
            ) : (
              <NumberStepper
                label={cs.caffeine.sheet.custom}
                value={customMg}
                onChange={setCustomMg}
                step={10}
                min={0}
                max={MAX_CAFFEINE_MG}
                suffix={cs.caffeine.sheet.mg}
              />
            )}
            <p className={cx('h-5 text-center text-sm', valid ? 'text-muted' : 'text-over')}>
              {!valid
                ? cs.caffeine.sheet.invalidAmount
                : preset
                  ? `${formatNumber(count ?? 0)} × ${preset.name} ${cs.caffeine.sheet.equals(formatMg(amount))}`
                  : ''}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1.5">
              <span className="text-sm font-semibold">{cs.dose.day}</span>
              <select className={inputClass} value={date} onChange={(e) => setDate(e.target.value)}>
                {dayOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1.5">
              <span className="text-sm font-semibold">{cs.dose.time}</span>
              <input type="time" className={inputClass} value={time} onChange={(e) => setTime(e.target.value || '00:00')} />
            </label>
          </div>

          {error && (
            <p className="text-sm text-over" role="alert">
              {error}
            </p>
          )}

          <Button className="w-full text-lg" onClick={save} disabled={busy || !valid}>
            {cs.caffeine.sheet.save}
          </Button>
          {intake && (
            <Button variant="danger" className="w-full" onClick={remove} disabled={busy}>
              {cs.caffeine.sheet.delete}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
