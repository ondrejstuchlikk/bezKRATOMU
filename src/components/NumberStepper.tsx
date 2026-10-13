import { useState } from 'react'
import { formatNumber, parseDecimal } from '../lib/units'
import { MinusIcon, PlusIcon } from './icons'
import { cx } from './ui'

/** Big one-hand number input with −/+ buttons. Accepts a decimal comma. */
export function NumberStepper({
  value,
  onChange,
  step = 1,
  min = 0,
  max = 999,
  integer = false,
  suffix,
  label,
  compact = false,
  invalid = false,
}: {
  value: number | null
  onChange: (value: number | null) => void
  step?: number
  min?: number
  max?: number
  integer?: boolean
  suffix?: string
  label: string
  /** Smaller variant for long lists. */
  compact?: boolean
  invalid?: boolean
}) {
  const [text, setText] = useState(value === null ? '' : formatNumber(value))
  const [shownValue, setShownValue] = useState(value)

  // Keep the text in sync when the value changes from outside (steppers, unit switch).
  if (value !== shownValue) {
    setShownValue(value)
    if (value === null ? text !== '' : parseDecimal(text) !== value) setText(value === null ? '' : formatNumber(value))
  }

  const clamp = (v: number) => Math.min(max, Math.max(min, v))
  const bump = (dir: 1 | -1) => {
    const base = value ?? 0
    const next = clamp(Math.round((base + dir * step) / step) * step)
    onChange(Math.round(next * 100) / 100)
  }

  return (
    <div className={cx('flex items-center', compact ? 'gap-2' : 'gap-3')}>
      <button
        type="button"
        aria-label="−"
        onClick={() => bump(-1)}
        className={cx(
          'flex shrink-0 items-center justify-center border border-line bg-bg text-ink active:scale-95',
          compact ? 'size-10 rounded-xl' : 'size-14 rounded-2xl',
        )}
      >
        <MinusIcon />
      </button>
      <div className="relative flex-1">
        <input
          aria-label={label}
          inputMode={integer ? 'numeric' : 'decimal'}
          aria-invalid={invalid || undefined}
          className={cx(
            'w-full border bg-bg text-center font-display font-semibold tabular-nums outline-none focus:border-accent',
            compact ? 'h-11 rounded-xl text-xl' : 'h-16 rounded-2xl text-4xl',
            invalid ? 'border-over' : 'border-line',
          )}
          value={text}
          onChange={(e) => {
            const t = e.target.value.replace(/[^\d.,]/g, '')
            setText(t)
            const parsed = parseDecimal(t)
            if (t === '') onChange(null)
            else if (!Number.isNaN(parsed)) onChange(integer ? Math.trunc(parsed) : Math.round(parsed * 100) / 100)
          }}
        />
        {suffix && (
          <span
            className={cx(
              'pointer-events-none absolute top-1/2 -translate-y-1/2 font-semibold text-muted',
              compact ? 'right-3 text-sm' : 'right-4 text-lg',
            )}
          >
            {suffix}
          </span>
        )}
      </div>
      <button
        type="button"
        aria-label="+"
        onClick={() => bump(1)}
        className={cx(
          'flex shrink-0 items-center justify-center bg-accent text-accent-ink active:scale-95',
          compact ? 'size-10 rounded-xl' : 'size-14 rounded-2xl',
        )}
      >
        <PlusIcon />
      </button>
    </div>
  )
}
