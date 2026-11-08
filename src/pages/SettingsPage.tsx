import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { backend, type MySettings } from '../api'
import { resetDemoData } from '../api/demoBackend'
import { NotificationSettings } from '../components/NotificationSettings'
import { PresetForm } from '../components/PresetForm'
import { Button, Card, ErrorState, errorMessage, inputClass, Loading, PageHeader, Segmented, Toggle } from '../components/ui'
import { keys, useIntakePresets, useSettings } from '../hooks/queries'
import { useSubstance } from '../hooks/substance'
import type { IntakeSubstance } from '../lib/substances'
import { cs } from '../i18n/cs'
import { disablePushOnThisDevice } from '../lib/push'
import { getThemePreference, setThemePreference, type ThemePreference } from '../lib/theme'
import { formatMg, formatNumber, parseDecimal } from '../lib/units'

export function SettingsPage() {
  const settings = useSettings()
  const { substance } = useSubstance()
  const [theme, setTheme] = useState<ThemePreference>(getThemePreference)

  if (settings.isPending) return <Loading />
  if (settings.isError) return <ErrorState error={settings.error} onRetry={() => settings.refetch()} />

  return (
    <div className="space-y-5">
      <PageHeader title={cs.settings.title} />
      <p className="-mt-3 text-muted">
        {cs.settings.loggedAs} <strong className="text-ink">{settings.data.nickname}</strong>
      </p>

      <TrackedSubstances settings={settings.data} />

      {substance === 'kratom' ? (
        <KratomSettings settings={settings.data} />
      ) : (
        <PresetSettings substance={substance} />
      )}

      <NotificationSettings settings={settings.data} />

      <Card className="space-y-3">
        <h2 className="font-semibold">{cs.settings.theme}</h2>
        <Segmented
          value={theme}
          onChange={(t) => {
            setTheme(t)
            setThemePreference(t)
          }}
          options={(['system', 'light', 'dark'] as const).map((t) => ({ value: t, label: cs.settings.themes[t] }))}
        />
      </Card>

      <Card className="divide-y divide-line p-0">
        {substance === 'kratom' && (
          <Link to="/plan" className="flex min-h-14 items-center justify-between px-5 font-semibold">
            {cs.settings.plan} <span className="text-muted">›</span>
          </Link>
        )}
        <Link to="/bezpecnost" className="flex min-h-14 items-center justify-between px-5 font-semibold">
          🛟 {cs.settings.safety} <span className="text-muted">›</span>
        </Link>
      </Card>
      <Button
        variant="secondary"
        className="w-full"
        onClick={async () => {
          // A shared phone shouldn't keep getting the previous user's notifications.
          await disablePushOnThisDevice().catch(() => {})
          await backend.logout()
        }}
      >
        {cs.settings.logout}
      </Button>

      {backend.mode === 'demo' && (
        <Button
          variant="danger"
          className="w-full"
          onClick={() => {
            if (!window.confirm(cs.settings.resetDemoConfirm)) return
            resetDemoData()
            window.location.reload()
          }}
        >
          {cs.settings.resetDemo}
        </Button>
      )}
    </div>
  )
}

function TrackedSubstances({ settings }: { settings: MySettings }) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function change(next: boolean) {
    setBusy(true)
    setError(null)
    try {
      await backend.updateSettings({ trackCaffeine: next })
      await queryClient.invalidateQueries({ queryKey: keys.settings })
    } catch (err) {
      setError(errorMessage(err))
    }
    setBusy(false)
  }

  return (
    <Card className="space-y-3">
      <h2 className="font-semibold">{cs.settings.substances}</h2>
      <div className="flex items-center justify-between gap-4">
        <span className="font-medium">
          {cs.substances.emoji.kratom} {cs.substances.names.kratom}
        </span>
        <span className="text-sm text-muted">✓</span>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="font-medium">
          {cs.substances.emoji.caffeine} {cs.substances.names.caffeine}
        </span>
        <div className={busy ? 'opacity-50' : ''}>
          <Toggle checked={settings.trackCaffeine} onChange={change} label={cs.substances.names.caffeine} />
        </div>
      </div>
      <p className={error ? 'text-sm text-over' : 'text-sm text-muted'}>{error ?? cs.settings.substancesHint}</p>
    </Card>
  )
}

function KratomSettings({ settings }: { settings: MySettings }) {
  return (
    <>
      <Card className="space-y-5">
        <NumberSetting
          label={cs.settings.teaspoon}
          hint={cs.settings.teaspoonHint}
          placeholder={cs.settings.teaspoonPlaceholder}
          suffix="g"
          value={settings.teaspoonGrams}
          max={20}
          field="teaspoonGrams"
        />
        <NumberSetting
          label={cs.settings.price}
          hint={cs.settings.priceHint}
          placeholder={cs.settings.pricePlaceholder}
          suffix="Kč"
          value={settings.pricePerGram}
          max={10000}
          field="pricePerGram"
        />
      </Card>

      <ShareSetting value={settings.shareGrams} />
    </>
  )
}

