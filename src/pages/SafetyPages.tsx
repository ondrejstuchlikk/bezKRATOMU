import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { BareLayout, hasSafetyAck, setSafetyAck } from '../components/layout'
import { Button, Card, cx, PageHeader } from '../components/ui'
import { helpContacts } from '../config/helpContacts'
import { cs } from '../i18n/cs'

function SafetyPoints() {
  return (
    <ul className="space-y-3">
      {cs.safety.points.map((p) => (
        <li key={p} className="flex gap-3 leading-relaxed">
          <span aria-hidden className="mt-2 size-2 shrink-0 rounded-full bg-accent" />
          <span>{p}</span>
        </li>
      ))}
    </ul>
  )
}

function Contacts() {
  return (
    <div className="space-y-3">
      <h2 className="font-display text-xl font-semibold">{cs.safety.contactsTitle}</h2>
      {helpContacts.map((c) => (
        <Card key={c.name} className="flex items-center justify-between gap-3 p-4">
          <div className="min-w-0">
            <div className="font-semibold">{c.name}</div>
            <div className="text-sm text-muted">{c.description}</div>
          </div>
          {c.phone && (
            <a href={`tel:${c.phone}`} className="shrink-0 rounded-xl bg-accent/15 px-3 py-2 text-sm font-semibold text-accent">
              {cs.safety.call}
            </a>
          )}
          {c.url && (
            <a
              href={c.url}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 rounded-xl bg-accent/15 px-3 py-2 text-sm font-semibold text-accent"
            >
              {cs.safety.open}
            </a>
          )}
        </Card>
      ))}
    </div>
  )
}

/** First-run screen that must be acknowledged before using the app. */
export function WelcomePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [checked, setChecked] = useState(hasSafetyAck())
  const from = (location.state as { from?: string } | null)?.from ?? '/'

  return (
    <BareLayout>
      <div className="space-y-6">
        <div className="space-y-2">
          <p className="font-display text-lg text-accent">{cs.appName}</p>
          <h1 className="font-display text-4xl font-semibold tracking-tight">{cs.welcome.title}</h1>
          <p className="text-lg text-muted">{cs.welcome.intro}</p>
        </div>
        <Card>
          <SafetyPoints />
        </Card>
        <Contacts />
        <label
          className={cx(
            'flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border p-4 font-semibold transition',
            checked ? 'border-accent bg-accent/10' : 'border-line bg-surface',
          )}
        >
          <input
            type="checkbox"
            className="size-5 accent-[var(--accent)]"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
          />
          {cs.welcome.ack}
        </label>
        <Button
          className="w-full"
          disabled={!checked}
          onClick={() => {
            setSafetyAck()
            navigate(from === '/vitej' ? '/' : from, { replace: true })
          }}
        >
          {cs.welcome.continue}
        </Button>
      </div>
    </BareLayout>
  )
}

/** Permanently accessible "Bezpečnost a pomoc" page. */
export function SafetyPage() {
  const navigate = useNavigate()
  return (
    <BareLayout>
      <button type="button" onClick={() => navigate(-1)} className="mb-2 min-h-8 text-sm font-medium text-accent">
        ← {cs.safety.back}
      </button>
      <PageHeader title={cs.safety.title} />
      <div className="space-y-6">
        <Card>
          <SafetyPoints />
        </Card>
        <Contacts />
      </div>
    </BareLayout>
  )
}
