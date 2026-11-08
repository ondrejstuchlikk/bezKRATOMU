import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { backend, type IntakePreset } from '../api'
import { keys } from '../hooks/queries'
import { cs } from '../i18n/cs'
import { MAX_PRESET_MG, MAX_PRESET_NAME, round1, type IntakeSubstance } from '../lib/substances'
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
  const [name, setName] = useState(preset?.name ?? '')
  const [mg, setMg] = useState(preset ? formatNumber(preset.amountMg) : '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const amount = parseDecimal(mg)
  const valid = name.trim().length > 0 && amount > 0 && amount <= MAX_PRESET_MG

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
      const input = { name: name.trim(), amountMg: round1(amount) }
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
      {error ? (
        <p className="text-sm text-over" role="alert">
          {error}
        </p>
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
