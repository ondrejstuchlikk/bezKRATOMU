import { useEffect, useState } from 'react'
import { backend, type Intake } from '../api'
import { useRefreshIntakes, useToday } from '../hooks/queries'
import { cs } from '../i18n/cs'
import { EDIT_WINDOW_DAYS } from '../lib/days'
import type { NicotineForm } from '../lib/substances'
import { addDays, formatWeekdayDate, pragueLocalToInstant, pragueTime, pragueToday, type ISODate } from '../lib/time'
import { Button, errorMessage, inputClass, Segmented } from './ui'

export interface NicotineSheetProps {
  open: boolean
  onClose: () => void
  /** Existing entry to edit (its form can't change); omitted for a new one. */
  intake?: Intake | null
  defaultDate: ISODate
  /** Forms offered for a new entry. */
  forms: NicotineForm[]
}

export function NicotineSheet({ open, ...props }: NicotineSheetProps) {
  if (!open) return null
  return <NicotineSheetForm key={props.intake?.id ?? `new-${props.defaultDate}`} {...props} />
}

function NicotineSheetForm({ onClose, intake, defaultDate, forms }: Omit<NicotineSheetProps, 'open'>) {
  const today = useToday()
  const refresh = useRefreshIntakes()
  const dayOptions = Array.from({ length: EDIT_WINDOW_DAYS + 1 }, (_, i) => {
    const d = addDays(today, -i)
    return { value: d, label: i === 0 ? cs.dose.todayLabel : i === 1 ? cs.dose.yesterdayLabel : formatWeekdayDate(d) }
  })
  const [form, setForm] = useState<NicotineForm>((intake?.substance as NicotineForm | undefined) ?? forms[0] ?? 'cigarette')
  const [date, setDate] = useState<ISODate>(intake?.localDate ?? defaultDate)
  const [time, setTime] = useState(() =>
    intake ? pragueTime(new Date(intake.takenAt)) : defaultDate === pragueToday() ? pragueTime(new Date()) : '12:00',
  )
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

  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await action()
      await refresh()
      onClose()
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  const save = () =>
    run(() => {
      const input = { substance: form, takenAt: pragueLocalToInstant(date, time), amount: 1, presetName: null, presetCount: null }
      return intake ? backend.updateIntake(intake.id, input) : backend.addIntake(input)
    })

  const remove = () => {
    if (intake && window.confirm(cs.nicotine.sheet.confirmDelete)) run(() => backend.deleteIntake(intake.id))
  }

  const title = intake ? cs.nicotine.sheet.editTitle : cs.nicotine.sheet.addTitle
  const f = cs.nicotine.forms

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label={cs.common.close} className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-[2rem] border border-line bg-surface px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl">
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-line" />
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-2xl font-semibold">
            {cs.substances.emoji.nicotine} {title}
          </h2>
          <button type="button" onClick={onClose} className="min-h-10 px-2 text-sm font-medium text-muted">
            {cs.common.cancel}
          </button>
        </div>

        <div className="space-y-5">
          {intake || forms.length < 2 ? (
            <p className="text-lg font-semibold">
              {f[form].emoji} {f[form].one}
            </p>
          ) : (
            <Segmented
              value={form}
              onChange={setForm}
              options={forms.map((x) => ({ value: x, label: `${f[x].emoji} ${f[x].one}` }))}
            />
          )}

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

          <Button className="w-full text-lg" onClick={save} disabled={busy}>
            {cs.nicotine.sheet.save}
          </Button>
          {intake && (
            <Button variant="danger" className="w-full" onClick={remove} disabled={busy}>
              {cs.nicotine.sheet.delete}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
