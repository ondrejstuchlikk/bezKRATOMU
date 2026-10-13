import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { backend, type MySettings } from '../api'
import { resetDemoData } from '../api/demoBackend'
import { NotificationSettings } from '../components/NotificationSettings'
import { Button, Card, ErrorState, errorMessage, inputClass, Loading, PageHeader, Segmented, Toggle } from '../components/ui'
import { keys, useSettings } from '../hooks/queries'
import { cs } from '../i18n/cs'
import { disablePushOnThisDevice } from '../lib/push'
import { getThemePreference, setThemePreference, type ThemePreference } from '../lib/theme'
import { formatNumber, parseDecimal } from '../lib/units'

export function SettingsPage() {
  const settings = useSettings()
  const [theme, setTheme] = useState<ThemePreference>(getThemePreference)

  if (settings.isPending) return <Loading />
  if (settings.isError) return <ErrorState error={settings.error} onRetry={() => settings.refetch()} />

  return (
    <div className="space-y-5">
      <PageHeader title={cs.settings.title} />
      <p className="-mt-3 text-muted">
        {cs.settings.loggedAs} <strong className="text-ink">{settings.data.nickname}</strong>
      </p>

      <Card className="space-y-5">
        <NumberSetting
          label={cs.settings.teaspoon}
          hint={cs.settings.teaspoonHint}
          placeholder={cs.settings.teaspoonPlaceholder}
          suffix="g"
          value={settings.data.teaspoonGrams}
          max={20}
          field="teaspoonGrams"
        />
        <NumberSetting
          label={cs.settings.price}
          hint={cs.settings.priceHint}
          placeholder={cs.settings.pricePlaceholder}
          suffix="Kč"
          value={settings.data.pricePerGram}
          max={10000}
          field="pricePerGram"
        />
      </Card>

      <ShareSetting value={settings.data.shareGrams} />

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
        <Link to="/plan" className="flex min-h-14 items-center justify-between px-5 font-semibold">
          {cs.settings.plan} <span className="text-muted">›</span>
        </Link>
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
