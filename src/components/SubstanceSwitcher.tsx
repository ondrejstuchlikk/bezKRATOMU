import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useSubstance } from '../hooks/substance'
import { cs } from '../i18n/cs'
import { cx } from './ui'

/** "🌿 Kratom ▾" pill at the top of the tabs; opens a list of the tracked substances. */
export function SubstanceSwitcher() {
  const { substance, setSubstance, tracked } = useSubstance()
  const [open, setOpen] = useState(false)
  if (tracked.length < 2) return null

  return (
    <div className="relative z-30 mb-4">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${cs.substances.switcherLabel}: ${cs.substances.names[substance]}`}
        onClick={() => setOpen(!open)}
        className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-surface py-1.5 pr-4 pl-3 font-semibold shadow-sm transition active:scale-[.98]"
      >
        <span className="text-lg" aria-hidden>
          {cs.substances.emoji[substance]}
        </span>
        {cs.substances.names[substance]}
        <svg viewBox="0 0 24 24" aria-hidden className={cx('size-4 text-muted transition', open && 'rotate-180')} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <>
          <button type="button" aria-label={cs.common.close} className="fixed inset-0 cursor-default" onClick={() => setOpen(false)} />
          <div role="menu" className="absolute top-full left-0 mt-2 w-60 overflow-hidden rounded-2xl border border-line bg-surface p-1.5 shadow-xl">
            {tracked.map((s) => (
              <button
                key={s}
                type="button"
                role="menuitemradio"
                aria-checked={s === substance}
                onClick={() => {
                  setSubstance(s)
                  setOpen(false)
                }}
                className={cx(
                  'flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left font-semibold',
                  s === substance ? 'bg-accent/12 text-accent' : 'active:bg-bg',
                )}
              >
                <span className="text-xl" aria-hidden>
                  {cs.substances.emoji[s]}
                </span>
                <span className="flex-1">{cs.substances.names[s]}</span>
                {s === substance && <span aria-hidden>✓</span>}
              </button>
            ))}
            <Link
              to="/nastaveni"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex min-h-11 items-center rounded-xl px-3 text-sm font-medium text-muted active:bg-bg"
            >
              {cs.substances.manage}
            </Link>
          </div>
        </>
      )}
    </div>
  )
}
