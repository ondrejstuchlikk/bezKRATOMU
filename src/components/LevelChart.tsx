import { Area, ComposedChart, Line, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { cs } from '../i18n/cs'
import { useThemeColors } from '../lib/theme'
import { pragueTime } from '../lib/time'

const HOUR = 3_600_000

/** Rounded to 5 %, as the model is only a rough estimate. */
const roundPct = (pct: number) => Math.round(pct / 5) * 5

export interface LevelChartPoint {
  t: number
  past: number | null
  future: number | null
}

/** Chart part of LevelCard, in its own file so Recharts loads lazily. */
export default function LevelChart({
  data,
  markers,
  now,
  showPct,
  height,
}: {
  data: LevelChartPoint[]
  markers: number[]
  now: number
  showPct: boolean
  height: number
}) {
  const c = useThemeColors()
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: showPct ? -4 : 8 }}>
        <XAxis
          dataKey="t"
          type="number"
          scale="time"
          domain={['dataMin', 'dataMax']}
          ticks={[-24, -18, -12, -6, 0, 6, 12].map((h) => now + h * HOUR)}
          tickFormatter={(t) => (t === now ? cs.level.now : pragueTime(new Date(Number(t))))}
          stroke={c.muted}
          fontSize={11}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          hide={!showPct}
          width={48}
          domain={[0, (max: number) => Math.max(showPct ? 100 : 0, Math.ceil(max / 25) * 25)]}
          tickFormatter={(v) => `${v} %`}
          stroke={c.muted}
          fontSize={11}
          tickLine={false}
          axisLine={false}
        />
        {showPct && <ReferenceLine y={100} stroke={c.line} strokeDasharray="3 4" />}
        <ReferenceLine x={now} stroke={c.muted} strokeWidth={1} />
        <Tooltip
          contentStyle={{ background: c.surface, border: `1px solid ${c.line}`, borderRadius: 14, color: c.ink, fontSize: 13 }}
          labelStyle={{ color: c.muted }}
          labelFormatter={(t) => pragueTime(new Date(Number(t)))}
          formatter={(v) => [showPct ? `${roundPct(Number(v))} %` : '', cs.level.tooltipLevel]}
          separator=": "
          filterNull
        />
        <Area
          dataKey="past"
          type="monotone"
          stroke={c.accent}
          strokeWidth={2.5}
          fill={c.accent}
          fillOpacity={0.15}
          connectNulls={false}
          isAnimationActive={false}
        />
        <Line
          dataKey="future"
          type="monotone"
          stroke={c.accent}
          strokeWidth={2}
          strokeDasharray="5 5"
          dot={false}
          connectNulls={false}
          isAnimationActive={false}
        />
        {markers.map((t) => (
          <ReferenceDot key={t} x={t} y={0} r={4} fill={c.accent} stroke={c.surface} strokeWidth={1.5} ifOverflow="visible" />
        ))}
      </ComposedChart>
    </ResponsiveContainer>
  )
}
