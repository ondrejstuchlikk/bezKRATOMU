import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { backend, type IntakePreset } from '../api'
import { keys, useSettings } from '../hooks/queries'
import { cs } from '../i18n/cs'
import { MAX_PRESET_MG, MAX_PRESET_NAME, round1, validDrinkMinutes, type IntakeSubstance } from '../lib/substances'
import { formatNumber, parseDecimal } from '../lib/units'
import { Button, errorMessage, inputClass } from './ui'

/** Add a new preset (no `preset`) or edit/delete an existing one. */
export function PresetForm({
  substance,
  preset,
  onDone,
}: {
  substance: IntakeSubstance
  preset?: IntakePreset
  /** Called after saving (with the saved preset), deleting (null) or cancelling (undefined). */
  onDone: (saved: IntakePreset | null | undefined) => void
}) {
  const queryClient = useQueryClient()
  const settings = useSettings()
  const [name, setName] = useState(preset?.name ?? '')
  const [mg, setMg] = useState(preset ? formatNumber(preset.amountMg) : '')
  const [minutes, setMinutes] = useState(preset?.drinkMinutes == null ? '' : String(preset.drinkMinutes))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const amount = parseDecimal(mg)
  const drinkMinutes = minutes.trim() === '' ? null : Number(minutes.trim())
  const validMinutes = drinkMinutes === null || validDrinkMinutes(drinkMinutes)
  const valid = name.trim().length > 0 && amount > 0 && amount <= MAX_PRESET_MG && validMinutes

  async function run(action: () => Promise<IntakePreset | null>) {
    setBusy(true)
    setError(null)
    try {
      const result = await action()
      await queryClient.invalidateQueries({ queryKey: keys.presets(substance) })
      onDone(result)
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  const save = () =>
    run(async () => {
      const input = { name: name.trim(), amountMg: round1(amount), drinkMinutes }
      if (!preset) return backend.addPreset(substance, input)
      await backend.updatePreset(preset.id, input)
      return { ...preset, ...input }
    })

  const remove = () => {
    if (!preset || !window.confirm(cs.caffeine.preset.confirmDelete(preset.name))) return
    run(async () => {
      await backend.deletePreset(preset.id)
      return null
    })
  }

  return (
    <div className="space-y-3 rounded-2xl border border-line bg-bg p-3">
      <div className="grid grid-cols-[1fr_7rem] gap-2">
        <label className="space-y-1">
          <span className="text-sm font-semibold">{cs.caffeine.preset.name}</span>
          <input
            className={inputClass + ' bg-surface'}
            value={name}
            maxLength={MAX_PRESET_NAME}
            placeholder={cs.caffeine.preset.namePlaceholder}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="space-y-1">
          <span className="text-sm font-semibold">{cs.caffeine.preset.mg}</span>
          <input className={inputClass + ' bg-surface'} inputMode="decimal" value={mg} placeholder="80" onChange={(e) => setMg(e.target.value)} />
        </label>
      </div>
      <label className="block space-y-1">
        <span className="text-sm font-semibold">{cs.caffeine.preset.minutes}</span>
        <div className="relative">
          <input
            className={inputClass + ' bg-surface'}
            inputMode="numeric"
            value={minutes}
            placeholder={cs.caffeine.preset.minutesPlaceholder(cs.caffeine.drinkTime(settings.data?.caffeineDrinkMinutes ?? 0))}
            onChange={(e) => setMinutes(e.target.value)}
          />
          {minutes.trim() !== '' && <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-muted">min</span>}
        </div>
        <span className="block text-xs text-muted">{cs.caffeine.preset.minutesHint}</span>
      </label>
      {error ? (
        <p className="text-sm text-over" role="alert">
          {error}
        </p>
      ) : !validMinutes ? (
        <p className="text-sm text-over">{cs.caffeine.preset.invalidMinutes}</p>
      ) : (
        !valid && (name || mg) && <p className="text-sm text-muted">{cs.caffeine.preset.invalid}</p>
      )}
      <div className="flex gap-2">
        <Button className="flex-1" disabled={busy || !valid} onClick={save}>
          {cs.caffeine.preset.save}
        </Button>
        <Button variant="secondary" disabled={busy} onClick={() => onDone(undefined)}>
          {cs.caffeine.preset.cancel}
        </Button>
        {preset && (
          <Button variant="danger" disabled={busy} onClick={remove}>
            {cs.caffeine.preset.delete}
          </Button>
        )}
      </div>
    </div>
  )
}
