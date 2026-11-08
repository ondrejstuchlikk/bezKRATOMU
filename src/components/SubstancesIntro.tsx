import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { backend, type MySettings } from '../api'
import { keys, useSettings } from '../hooks/queries'
import { cs } from '../i18n/cs'
import { SUBSTANCES_INTRO_VERSION } from '../lib/substances'
import { Button, cx, errorMessage } from './ui'

type Option = 'caffeine' | 'cigarette' | 'snus'

const FIELD: Record<Option, 'trackCaffeine' | 'trackCigarettes' | 'trackSnus'> = {
  caffeine: 'trackCaffeine',
  cigarette: 'trackCigarettes',
  snus: 'trackSnus',
}

/**
 * What the window offers: caffeine only to people who never saw version 1, nicotine to everyone
 * below version 2; never something already switched on.
 */
function offered(s: MySettings): Option[] {
  const list: Option[] = []
  if (s.substancesIntroSeen < 1 && !s.trackCaffeine) list.push('caffeine')
  if (s.substancesIntroSeen < 2) {
    if (!s.trackCigarettes) list.push('cigarette')
    if (!s.trackSnus) list.push('snus')
  }
  return list
}

/** Shown once per account (user_settings.substances_intro_seen) after an update that adds substances. */
export function SubstancesIntro() {
  const settings = useSettings()
  const queryClient = useQueryClient()
  const [picked, setPicked] = useState<Option[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!settings.data || settings.data.substancesIntroSeen >= SUBSTANCES_INTRO_VERSION) return null
  const options = offered(settings.data)
  // Nothing new to offer (everything already on): don't interrupt.
  if (!options.length) return null

  const hasCaffeine = options.includes('caffeine')
  const hasNicotine = options.some((o) => o !== 'caffeine')
  const title = hasCaffeine && hasNicotine ? cs.substancesIntro.titleBoth : hasNicotine ? cs.substancesIntro.titleNicotine : cs.substancesIntro.title

  async function close(enable: Option[]) {
    setBusy(true)
    setError(null)
    try {
      const patch: Partial<MySettings> = { substancesIntroSeen: SUBSTANCES_INTRO_VERSION }
      for (const o of enable) patch[FIELD[o]] = true
      await backend.updateSettings(patch)
      await queryClient.invalidateQueries({ queryKey: keys.settings })
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  const toggle = (o: Option) => setPicked((p) => (p.includes(o) ? p.filter((x) => x !== o) : [...p, o]))

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="substances-intro-title">
      <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" />
      <div className="relative max-h-[94dvh] w-full max-w-md space-y-4 overflow-y-auto rounded-[2rem] border border-line bg-surface p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-2xl">
        <div className="text-4xl" aria-hidden>
          ✨
        </div>
        <h2 id="substances-intro-title" className="font-display text-2xl font-semibold">
          {title}
        </h2>
        <p className="leading-relaxed">{cs.substancesIntro.intro}</p>
        <div className="space-y-2">
          {options.map((o) => {
            const on = picked.includes(o)
            return (
              <button
                key={o}
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => toggle(o)}
                className={cx(
                  'flex w-full items-start gap-3 rounded-2xl border p-3 text-left transition',
                  on ? 'border-accent bg-accent/12' : 'border-line bg-bg',
                )}
              >
                <span
                  aria-hidden
                  className={cx(
                    'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg border-2 text-sm font-bold',
                    on ? 'border-accent bg-accent text-accent-ink' : 'border-line',
                  )}
                >
                  {on && '✓'}
                </span>
                <span>
                  <span className="block font-semibold">{cs.substancesIntro.options[o].label}</span>
                  <span className="block text-sm text-muted">{cs.substancesIntro.options[o].desc}</span>
                </span>
              </button>
            )
          })}
        </div>
        <p className="text-sm text-muted">
          🔒 {cs.substancesIntro.privacy} {cs.substancesIntro.hint}
        </p>
        {error && (
          <p className="text-sm text-over" role="alert">
            {error}
          </p>
        )}
        <div className="space-y-2 pt-1">
          <Button className="w-full text-lg" disabled={busy || !picked.length} onClick={() => close(picked)}>
            {cs.substancesIntro.enable}
          </Button>
          <Button variant="secondary" className="w-full" disabled={busy} onClick={() => close([])}>
            {cs.substancesIntro.later}
          </Button>
        </div>
      </div>
    </div>
  )
}
