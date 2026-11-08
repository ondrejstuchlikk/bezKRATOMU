import { Area, ComposedChart, Line, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { cs } from '../i18n/cs'
import { useThemeColors } from '../lib/theme'
import { pragueHour, pragueTime } from '../lib/time'

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
  height,
}: {
  data: CaffeineChartPoint[]
  markers: number[]
  now: number
  /** Next bedtime (epoch ms), drawn when inside the chart. */
  bedtime: number | null
  refMg: number
  height: number
}) {
  const c = useThemeColors()
  const first = data[0]?.t ?? now
  const last = data[data.length - 1]?.t ?? now
  // Whole hours 0/6/12/18 (Prague) plus "now"; hour ticks too close to "now" are dropped.
  const ticks: number[] = [now]
  for (let t = Math.ceil(first / HOUR) * HOUR; t <= last; t += HOUR) {
    if (pragueHour(new Date(t)) % 6 === 0 && Math.abs(t - now) > 2 * HOUR) ticks.push(t)
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
          tickFormatter={(t) => (t === now ? cs.caffeineLevel.now : pragueTime(new Date(Number(t))))}
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
          labelFormatter={(t) => pragueTime(new Date(Number(t)))}
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
