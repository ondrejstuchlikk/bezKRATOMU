import { cs } from '../i18n/cs'
import { invalidLimitRows, MAX_BASELINE_G, MAX_CUSTOM_DAYS, MIN_CUSTOM_DAYS, PLAN_STEP_G } from '../lib/plan'
import { addDays, formatWeekdayDate, type ISODate } from '../lib/time'
import { gramsToTeaspoons } from '../lib/units'
import { NumberStepper } from './NumberStepper'
import { Button } from './ui'

/** Editable list of daily limits: one row per date, starting at `startDate`. */
export function DayLimitsEditor({
  startDate,
  limits,
  onChange,
  teaspoonGrams,
}: {
  startDate: ISODate
  limits: (number | null)[]
  onChange: (limits: (number | null)[]) => void
  teaspoonGrams: number | null
}) {
  const invalid = invalidLimitRows(limits)

  function setDay(i: number, value: number | null) {
    const next = limits.slice()
    next[i] = value
    // Lowering a day pulls the later days down with it, so the plan keeps going down.
    if (value !== null) for (let j = i + 1; j < next.length; j++) if (next[j] !== null && next[j]! > value) next[j] = value
    onChange(next)
  }

  function appendDays(n: number) {
    const last = limits[limits.length - 1] ?? 0
    const count = Math.min(n, MAX_CUSTOM_DAYS - limits.length)
    onChange([...limits, ...Array<number>(count).fill(last)])
  }

  return (
    <div className="space-y-3">
      <ul className="-mx-1 divide-y divide-line">
        {limits.map((limit, i) => {
          const date = addDays(startDate, i)
          const name = i === 0 ? cs.customPlan.today : i === 1 ? cs.customPlan.tomorrow : null
          return (
            <li key={date} className="flex items-center gap-3 px-1 py-2">
              <div className="w-24 shrink-0 text-sm leading-tight">
                <div className="font-semibold">{name ?? formatWeekdayDate(date)}</div>
                {name && <div className="text-muted">{formatWeekdayDate(date)}</div>}
                {invalid[i] && limit !== null && i > 0 && limits[i - 1] !== null && limit > limits[i - 1]! ? (
                  <div className="text-xs text-over">{cs.customPlan.rowTooHigh}</div>
                ) : (
                  teaspoonGrams &&
                  limit !== null &&
                  limit > 0 && <div className="text-xs text-muted">{cs.dose.tspApprox(gramsToTeaspoons(limit, teaspoonGrams))}</div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <NumberStepper
                  compact
                  label={cs.customPlan.rowLabel(formatWeekdayDate(date))}
                  value={limit}
                  onChange={(v) => setDay(i, v)}
                  step={PLAN_STEP_G}
                  min={0}
                  max={MAX_BASELINE_G}
                  suffix="g"
                  invalid={invalid[i]}
                />
              </div>
            </li>
          )
        })}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" className="text-sm" disabled={limits.length >= MAX_CUSTOM_DAYS} onClick={() => appendDays(1)}>
          {cs.customPlan.addDay}
        </Button>
        <Button variant="secondary" className="text-sm" disabled={limits.length >= MAX_CUSTOM_DAYS} onClick={() => appendDays(7)}>
          {cs.customPlan.addWeek}
        </Button>
        <Button
          variant="secondary"
          className="text-sm"
          disabled={limits.length <= MIN_CUSTOM_DAYS}
          onClick={() => onChange(limits.slice(0, -1))}
        >
          {cs.customPlan.removeDay}
        </Button>
        <span className="ml-auto text-sm text-muted">{cs.customPlan.count(limits.length)}</span>
      </div>
      <p className="text-sm text-muted">{cs.customPlan.afterEnd}</p>
    </div>
  )
}
