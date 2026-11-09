import { useState, useMemo } from 'react'
import RawDataModal from './RawDataModal'
import { metricAnchor } from '../sections'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ReferenceArea, ResponsiveContainer,
} from 'recharts'

const BRADYCARDIA_THRESHOLD = 40
const Y_MIN = 35

const RANGES = [
  { label: '1W',  days: 7    },
  { label: '1M',  days: 30   },
  { label: '3M',  days: 90   },
  { label: '6M',  days: 180  },
  { label: '1Y',  days: 365  },
  { label: 'All', days: null },
]

const COLOR = '#f43f5e'
const HRV_COLOR = '#a78bfa'
const AVG_COLOR = '#fb923c'

function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Up to six months stay daily; a year is averaged by week and the whole history (years
// of Apple Watch readings) by month.
function bucketOf(days) {
  if (days != null && days <= 180) return 'day'
  return days != null ? 'week' : 'month'
}

function bucketStart(date, bucket) {
  if (bucket === 'day') return date
  if (bucket === 'month') return date.slice(0, 7) + '-01'
  const d = new Date(date + 'T00:00:00')
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))  // back to Monday
  return ymd(d)
}

// One point per bucket with the mean of `key`, oldest first.
function seriesFor(entries, key, bucket) {
  const sums = new Map()
  for (const e of entries) {
    if (e[key] == null) continue
    const b = bucketStart(e.date, bucket)
    const acc = sums.get(b) ?? { total: 0, n: 0 }
    acc.total += e[key]
    acc.n++
    sums.set(b, acc)
  }
  return [...sums.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { total, n }]) => ({ date, [key]: Math.round((total / n) * 10) / 10 }))
}

function bucketLabel(date, bucket) {
  const d = new Date(date + 'T00:00:00')
  if (bucket === 'month') return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const s = d.toLocaleDateString('en-US', { weekday: bucket === 'day' ? 'long' : undefined, month: 'long', day: 'numeric', year: 'numeric' })
  return bucket === 'week' ? `Week of ${s}` : s
}

function filterByRange(entries, days) {
  if (days == null) return entries
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)
  return entries.filter(e => new Date(e.date + 'T00:00:00') >= cutoff)
}

function avg(entries, key) {
  const vals = entries.map(e => e[key]).filter(v => v != null)
  if (!vals.length) return null
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
}

function rhrColor(bpm) {
  if (bpm == null) return COLOR
  if (bpm < BRADYCARDIA_THRESHOLD) return '#f59e0b'
  if (bpm < 60) return '#34d399'
  if (bpm <= 75) return COLOR
  return '#f59e0b'
}

function formatTick(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00')
  // "Nov '25", not "Nov 25", which reads as a day.
  if (days == null) return `${d.toLocaleDateString('en-US', { month: 'short' })} '${String(d.getFullYear()).slice(2)}`
  if (days <= 7)  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  if (days <= 30) return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  if (days <= 90) return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${d.toLocaleDateString('en-US', { month: 'short' })} '${String(d.getFullYear()).slice(2)}`
}

function StatCard({ label, value, unit = 'bpm', sublabel, color: fixedColor }) {
  const color = fixedColor ?? rhrColor(value)
  return (
    <div className="bg-[#131d2e] border border-[#243450] rounded-2xl p-5 flex flex-col gap-2">
      <span className="text-[#475569] text-xs font-medium uppercase tracking-wider">{label}</span>
      <div className="flex items-end gap-1.5">
        <span className="text-3xl font-bold" style={{ color: value != null ? color : '#374d6c' }}>
          {value ?? '—'}
        </span>
        {value != null && <span className="text-[#475569] text-sm mb-0.5">{unit}</span>}
      </div>
      {sublabel && <span className="text-[#475569] text-xs">{sublabel}</span>}
    </div>
  )
}