/** The user's own drinks for one substance: list, edit, delete, add. */
function PresetSettings({ substance }: { substance: IntakeSubstance }) {
  const presets = useIntakePresets(substance)
  // Id of the preset being edited, 'new' while adding one.
  const [editing, setEditing] = useState<string | null>(null)

  return (
    <Card className="space-y-3">
      <h2 className="font-semibold">
        {cs.substances.emoji[substance]} {cs.settings.caffeinePresets}
      </h2>
      <p className="text-sm text-muted">{cs.settings.caffeinePresetsHint}</p>
      {presets.isPending ? (
        <Loading />
      ) : presets.isError ? (
        <ErrorState error={presets.error} onRetry={() => presets.refetch()} />
      ) : (
        <ul className="divide-y divide-line">
          {presets.data.map((p) =>
            editing === p.id ? (
              <li key={p.id} className="py-2">
                <PresetForm substance={substance} preset={p} onDone={() => setEditing(null)} />
              </li>
            ) : (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setEditing(p.id)}
                  className="flex min-h-12 w-full items-center gap-3 text-left"
                >
                  <span className="flex-1 font-semibold">{p.name}</span>
                  <span className="text-muted tabular-nums">{formatMg(p.amountMg)}</span>
                  <span className="text-muted">›</span>
                </button>
              </li>
            ),
          )}
          {!presets.data.length && <li className="py-2 text-sm text-muted">{cs.settings.noPresets}</li>}
        </ul>
      )}
      {editing === 'new' ? (
        <PresetForm substance={substance} onDone={() => setEditing(null)} />
      ) : (
        <Button variant="secondary" className="w-full" onClick={() => setEditing('new')}>
          {cs.settings.addPreset}
        </Button>
      )}
    </Card>
  )
}

function NumberSetting({
  label,
  hint,
  placeholder,
  suffix,
  value,
  max,
  field,
}: {
  label: string
  hint: string
  placeholder: string
  suffix: string
  value: number | null
  max: number
  field: 'teaspoonGrams' | 'pricePerGram'
}) {
  const queryClient = useQueryClient()
  const [text, setText] = useState(value === null ? '' : formatNumber(value))
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [error, setError] = useState<string | null>(null)

  const parsed = text.trim() === '' ? null : parseDecimal(text)
  const invalid = parsed !== null && (Number.isNaN(parsed) || parsed <= 0 || parsed > max)
  const changed = parsed !== value

  async function save() {
    if (invalid) return
    setStatus('saving')
    setError(null)
    try {
      await backend.updateSettings({ [field]: parsed === null ? null : Math.round(parsed * 100) / 100 } as Partial<MySettings>)
      await queryClient.invalidateQueries({ queryKey: keys.settings })
      setStatus('saved')
    } catch (err) {
      setError(errorMessage(err))
      setStatus('idle')
    }
  }

  return (
    <div className="space-y-1.5">
      <label className="text-sm font-semibold" htmlFor={field}>
        {label}
      </label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            id={field}
            className={inputClass}
            inputMode="decimal"
            placeholder={placeholder}
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              setStatus('idle')
            }}
          />
          <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-muted">{suffix}</span>
        </div>
        <Button variant="secondary" disabled={invalid || !changed || status === 'saving'} onClick={save}>
          {status === 'saved' && !changed ? cs.common.saved : cs.common.save}
        </Button>
      </div>
      <p className={invalid || error ? 'text-sm text-over' : 'text-sm text-muted'}>
        {invalid ? cs.settings.invalidNumber : (error ?? hint)}
      </p>
    </div>
  )
}

function ShareSetting({ value }: { value: boolean }) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function change(next: boolean) {
    setBusy(true)
    setError(null)
    try {
      await backend.updateSettings({ shareGrams: next })
      await queryClient.invalidateQueries()
    } catch (err) {
      setError(errorMessage(err))
    }
    setBusy(false)
  }

  return (
    <Card className="space-y-2">
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-semibold">{cs.settings.share}</h2>
        <div className={busy ? 'opacity-50' : ''}>
          <Toggle checked={value} onChange={change} label={cs.settings.share} />
        </div>
      </div>
      <p className={error ? 'text-sm text-over' : 'text-sm text-muted'}>{error ?? cs.settings.shareHint}</p>
    </Card>
  )
}
