import { useEffect, useState } from 'react'
import { backend, type Dose } from '../api'
import { useRefreshAfterChange, useToday } from '../hooks/queries'
import { cs } from '../i18n/cs'
import { addDays, pragueLocalToInstant, pragueTime, pragueToday, type ISODate } from '../lib/time'
import { formatGrams, MAX_DOSE_G, toGrams, type InputUnit } from '../lib/units'
import { NumberStepper } from './NumberStepper'
import { Button, cx, errorMessage, inputClass, Segmented } from './ui'

export interface DoseSheetProps {
  open: boolean
  onClose: () => void
  /** Existing dose to edit; omitted for a new dose. */
  dose?: Dose | null
  defaultDate: ISODate
  teaspoonGrams: number | null
  lastDose?: Dose | null
}

export function DoseSheet({ open, onClose, dose, defaultDate, teaspoonGrams, lastDose }: DoseSheetProps) {
  // Mount the form fresh each time so it starts from the right defaults.
  if (!open) return null
  return (
    <DoseForm
      key={dose?.id ?? `new-${defaultDate}`}
      onClose={onClose}
      dose={dose}
      defaultDate={defaultDate}
      teaspoonGrams={teaspoonGrams}
      lastDose={lastDose}
    />
  )
}

function DoseForm({ onClose, dose, defaultDate, teaspoonGrams, lastDose }: Omit<DoseSheetProps, 'open'>) {
  const today = useToday()
  const yesterday = addDays(today, -1)
  const refresh = useRefreshAfterChange()

  const template = dose ?? lastDose
  const initialUnit: InputUnit = template?.inputUnit === 'tsp' && teaspoonGrams ? 'tsp' : 'g'
  const [unit, setUnit] = useState<InputUnit>(initialUnit)
  const [amount, setAmount] = useState<number | null>(
    template ? (initialUnit === template.inputUnit ? template.inputAmount : template.grams) : 1,
  )
  const [date, setDate] = useState<ISODate>(dose?.localDate ?? defaultDate)
  const [time, setTime] = useState(() =>
    dose ? pragueTime(new Date(dose.takenAt)) : defaultDate === pragueToday() ? pragueTime(new Date()) : '20:00',
  )
  const [feeling, setFeeling] = useState<number | null>(dose?.feeling ?? null)
  const [note, setNote] = useState(dose?.note ?? '')
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

  const grams = amount && amount > 0 ? toGrams(amount, unit, teaspoonGrams) : 0
  const validAmount = grams > 0 && grams <= MAX_DOSE_G

  function switchUnit(next: InputUnit) {
    if (next === unit || !teaspoonGrams) return
    if (amount) setAmount(next === 'g' ? toGrams(amount, 'tsp', teaspoonGrams) : Math.round((amount / teaspoonGrams) * 2) / 2)
    setUnit(next)
  }

  async function save() {
    setError(null)
    if (!validAmount) return setError(cs.dose.invalidAmount)
    const takenAt = pragueLocalToInstant(date, time)
    setBusy(true)
    try {
      const input = { takenAt, grams, inputUnit: unit, inputAmount: amount!, feeling, note: note.trim() || null }
      if (dose) await backend.updateDose(dose.id, input)
      else await backend.addDose(input)
      await refresh()
      onClose()
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  async function remove() {
    if (!dose || !window.confirm(cs.dose.confirmDelete)) return
    setBusy(true)
    try {
      await backend.deleteDose(dose.id)
      await refresh()
      onClose()
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center" role="dialog" aria-modal="true" aria-label={dose ? cs.dose.editTitle : cs.dose.addTitle}>
      <button type="button" aria-label={cs.common.close} className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-[2rem] border border-line bg-surface px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl">
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-line" />
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-2xl font-semibold">{dose ? cs.dose.editTitle : cs.dose.addTitle}</h2>
          <button type="button" onClick={onClose} className="min-h-10 px-2 text-sm font-medium text-muted">
            {cs.common.cancel}
          </button>
        </div>

        <div className="space-y-5">
          {teaspoonGrams && (
            <Segmented
              value={unit}
              onChange={switchUnit}
              options={[
                { value: 'g', label: cs.dose.unitG },
                { value: 'tsp', label: cs.dose.unitTsp },
              ]}
            />
          )}

          <div className="space-y-2">
            <NumberStepper
              label={unit === 'g' ? cs.dose.unitG : cs.dose.unitTsp}
              value={amount}
              onChange={setAmount}
              step={0.5}
              min={0}
              max={MAX_DOSE_G}
              suffix={unit === 'g' ? 'g' : 'lž.'}
            />
            <p className={cx('h-5 text-center text-sm', validAmount ? 'text-muted' : 'text-over')}>
              {unit === 'tsp' && validAmount ? cs.dose.equals(formatGrams(grams)) : !validAmount && amount !== null ? cs.dose.invalidAmount : ''}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <span className="text-sm font-semibold">{cs.dose.day}</span>
              <Segmented
                value={date}
                onChange={setDate}
                options={[
                  { value: yesterday, label: cs.dose.yesterdayLabel },
                  { value: today, label: cs.dose.todayLabel },
                ]}
              />
            </div>
            <label className="space-y-1.5">
              <span className="text-sm font-semibold">{cs.dose.time}</span>
              <input type="time" className={inputClass} value={time} onChange={(e) => setTime(e.target.value || '00:00')} />
            </label>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-semibold">
              {cs.dose.feeling} <span className="font-normal text-muted">({cs.dose.optional})</span>
            </div>
            <div className="flex justify-between gap-1.5">
              {cs.feelings.map((f, i) => (
                <button
                  key={f.emoji}
                  type="button"
                  aria-label={f.label}
                  aria-pressed={feeling === i + 1}
                  onClick={() => setFeeling(feeling === i + 1 ? null : i + 1)}
                  className={cx(
                    'flex h-14 flex-1 items-center justify-center rounded-2xl border text-3xl transition',
                    feeling === i + 1 ? 'scale-105 border-accent bg-accent/12' : 'border-line bg-bg grayscale-[40%]',
                  )}
                >
                  {f.emoji}
                </button>
              ))}
            </div>
            <input
              className={inputClass}
              placeholder={cs.dose.notePlaceholder}
              maxLength={140}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              aria-label={cs.dose.note}
            />
          </div>

          {error && <p className="text-sm text-over" role="alert">{error}</p>}

          <Button className="w-full text-lg" onClick={save} disabled={busy || !validAmount}>
            {cs.dose.save}
          </Button>
          {dose && (
            <Button variant="danger" className="w-full" onClick={remove} disabled={busy}>
              {cs.dose.delete}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