function ValueTooltip({ active, payload, dataKey, unit, bucket }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  if (!d || d[dataKey] == null) return null
  return (
    <div className="bg-[#131d2e] border border-[#243450] rounded-xl px-4 py-3 shadow-2xl">
      <p className="text-[#64748b] text-xs mb-1">{bucketLabel(d.date, bucket)}</p>
      <p className="text-white text-xl font-semibold">
        {Math.round(d[dataKey])} <span className="text-[#64748b] text-sm font-normal">{unit}</span>
      </p>
      {bucket !== 'day' && <p className="text-[#475569] text-[10px] mt-0.5">{bucket === 'week' ? 'weekly' : 'monthly'} average</p>}
    </div>
  )
}

// A smaller chart for HRV and the day's average heart rate.
function TrendCard({ id, title, subtitle, dataKey, unit, color, series, bucket, activeDays, rangeKey, empty }) {
  const vals = series.map(e => e[dataKey])
  const latest = series[series.length - 1]?.[dataKey]
  const first = series[0]?.[dataKey]
  const yMin = vals.length ? Math.max(0, Math.floor(Math.min(...vals) - 5)) : 0
  const yMax = vals.length ? Math.ceil(Math.max(...vals) + 5) : 100
  return (
    <div id={id} className="bg-[#131d2e] border border-[#243450] rounded-2xl p-6 min-w-0">
      <p className="text-white text-sm font-medium">{title}</p>
      <p className="text-[#475569] text-xs mt-0.5 mb-4">{subtitle}</p>
      {series.length === 0 ? (
        <div className="flex items-center justify-center h-40 text-[#374d6c] text-sm">{empty}</div>
      ) : (
        <>
          <div className="flex items-end gap-2 mb-4">
            <span className="text-3xl font-bold text-white">{Math.round(latest)}</span>
            <span className="text-[#475569] text-sm mb-0.5">{unit}</span>
            {series.length > 1 && Math.round(latest - first) !== 0 && (
              <span className="text-[#64748b] text-xs mb-1 font-medium ml-1">
                {latest > first ? '↑' : '↓'} {Math.abs(Math.round(latest - first))} over this range
              </span>
            )}
          </div>
          <ResponsiveContainer width="100%" height={160} key={rangeKey}>
            <AreaChart data={series} margin={{ top: 8, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id={`${dataKey}Gradient`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#243450" vertical={false} />
              <XAxis dataKey="date" tickFormatter={d => formatTick(d, activeDays)} tick={{ fill: '#475569', fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={24} />
              <YAxis domain={[yMin, yMax]} tick={{ fill: '#475569', fontSize: 11 }} axisLine={false} tickLine={false} tickCount={4} />
              <Tooltip content={<ValueTooltip dataKey={dataKey} unit={unit} bucket={bucket} />} />
              <Area type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} fill={`url(#${dataKey}Gradient)`} isAnimationActive={false}
                dot={series.length <= 60 ? { r: 2.5, fill: color, strokeWidth: 0 } : false}
                activeDot={{ r: 4, fill: color, stroke: '#0d1520', strokeWidth: 2 }} />
            </AreaChart>
          </ResponsiveContainer>
        </>
      )}
    </div>
  )
}

export default function HeartRateSection({ data }) {
  const [range, setRange] = useState('1M')
  const [showRaw, setShowRaw] = useState(false)
  const activeDays = RANGES.find(r => r.label === range)?.days

  const bucket = bucketOf(activeDays)

  const entries = data?.entries ?? []
  const withRhr = useMemo(() => entries.filter(e => e.resting_heart_rate != null), [entries])
  const withHrv = useMemo(() => entries.filter(e => e.hrv != null), [entries])
  const withAvg = useMemo(() => entries.filter(e => e.heart_rate != null), [entries])

  const inRange = useMemo(() => filterByRange(entries, activeDays), [entries, activeDays])
  const filtered = useMemo(() => seriesFor(inRange, 'resting_heart_rate', bucket), [inRange, bucket])
  const hrvSeries = useMemo(() => seriesFor(inRange, 'hrv', bucket), [inRange, bucket])
  const avgSeries = useMemo(() => seriesFor(inRange, 'heart_rate', bucket), [inRange, bucket])

  const latest = withRhr[withRhr.length - 1]
  const avg30  = avg(filterByRange(withRhr, 30), 'resting_heart_rate')
  const latestHrv = withHrv[withHrv.length - 1]
  const hrv30 = avg(filterByRange(withHrv, 30), 'hrv')
  const latestAvg = withAvg[withAvg.length - 1]
  const dayAvg30 = avg(filterByRange(withAvg, 30), 'heart_rate')
  const shortDate = e => new Date(e.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

  const yMin = useMemo(() => {
    if (!filtered.length) return Y_MIN
    return Math.min(Y_MIN, Math.floor(Math.min(...filtered.map(e => e.resting_heart_rate)) - 5))
  }, [filtered])

  const yMax = useMemo(() => {
    if (!filtered.length) return 100
    return Math.ceil(Math.max(...filtered.map(e => e.resting_heart_rate)) + 5)
  }, [filtered])

  const showDots = filtered.length <= 60

  return (
    <section id="heartrate" className="mb-16">
      <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-1 h-6 rounded-full" style={{ background: COLOR }} />
          <h2 className="text-white text-xl font-semibold">Heart Rate</h2>
          <button onClick={() => setShowRaw(true)} className="font-mono text-[10px] text-[#243450] hover:text-[#475569] px-1 transition-colors" title="raw data">{'{}'}</button>
        </div>
        <div className="flex items-center gap-1 bg-[#0d1520] border border-[#243450] rounded-lg p-1">
          {RANGES.map(r => (
            <button
              key={r.label}
              onClick={() => setRange(r.label)}
              className={`px-2.5 sm:px-3 py-1 rounded-md text-xs font-medium transition-all ${
                range === r.label
                  ? 'text-white shadow'
                  : 'text-[#64748b] hover:text-[#94a3b8]'
              }`}
              style={range === r.label ? { background: COLOR } : {}}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stat cards: the newest reading of each, against its 30-day average (HRV and the day
          average only when there is any) */}
      <div className={`grid grid-cols-1 ${['', 'sm:grid-cols-1', 'sm:grid-cols-2', 'sm:grid-cols-3'][1 + (withHrv.length > 0) + (withAvg.length > 0)]} gap-4 mb-4`}>
        <StatCard
          label="Resting"
          value={latest?.resting_heart_rate != null ? Math.round(latest.resting_heart_rate) : null}
          sublabel={latest ? `${shortDate(latest)}${avg30 != null ? ` · 30-day avg ${avg30}` : ''}` : 'No data yet'}
        />
        {withHrv.length > 0 && <StatCard
          label="HRV"
          unit="ms"
          color={HRV_COLOR}
          value={latestHrv ? Math.round(latestHrv.hrv) : null}
          sublabel={`${shortDate(latestHrv)}${hrv30 != null ? ` · 30-day avg ${hrv30}` : ''}`}
        />}
        {withAvg.length > 0 && <StatCard
          label="Day Average"
          color={AVG_COLOR}
          value={latestAvg ? Math.round(latestAvg.heart_rate) : null}
          sublabel={`${shortDate(latestAvg)}${dayAvg30 != null ? ` · 30-day avg ${dayAvg30}` : ''}`}
        />}
      </div>

      {/* Chart */}
      <div id={metricAnchor('heartrate', 'resting_heart_rate')} className="bg-[#131d2e] border border-[#243450] rounded-2xl p-6">
        <div className="mb-6">
          <p className="text-white text-sm font-medium">Resting Heart Rate</p>
          <p className="text-[#475569] text-xs mt-0.5">bpm over time{bucket !== 'day' ? `, ${bucket === 'week' ? 'weekly' : 'monthly'} averages` : ''}</p>
        </div>

        {filtered.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-[#374d6c] text-sm">
            No resting heart rate data — sync Apple Health to populate
          </div>
        ) : (
          <>
            <div className="flex items-end gap-3 mb-6">
              <span className="text-4xl font-bold text-white">
                {Math.round(filtered[filtered.length - 1].resting_heart_rate)}
              </span>
              <span className="text-[#475569] text-sm mb-1">bpm</span>
              {filtered.length > 1 && (() => {
                const delta = Math.round(filtered[filtered.length - 1].resting_heart_rate - filtered[0].resting_heart_rate)
                const isDown = delta < 0
                return (
                  <span className={`text-sm mb-1 font-medium ${isDown ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {isDown ? '↓' : '↑'} {Math.abs(delta)} bpm
                  </span>
                )
              })()}
            </div>

            {/* key forces Recharts to remount the chart when range changes, so Y-axis domain updates correctly */}
            <ResponsiveContainer width="100%" height={220} key={range}>
              <AreaChart data={filtered} margin={{ top: 8, right: 4, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="rhrGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={COLOR} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={COLOR} stopOpacity={0} />
                  </linearGradient>
                </defs>

                <CartesianGrid strokeDasharray="3 3" stroke="#243450" vertical={false} />

                <XAxis
                  dataKey="date"
                  tickFormatter={(d) => formatTick(d, activeDays)}
                  tick={{ fill: '#475569', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                />

                <YAxis
                  domain={[yMin, yMax]}
                  tick={{ fill: '#475569', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickCount={5}
                  tickFormatter={v => `${v}`}
                />

                <Tooltip content={<ValueTooltip dataKey="resting_heart_rate" unit="bpm" bucket={bucket} />} />

                <ReferenceArea y1={Y_MIN} y2={BRADYCARDIA_THRESHOLD} fill="#f59e0b" fillOpacity={0.07} stroke="none" />
                <ReferenceLine y={BRADYCARDIA_THRESHOLD} stroke="#f59e0b" strokeDasharray="4 4" strokeOpacity={0.5} strokeWidth={1} label={{ value: 'Bradycardia', position: 'insideTopLeft', fill: '#f59e0b', fontSize: 10, opacity: 0.7 }} />

                <Area
                  type="monotone"
                  dataKey="resting_heart_rate"
                  stroke={COLOR}
                  strokeWidth={2}
                  fill="url(#rhrGradient)"
                  isAnimationActive={false}
                  dot={showDots ? { r: 3, fill: COLOR, strokeWidth: 0 } : false}
                  activeDot={{ r: 5, fill: COLOR, stroke: '#0d1520', strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>

          </>
        )}
      </div>

      {(withHrv.length > 0 || withAvg.length > 0) && (
      <div className={`grid grid-cols-1 ${withHrv.length > 0 && withAvg.length > 0 ? 'lg:grid-cols-2' : ''} gap-4 mt-4`}>
        {withHrv.length > 0 && <TrendCard
          id={metricAnchor('heartrate', 'hrv')}
          title="Heart Rate Variability"
          subtitle={`SDNN in ms, higher is generally better${bucket !== 'day' ? `; ${bucket === 'week' ? 'weekly' : 'monthly'} averages` : ''}`}
          dataKey="hrv" unit="ms" color={HRV_COLOR}
          series={hrvSeries} bucket={bucket} activeDays={activeDays} rangeKey={range}
          empty="No HRV data in this range"
        />}
        {withAvg.length > 0 && <TrendCard
          id={metricAnchor('heartrate', 'heart_rate')}
          title="Day Average"
          subtitle={`Mean of the day's readings in bpm, workouts included${bucket !== 'day' ? `; ${bucket === 'week' ? 'weekly' : 'monthly'} averages` : ''}`}
          dataKey="heart_rate" unit="bpm" color={AVG_COLOR}
          series={avgSeries} bucket={bucket} activeDays={activeDays} rangeKey={range}
          empty="No heart rate data in this range"
        />}
      </div>
      )}
      {showRaw && <RawDataModal label="heart rate" data={data} onClose={() => setShowRaw(false)} />}
    </section>
  )
}
