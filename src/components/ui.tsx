import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AppError } from '../api'
import { cs } from '../i18n/cs'
import type { DayStatus } from '../lib/scoring'

export function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(' ')
}

export function errorMessage(error: unknown): string {
  return error instanceof AppError ? cs.errors[error.code] : cs.errors.unknown
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

const buttonStyles: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-ink shadow-sm shadow-accent/20',
  secondary: 'border border-line bg-surface text-ink',
  ghost: 'text-accent',
  danger: 'border border-over/40 text-over',
}

export function buttonClass(variant: ButtonVariant = 'primary', className?: string) {
  return cx(
    'inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl px-5 font-semibold transition',
    'active:scale-[.98] disabled:opacity-50 disabled:active:scale-100',
    buttonStyles[variant],
    className,
  )
}

export function Button({
  variant = 'primary',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return <button type="button" className={buttonClass(variant, className)} {...props} />
}

/** A link that looks like a button. */
export function ButtonLink({ to, variant = 'primary', className, children }: { to: string; variant?: ButtonVariant; className?: string; children: ReactNode }) {
  return (
    <Link to={to} className={buttonClass(variant, className)}>
      {children}
    </Link>
  )
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cx('rounded-3xl border border-line bg-surface p-5', className)}>{children}</section>
}

export function PageHeader({ title, back, children }: { title: string; back?: string; children?: ReactNode }) {
  return (
    <header className="mb-5 flex items-end justify-between gap-3">
      <div className="min-w-0">
        {back && (
          <Link to={back} className="mb-1 inline-flex min-h-8 items-center text-sm font-medium text-accent">
            ← {cs.common.back}
          </Link>
        )}
        <h1 className="truncate font-display text-3xl font-semibold tracking-tight">{title}</h1>
      </div>
      {children}
    </header>
  )
}

export function Loading({ label = cs.common.loading }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-12 text-muted" role="status">
      <span className="size-5 animate-spin rounded-full border-2 border-line border-t-accent" />
      {label}
    </div>
  )
}

export function ErrorState({ error, onRetry }: { error?: unknown; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center" role="alert">
      <p className="text-muted">{error ? errorMessage(error) : cs.common.error}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          {cs.common.retry}
        </Button>
      )}
    </div>
  )
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  className,
}: {
  value: T
  options: { value: T; label: ReactNode }[]
  onChange: (value: T) => void
  className?: string
}) {
  return (
    <div className={cx('flex rounded-2xl border border-line bg-bg p-1', className)} role="tablist">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={cx(
            'min-h-10 flex-1 rounded-xl px-2 text-sm font-semibold transition',
            o.value === value ? 'bg-surface text-ink shadow-sm' : 'text-muted',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cx(
        'relative h-8 w-14 shrink-0 rounded-full transition',
        checked ? 'bg-accent' : 'bg-line',
      )}
    >
      <span
        className={cx(
          'absolute top-1 left-1 size-6 rounded-full bg-surface shadow transition',
          checked && 'translate-x-6',
        )}
      />
    </button>
  )
}

export function StatusBadge({ status, provisional }: { status: DayStatus | 'none'; provisional?: boolean }) {
  const tone =
    status === 'met' ? 'bg-accent/15 text-accent' : status === 'over' ? 'bg-warn/15 text-warn' : 'bg-line/60 text-muted'
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold', tone)}>
      <span aria-hidden>{cs.statusIcon[status]}</span>
      {cs.status[status]}
      {provisional && <span className="font-normal opacity-75">· {cs.common.provisional}</span>}
    </span>
  )
}

export function Points({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cx('font-semibold tabular-nums', value > 0 ? 'text-accent' : value < 0 ? 'text-over' : 'text-muted', className)}>
      {cs.common.points(value)}
    </span>
  )
}

export function StatTile({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="text-xs font-medium tracking-wide text-muted uppercase">{label}</div>
      <div className="mt-1 font-display text-2xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
    </div>
  )
}

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string | null; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-semibold">{label}</span>
      {children}
      {error ? <span className="block text-sm text-over">{error}</span> : hint && <span className="block text-sm text-muted">{hint}</span>}
    </label>
  )
}

export const inputClass =
  'block min-h-12 w-full rounded-2xl border border-line bg-bg px-4 text-base text-ink outline-none transition placeholder:text-muted/70 focus:border-accent focus:ring-2 focus:ring-accent/20'
