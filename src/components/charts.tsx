import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { DayResult, Dose } from '../api'
import { cs } from '../i18n/cs'
import { formatShortDate, pragueHour, type ISODate } from '../lib/time'
import { formatGrams, formatNumber } from '../lib/units'
import { useThemeColors } from '../lib/theme'

const HEIGHT = 220

function useChartStyle() {
  const c = useThemeColors()
  return {
    c,
    axis: { stroke: c.muted, fontSize: 11, tickLine: false, axisLine: false } as const,
    grid: <CartesianGrid stroke={c.line} strokeDasharray="3 4" vertical={false} />,
    tooltip: {
      contentStyle: {
        background: c.surface,
        border: `1px solid ${c.line}`,
        borderRadius: 14,
        color: c.ink,
        fontSize: 13,
      },
      labelStyle: { color: c.muted },
      cursor: { fill: c.line, opacity: 0.4 },
    },
  }
}

export function ChartEmpty() {
  return <div className="flex h-40 items-center justify-center text-sm text-muted">{cs.chart.noData}</div>
}

/** Wizard preview: the generated daily limits. */
export function PlanPreviewChart({ limits }: { limits: number[] }) {
  const { c, axis, grid, tooltip } = useChartStyle()
  const data = limits.map((limit, i) => ({ day: i + 1, limit }))
  return (
    <ResponsiveContainer width="100%" height={180}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
        {grid}
        <XAxis dataKey="day" {...axis} interval="preserveStartEnd" minTickGap={24} />
        <YAxis {...axis} width={44} tickFormatter={(v) => formatNumber(Number(v))} />
        <Tooltip
          {...tooltip}
          labelFormatter={(d) => `${cs.wizard.dayAxis} ${d}`}
          formatter={(v) => [formatGrams(Number(v)), cs.chart.plan]}
        />
        <Area
          type="stepAfter"
          dataKey="limit"
          stroke={c.accent}
          strokeWidth={2.5}
          fill={c.accent}
          fillOpacity={0.15}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

function pausedRanges(days: DayResult[]): { from: ISODate; to: ISODate }[] {
  const ranges: { from: ISODate; to: ISODate }[] = []
  for (const d of days) {
    if (!d.isPaused) continue
    const last = ranges[ranges.length - 1]
    const prevIndex = days.indexOf(d) - 1
    if (last && prevIndex >= 0 && days[prevIndex].isPaused && last.to === days[prevIndex].date) last.to = d.date
    else ranges.push({ from: d.date, to: d.date })
  }
  return ranges
}

/** Plan (step line) vs. actual intake (bars), paused periods shaded. */
export function PlanVsActualChart({ days, unit }: { days: DayResult[]; unit: 'g' | 'pct' }) {
  const { c, axis, grid, tooltip } = useChartStyle()
  if (!days.length) return <ChartEmpty />
  const data = days.map((d) => ({
    date: d.date,
    plan: unit === 'g' ? d.limitG : d.planPct,
    actual: unit === 'g' ? d.totalG : d.actualPct,
    status: d.status,
    logged: d.logged,
  }))
  const suffix = unit === 'g' ? ' g' : ' %'
  return (
    <ResponsiveContainer width="100%" height={HEIGHT}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
        {grid}
        {pausedRanges(days).map((r) => (
          <ReferenceArea key={r.from} x1={r.from} x2={r.to} fill={c.warn} fillOpacity={0.12} ifOverflow="extendDomain" />
        ))}
        <XAxis dataKey="date" {...axis} tickFormatter={formatShortDate} minTickGap={20} />
        <YAxis {...axis} width={44} />
        <Tooltip
          {...tooltip}
          labelFormatter={(d) => formatShortDate(String(d))}
          formatter={(v, name) => [
            v === null || v === undefined ? '–' : `${formatNumber(Number(v))}${suffix}`,
            name === 'plan' ? cs.chart.plan : cs.chart.actual,
          ]}
        />
        <Bar dataKey="actual" radius={[6, 6, 0, 0]} maxBarSize={18} isAnimationActive={false}>
          {data.map((d) => (
            <Cell key={d.date} fill={d.status === 'over' ? c.over : c.accent} fillOpacity={d.status === 'over' ? 0.85 : 0.55} />
          ))}
        </Bar>
        <Line
          type="stepAfter"
          dataKey="plan"
          stroke={c.ink}
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

/** Number of doses by hour of day (Prague time). */
export function TimeOfDayChart({ doses }: { doses: Dose[] }) {
  const { c, axis, grid, tooltip } = useChartStyle()
  if (!doses.length) return <ChartEmpty />
  const counts = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }))
  for (const d of doses) counts[pragueHour(new Date(d.takenAt))].count++
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={counts} margin={{ top: 8, right: 8, bottom: 0, left: -24 }}>
        {grid}
        <XAxis dataKey="hour" {...axis} ticks={[0, 6, 12, 18, 23]} tickFormatter={(h) => `${h}h`} />
        <YAxis {...axis} width={44} />
        <Tooltip {...tooltip} labelFormatter={(h) => `${h}:00–${h}:59`} formatter={(v) => [v, cs.chart.timeOfDayHint]} />
        <Bar dataKey="count" fill={c.accent} radius={[4, 4, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  )
}

/** Daily intake next to the average feeling of that day. */
export function FeelingsChart({ days, doses, unit }: { days: DayResult[]; doses: Dose[]; unit: 'g' | 'pct' }) {
  const { c, axis, grid, tooltip } = useChartStyle()
  const byDate = new Map<string, number[]>()
  for (const d of doses) if (d.feeling) byDate.set(d.localDate, [...(byDate.get(d.localDate) ?? []), d.feeling])
  if (!byDate.size) return <ChartEmpty />
  const data = days.map((d) => {
    const f = byDate.get(d.date)
    return {
      date: d.date,
      intake: unit === 'g' ? d.totalG : d.actualPct,
      feeling: f ? Math.round((f.reduce((a, b) => a + b, 0) / f.length) * 10) / 10 : null,
    }
  })
  return (
    <ResponsiveContainer width="100%" height={HEIGHT}>
      <ComposedChart data={data} margin={{ top: 8, right: -8, bottom: 0, left: -18 }}>
        {grid}
        <XAxis dataKey="date" {...axis} tickFormatter={formatShortDate} minTickGap={20} />
        <YAxis yAxisId="g" {...axis} width={44} />
        <YAxis
          yAxisId="f"
          orientation="right"
          {...axis}
          domain={[1, 5]}
          ticks={[1, 2, 3, 4, 5]}
          width={36}
          tickFormatter={(v) => cs.feelings[v - 1]?.emoji ?? ''}
        />
        <Tooltip
          {...tooltip}
          labelFormatter={(d) => formatShortDate(String(d))}
          formatter={(v, name) =>
            name === 'feeling'
              ? [v === null ? '–' : `${formatNumber(Number(v))} ${cs.feelings[Math.round(Number(v)) - 1]?.emoji ?? ''}`, cs.chart.feelingAvg]
              : [v === null ? '–' : `${formatNumber(Number(v))}${unit === 'g' ? ' g' : ' %'}`, cs.chart.actual]
          }
        />
        <Bar yAxisId="g" dataKey="intake" fill={c.accent} fillOpacity={0.35} radius={[6, 6, 0, 0]} maxBarSize={18} isAnimationActive={false} />
        <Line
          yAxisId="f"
          dataKey="feeling"
          stroke={c.warn}
          strokeWidth={2.5}
          dot={{ r: 3, fill: c.warn }}
          connectNulls
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

/** Cumulative points over time. */
export function PointsChart({ days }: { days: DayResult[] }) {
  const { c, axis, grid, tooltip } = useChartStyle()
  if (!days.length) return <ChartEmpty />
  const data: { date: string; total: number }[] = []
  for (const d of days) data.push({ date: d.date, total: (data[data.length - 1]?.total ?? 0) + d.points })
  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
        {grid}
        <XAxis dataKey="date" {...axis} tickFormatter={formatShortDate} minTickGap={20} />
        <YAxis {...axis} width={44} />
        <Tooltip {...tooltip} labelFormatter={(d) => formatShortDate(String(d))} formatter={(v) => [v, cs.chart.cumulative]} />
        <Line type="monotone" dataKey="total" stroke={c.accent} strokeWidth={2.5} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}
