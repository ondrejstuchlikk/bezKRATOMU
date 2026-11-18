import { Area, ComposedChart, Line, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { cs } from '../i18n/cs'
import { useThemeColors } from '../lib/theme'
import { formatWeekday, pragueDate, pragueHour, pragueTime } from '../lib/time'

const HOUR = 3_600_000

export interface CaffeineChartPoint {
  t: number
  past: number | null
  future: number | null
}

/** Chart part of CaffeineLevelCard, in its own file so Recharts loads lazily. */
export default function CaffeineChart({
  data,
  markers,
  now,
  bedtime,
  refMg,
  pastH,
  height,
}: {
  data: CaffeineChartPoint[]
  markers: number[]
  now: number
  /** Next bedtime (epoch ms), drawn when inside the chart. */
  bedtime: number | null
  refMg: number
  /** Hours of history shown (12, 24, 48 or 3/5/7 days). */
  pastH: number
  height: number
}) {
  const c = useThemeColors()
  const first = data[0]?.t ?? now
  const last = data[data.length - 1]?.t ?? now
  // "Now" plus whole Prague hours every 6 h (12 or 24 h of history; the projection adds 8+ h), 12 h (48 h) or
  // midnights labelled with the weekday (3+ days); ticks too close to "now" are dropped.
  const multiDay = pastH > 48
  const step = pastH <= 24 ? 6 : pastH <= 48 ? 12 : 24
  const ticks: number[] = [now]
  for (let t = Math.ceil(first / HOUR) * HOUR; t <= last; t += HOUR) {
    if (pragueHour(new Date(t)) % step === 0 && Math.abs(t - now) > (step / 3) * HOUR) ticks.push(t)
  }
  ticks.sort((a, b) => a - b)
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -6 }}>
        <XAxis
          dataKey="t"
          type="number"
          scale="time"
          domain={['dataMin', 'dataMax']}
          ticks={ticks}
          tickFormatter={(t) => (t === now ? cs.caffeineLevel.now : multiDay ? formatWeekday(pragueDate(new Date(Number(t)))) : pragueTime(new Date(Number(t))))}
          stroke={c.muted}
          fontSize={11}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          width={36}
          domain={[0, (max: number) => Math.max(Math.ceil(refMg * 1.5), Math.ceil(max / 25) * 25)]}
          tickFormatter={(v) => `${v}`}
          stroke={c.muted}
          fontSize={11}
          tickLine={false}
          axisLine={false}
        />
        <ReferenceLine y={refMg} stroke={c.warn} strokeDasharray="4 4" />
        <ReferenceLine x={now} stroke={c.muted} strokeWidth={1} />
        {bedtime !== null && bedtime <= last && <ReferenceLine x={bedtime} stroke={c.muted} strokeDasharray="2 3" label={{ value: '🌙', position: 'insideTop', fontSize: 12 }} />}
        <Tooltip
          contentStyle={{ background: c.surface, border: `1px solid ${c.line}`, borderRadius: 14, color: c.ink, fontSize: 13 }}
          labelStyle={{ color: c.muted }}
          labelFormatter={(t) => (multiDay ? `${formatWeekday(pragueDate(new Date(Number(t))))} ` : '') + pragueTime(new Date(Number(t)))}
          formatter={(v) => [`${Math.round(Number(v))} mg`, cs.caffeineLevel.tooltip]}
          separator=": "
          filterNull
        />
        <Area dataKey="past" type="monotone" stroke={c.accent} strokeWidth={2.5} fill={c.accent} fillOpacity={0.15} connectNulls={false} isAnimationActive={false} />
        <Line dataKey="future" type="monotone" stroke={c.accent} strokeWidth={2} strokeDasharray="5 5" dot={false} connectNulls={false} isAnimationActive={false} />
        {markers.map((t) => (
          <ReferenceDot key={t} x={t} y={0} r={4} fill={c.accent} stroke={c.surface} strokeWidth={1.5} ifOverflow="visible" />
        ))}
      </ComposedChart>
    </ResponsiveContainer>
  )
}
