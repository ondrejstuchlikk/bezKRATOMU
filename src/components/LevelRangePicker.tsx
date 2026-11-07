import { useEffect, useRef, useState } from 'react'
import { cs } from '../i18n/cs'
import { DAY_OPTIONS, HOUR_OPTIONS, type PastHours } from '../lib/levelRange'
import { cx } from './ui'

/** Looks like Segmented, with a fourth button on the right that opens a small menu of longer ranges. */
export function LevelRangePicker({ value, onChange }: { value: PastHours; onChange: (h: PastHours) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const isDays = DAY_OPTIONS.includes(value)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const tab = (selected: boolean) =>
    cx('min-h-10 flex-1 rounded-xl px-2 text-sm font-semibold transition', selected ? 'bg-surface text-ink shadow-sm' : 'text-muted')

  return (
    <div ref={ref} className="relative mb-2 flex rounded-2xl border border-line bg-bg p-1" role="tablist">
      {HOUR_OPTIONS.map((h) => (
        <button
          key={h}
          type="button"
          role="tab"
          aria-selected={value === h}
          className={tab(value === h)}
          onClick={() => {
            setOpen(false)
            onChange(h)
          }}
        >
          {cs.level.range(h)}
        </button>
      ))}
      <button
        type="button"
        role="tab"
        aria-selected={isDays}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cx(tab(isDays), 'flex items-center justify-center gap-1 whitespace-nowrap')}
        onClick={() => setOpen((o) => !o)}
      >
        {isDays ? cs.level.range(value) : cs.level.rangeMore}
        <svg viewBox="0 0 12 12" className={cx('h-3 w-3 transition', open && 'rotate-180')} aria-hidden="true">
          <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div role="menu" className="absolute top-full right-0 z-20 mt-1.5 min-w-32 rounded-2xl border border-line bg-surface p-1 shadow-lg">
          {DAY_OPTIONS.map((h) => (
            <button
              key={h}
              type="button"
              role="menuitemradio"
              aria-checked={value === h}
              className={cx(
                'block min-h-10 w-full rounded-xl px-3 text-left text-sm font-semibold',
                value === h ? 'bg-bg text-ink' : 'text-muted',
              )}
              onClick={() => {
                setOpen(false)
                onChange(h)
              }}
            >
              {cs.level.range(h)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
