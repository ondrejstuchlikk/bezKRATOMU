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
import { MAX_DRINK_MINUTES, type NicotineForm } from '../lib/substances'
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

      {substance === 'kratom' && <KratomSettings settings={settings.data} />}
      {substance === 'caffeine' && (
        <>
          <PresetSettings substance={substance} />
          <CaffeineLevelSettings settings={settings.data} />
        </>
      )}
      {substance === 'nicotine' && <NicotinePrices settings={settings.data} />}

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

  async function change(patch: Partial<MySettings>) {
    setBusy(true)
    setError(null)
    try {
      await backend.updateSettings(patch)
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
          <Toggle checked={settings.trackCaffeine} onChange={(v) => change({ trackCaffeine: v })} label={cs.substances.names.caffeine} />
        </div>
      </div>
      <div className="pt-1 text-xs font-medium tracking-wide text-muted uppercase">{cs.settings.nicotineGroup}</div>
      {(['cigarette', 'snus'] as const).map((f) => {
        const field = f === 'cigarette' ? 'trackCigarettes' : 'trackSnus'
        return (
          <div key={f} className="flex items-center justify-between gap-4">
            <span className="font-medium">
              {cs.nicotine.forms[f].emoji} {cs.nicotine.forms[f].name}
            </span>
            <div className={busy ? 'opacity-50' : ''}>
              <Toggle checked={settings[field]} onChange={(v) => change({ [field]: v })} label={cs.nicotine.forms[f].name} />
            </div>
          </div>
        )
      })}
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

/** Body weight and bedtime for the "Kofein v těle" estimate. */
function CaffeineLevelSettings({ settings }: { settings: MySettings }) {
  const queryClient = useQueryClient()
  const [bedtime, setBedtime] = useState(settings.bedtime)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function saveBedtime() {
    setStatus('saving')
    setError(null)
    try {
      await backend.updateSettings({ bedtime })
      await queryClient.invalidateQueries({ queryKey: keys.settings })
      setStatus('saved')
    } catch (err) {
      setError(errorMessage(err))
      setStatus('idle')
    }
  }

  return (
    <Card className="space-y-5">
      <h2 className="font-semibold">
        {cs.substances.emoji.caffeine} {cs.settings.caffeineLevel}
      </h2>
      <NumberSetting
        label={cs.settings.weight}
        hint={cs.settings.weightHint}
        placeholder="70"
        suffix="kg"
        value={settings.bodyWeightKg}
        min={30}
        max={250}
        field="bodyWeightKg"
      />
      <div className="space-y-1.5">
        <label className="text-sm font-semibold" htmlFor="bedtime">
          {cs.settings.bedtime}
        </label>
        <div className="flex gap-2">
          <input
            id="bedtime"
            type="time"
            className={inputClass + ' flex-1'}
            value={bedtime}
            onChange={(e) => {
              setBedtime(e.target.value || '23:00')
              setStatus('idle')
            }}
          />
          <Button variant="secondary" disabled={bedtime === settings.bedtime || status === 'saving'} onClick={saveBedtime}>
            {status === 'saved' && bedtime === settings.bedtime ? cs.common.saved : cs.common.save}
          </Button>
        </div>
        <p className={error ? 'text-sm text-over' : 'text-sm text-muted'}>{error ?? cs.settings.bedtimeHint}</p>
      </div>
      <NumberSetting
        label={cs.settings.drinkTime}
        hint={cs.settings.drinkTimeHint}
        placeholder="0"
        suffix="min"
        value={settings.caffeineDrinkMinutes}
        max={MAX_DRINK_MINUTES}
        field="caffeineDrinkMinutes"
        integer
        required
        allowZero
      />
    </Card>
  )
}

/** Pack price and size of each tracked nicotine form, for the "money spent" statistics. */
function NicotinePrices({ settings }: { settings: MySettings }) {
  const forms: NicotineForm[] = (['cigarette', 'snus'] as const).filter((f) =>
    f === 'cigarette' ? settings.trackCigarettes : settings.trackSnus,
  )
  return (
    <Card className="space-y-5">
      <div className="space-y-1">
        <h2 className="font-semibold">
          {cs.substances.emoji.nicotine} {cs.settings.nicotinePrices}
        </h2>
        <p className="text-sm text-muted">{cs.settings.nicotinePricesHint}</p>
      </div>
      {forms.map((f) => (
        <div key={f} className="space-y-4">
          <NumberSetting
            label={cs.nicotine.forms[f].packPrice}
            hint=""
            placeholder={f === 'cigarette' ? '160' : '130'}
            suffix="Kč"
            value={f === 'cigarette' ? settings.cigarettePackPrice : settings.snusPackPrice}
            max={10000}
            field={f === 'cigarette' ? 'cigarettePackPrice' : 'snusPackPrice'}
          />
          <NumberSetting
            label={cs.nicotine.forms[f].packSize}
            hint=""
            placeholder="20"
            suffix="ks"
            value={f === 'cigarette' ? settings.cigarettePackSize : settings.snusPackSize}
            max={1000}
            integer
            required
            field={f === 'cigarette' ? 'cigarettePackSize' : 'snusPackSize'}
          />
        </div>
      ))}
    </Card>
  )
}

/** The user's own drinks for one substance: list, edit, delete, add. */
function PresetSettings({ substance }: { substance: 'caffeine' }) {
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
                  <span className="text-muted tabular-nums">
                    {formatMg(p.amountMg)}
                    {p.drinkMinutes !== null && ` · ${cs.caffeine.drinkTime(p.drinkMinutes)}`}
                  </span>
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
  integer = false,
  required = false,
  allowZero = false,
  min,
}: {
  label: string
  hint: string
  placeholder: string
  suffix: string
  value: number | null
  max: number
  field:
    | 'teaspoonGrams'
    | 'pricePerGram'
    | 'cigarettePackPrice'
    | 'snusPackPrice'
    | 'cigarettePackSize'
    | 'snusPackSize'
    | 'bodyWeightKg'
    | 'caffeineDrinkMinutes'
  /** Lowest allowed value (exclusive 0 by default). */
  min?: number
  /** Whole numbers only. */
  integer?: boolean
  /** Can't be left empty. */
  required?: boolean
  /** 0 is a valid value. */
  allowZero?: boolean
}) {
  const queryClient = useQueryClient()
  const [text, setText] = useState(value === null ? '' : formatNumber(value))
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [error, setError] = useState<string | null>(null)

  const parsed = text.trim() === '' ? null : parseDecimal(text)
  const invalid =
    (parsed === null && required) ||
    (parsed !== null &&
      (Number.isNaN(parsed) || parsed < 0 || (parsed === 0 && !allowZero) || (min !== undefined && parsed < min) || parsed > max || (integer && !Number.isInteger(parsed))))
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
