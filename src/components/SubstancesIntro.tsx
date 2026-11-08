import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { backend } from '../api'
import { keys, useSettings } from '../hooks/queries'
import { cs } from '../i18n/cs'
import { SUBSTANCES_INTRO_VERSION } from '../lib/substances'
import { Button, errorMessage } from './ui'

/** Shown once per account (user_settings.substances_intro_seen) after the update that added caffeine. */
export function SubstancesIntro() {
  const settings = useSettings()
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!settings.data || settings.data.substancesIntroSeen >= SUBSTANCES_INTRO_VERSION) return null

  async function close(enableCaffeine: boolean) {
    setBusy(true)
    setError(null)
    try {
      await backend.updateSettings({
        substancesIntroSeen: SUBSTANCES_INTRO_VERSION,
        ...(enableCaffeine ? { trackCaffeine: true } : {}),
      })
      await queryClient.invalidateQueries({ queryKey: keys.settings })
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="substances-intro-title">
      <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" />
      <div className="relative w-full max-w-md space-y-4 rounded-[2rem] border border-line bg-surface p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-2xl">
        <div className="text-4xl" aria-hidden>
          ✨☕
        </div>
        <h2 id="substances-intro-title" className="font-display text-2xl font-semibold">
          {cs.substancesIntro.title}
        </h2>
        <div className="space-y-2 leading-relaxed">
          {cs.substancesIntro.body.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </div>
        <p className="text-sm text-muted">{cs.substancesIntro.hint}</p>
        {error && (
          <p className="text-sm text-over" role="alert">
            {error}
          </p>
        )}
        <div className="space-y-2 pt-1">
          <Button className="w-full text-lg" disabled={busy} onClick={() => close(true)}>
            {cs.substancesIntro.enable}
          </Button>
          <Button variant="secondary" className="w-full" disabled={busy} onClick={() => close(false)}>
            {cs.substancesIntro.later}
          </Button>
        </div>
      </div>
    </div>
  )
}
