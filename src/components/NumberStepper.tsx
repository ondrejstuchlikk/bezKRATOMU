import { useState } from 'react'
import { formatNumber, parseDecimal } from '../lib/units'
import { MinusIcon, PlusIcon } from './icons'

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
}: {
  value: number | null
  onChange: (value: number | null) => void
  step?: number
  min?: number
  max?: number
  integer?: boolean
  suffix?: string
  label: string
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
    <div className="flex items-center gap-3">
      <button
        type="button"
        aria-label="−"
        onClick={() => bump(-1)}
        className="flex size-14 shrink-0 items-center justify-center rounded-2xl border border-line bg-bg text-ink active:scale-95"
      >
        <MinusIcon />
      </button>
      <div className="relative flex-1">
        <input
          aria-label={label}
          inputMode={integer ? 'numeric' : 'decimal'}
          className="h-16 w-full rounded-2xl border border-line bg-bg text-center font-display text-4xl font-semibold tabular-nums outline-none focus:border-accent"
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
          <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-lg font-semibold text-muted">
            {suffix}
          </span>
        )}
      </div>
      <button
        type="button"
        aria-label="+"
        onClick={() => bump(1)}
        className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-accent text-accent-ink active:scale-95"
      >
        <PlusIcon />
      </button>
    </div>
  )
}
