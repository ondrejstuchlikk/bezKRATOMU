import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { backend } from '../api'
import { DEMO_PIN } from '../api/demoBackend'
import { BareLayout } from '../components/layout'
import { Button, Card, errorMessage, Field, inputClass } from '../components/ui'
import { cs } from '../i18n/cs'
import { isValidPin, validateNickname } from '../lib/nickname'

function Brand() {
  return (
    <div className="mb-8 space-y-2 pt-6 text-center">
      <img src="./favicon.svg" alt="" className="mx-auto size-16 rounded-2xl shadow-lg shadow-accent/20" />
      <h1 className="font-display text-4xl font-semibold tracking-tight">{cs.appName}</h1>
      <p className="text-muted">{cs.tagline}</p>
    </div>
  )
}

function PinInput({ value, onChange, label, autoComplete }: { value: string; onChange: (v: string) => void; label: string; autoComplete: string }) {
  return (
    <Field label={label}>
      <input
        className={`${inputClass} text-center font-display text-2xl tracking-[0.5em]`}
        type="password"
        inputMode="numeric"
        autoComplete={autoComplete}
        maxLength={6}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
      />
    </Field>
  )
}

function DemoHint() {
  if (backend.mode !== 'demo') return null
  return <p className="rounded-2xl bg-warn/12 p-4 text-sm leading-relaxed">{cs.auth.demoHint(DEMO_PIN)}</p>
}

export function LoginPage() {
  const [nickname, setNickname] = useState('')
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!isValidPin(pin)) return setError(cs.auth.pinInvalid)
    setBusy(true)
    try {
      await backend.login(nickname, pin)
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <BareLayout>
      <Brand />
      <Card>
        <form onSubmit={submit} className="space-y-4">
          <h2 className="font-display text-2xl font-semibold">{cs.auth.loginTitle}</h2>
          <Field label={cs.auth.nickname}>
            <input
              className={inputClass}
              autoComplete="username"
              autoCapitalize="none"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
            />
          </Field>
          <PinInput label={cs.auth.pin} value={pin} onChange={setPin} autoComplete="current-password" />
          {error && <p className="text-sm text-over" role="alert">{error}</p>}
          <Button type="submit" className="w-full" disabled={busy || !nickname.trim() || pin.length !== 6}>
            {cs.auth.login}
          </Button>
        </form>
      </Card>
      <div className="mt-5 space-y-4 text-center">
        <Link to="/registrace" className="inline-block min-h-10 font-semibold text-accent">
          {cs.auth.toRegister}
        </Link>
        <DemoHint />
        <Link to="/bezpecnost" className="block text-sm text-muted underline">
          {cs.safety.title}
        </Link>
      </div>
    </BareLayout>
  )
}

export function RegisterPage() {
  const [nickname, setNickname] = useState('')
  const [pin, setPin] = useState('')
  const [pin2, setPin2] = useState('')
  const [checked, setChecked] = useState<{ nickname: string; available: boolean } | null>(null)
  const available = checked?.nickname === nickname ? checked.available : null
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const nicknameError = nickname ? validateNickname(nickname) : null

  // Check availability shortly after the user stops typing.
  useEffect(() => {
    if (!nickname || validateNickname(nickname)) return
    const id = setTimeout(() => {
      backend.isNicknameAvailable(nickname.trim()).then(
        (ok) => setChecked({ nickname, available: ok }),
        () => setChecked(null),
      )
    }, 400)
    return () => clearTimeout(id)
  }, [nickname])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const nickErr = validateNickname(nickname)
    if (nickErr) return setError(cs.auth.nicknameErrors[nickErr])
    if (!isValidPin(pin)) return setError(cs.auth.pinInvalid)
    if (pin !== pin2) return setError(cs.auth.pinMismatch)
    setBusy(true)
    try {
      await backend.register(nickname.trim(), pin)
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  const nicknameHelp = nicknameError
    ? cs.auth.nicknameErrors[nicknameError]
    : available === false
      ? cs.errors.nickname_taken
      : null

  return (
    <BareLayout>
      <Brand />
      <Card>
        <form onSubmit={submit} className="space-y-4">
          <h2 className="font-display text-2xl font-semibold">{cs.auth.registerTitle}</h2>
          <Field
            label={cs.auth.nickname}
            hint={available ? cs.auth.nicknameFree : cs.auth.nicknameHint}
            error={nicknameHelp}
          >
            <input
              className={inputClass}
              autoComplete="username"
              maxLength={20}
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
            />
          </Field>
          <PinInput label={cs.auth.pin} value={pin} onChange={setPin} autoComplete="new-password" />
          <PinInput label={cs.auth.pinAgain} value={pin2} onChange={setPin2} autoComplete="new-password" />
          <p className="text-sm text-muted">{cs.auth.pinWarning}</p>
          {error && <p className="text-sm text-over" role="alert">{error}</p>}
          <Button
            type="submit"
            className="w-full"
            disabled={busy || !!nicknameError || available === false || pin.length !== 6 || pin2.length !== 6}
          >
            {cs.auth.register}
          </Button>
        </form>
      </Card>
      <div className="mt-5 space-y-4 text-center">
        <Link to="/prihlaseni" className="inline-block min-h-10 font-semibold text-accent">
          {cs.auth.toLogin}
        </Link>
        <DemoHint />
      </div>
    </BareLayout>
  )
}
