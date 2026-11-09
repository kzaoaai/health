import { useState, useMemo } from 'react'
import RawDataModal from './RawDataModal'
import { markerTitle } from '../markers'
import { metricAnchor } from '../sections'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

// Every Apple Health metric that no other section charts: steps, calories, walking
// metrics, VO2 max, audio exposure and whatever else Health Auto Export sends. The list is
// open-ended, so each metric gets the same small card, newest data first.

const COLOR = '#38bdf8'
const SKIP_KEYS = new Set(['date', 'source', 'notes'])

const RANGES = [
  { label: '1M',  days: 30   },
  { label: '3M',  days: 90   },
  { label: '1Y',  days: 365  },
  { label: 'All', days: null },
]

const toTitle = markerTitle

function fmtValue(v) {
  if (v == null || isNaN(v)) return '—'
  const a = Math.abs(v)
  if (a >= 1000) return Math.round(v).toLocaleString('en-US')
  if (a >= 100) return String(Math.round(v))
  if (a >= 10) return v.toFixed(1)
  return String(Math.round(v * 100) / 100)
}

function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function fmtDate(date, bucket) {
  const d = new Date(date + 'T00:00:00')
  if (bucket === 'month') return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
  const s = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  return bucket === 'week' ? `Week of ${s}` : s
}

// Up to three months stay daily. A year is averaged by week and the whole history by
// month, so several dozen small charts don't each draw thousands of points.
function bucketOf(days) {
  if (days != null && days <= 90) return 'day'
  return days != null ? 'week' : 'month'
}

function bucketStart(date, bucket) {
  if (bucket === 'day') return date
  if (bucket === 'month') return date.slice(0, 7) + '-01'
  const d = new Date(date + 'T00:00:00')
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))  // back to Monday
  return ymd(d)
}

function seriesFor(entries, key, cutoff, bucket) {
  const sums = new Map()
  for (const e of entries) {
    if (e[key] == null || (cutoff && e.date < cutoff)) continue
    const b = bucketStart(e.date, bucket)
    const acc = sums.get(b) ?? { total: 0, n: 0 }
    acc.total += e[key]
    acc.n++
    sums.set(b, acc)
  }
  return [...sums.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { total, n }]) => ({ date, value: total / n }))
}

function MiniTooltip({ active, payload, bucket }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  if (!d) return null
  return (
    <div className="bg-[#131d2e] border border-[#243450] rounded-lg px-3 py-2 shadow-2xl">
      <p className="text-[#64748b] text-[11px]">{fmtDate(d.date, bucket)}{bucket !== 'day' ? ' · average' : ''}</p>
      <p className="text-white text-sm font-semibold tabular-nums">{fmtValue(d.value)}</p>
    </div>
  )
}

function MetricCard({ metric, series, bucket }) {
  return (
    <div id={metricAnchor('applehealth', metric.key)} className="bg-[#131d2e] border border-[#243450] rounded-2xl p-4 min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[#94a3b8] text-xs font-medium truncate" title={metric.key}>{toTitle(metric.key)}</p>
        <p className="text-[#475569] text-[10px] shrink-0">{fmtDate(metric.latest.date, 'day')}</p>
      </div>
      <p className="text-white text-xl font-semibold mt-1 tabular-nums">{fmtValue(metric.latest.value)}</p>
      {series.length > 1 ? (
        <ResponsiveContainer width="100%" height={64}>
          <AreaChart data={series} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
            <XAxis dataKey="date" hide />
            <YAxis hide domain={['auto', 'auto']} />
            <Tooltip content={<MiniTooltip bucket={bucket} />} />
            <Area type="monotone" dataKey="value" stroke={COLOR} fill={COLOR} fillOpacity={0.12} strokeWidth={1.5} dot={false} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <p className="h-16 flex items-center text-[#374d6c] text-xs">
          {series.length === 1 ? `One reading in this range: ${fmtValue(series[0].value)}` : 'No data in this range'}
        </p>
      )}
    </div>
  )
}

export default function AppleHealthSection({ data }) {
  const [range, setRange] = useState('3M')
  const [showRaw, setShowRaw] = useState(false)
  const entries = data?.entries ?? []
  const days = RANGES.find(r => r.label === range)?.days ?? null
  const bucket = bucketOf(days)

  // One entry per metric with its newest reading; metrics with recent data come first,
  // so ones a device stopped recording years ago sink to the end.
  const metrics = useMemo(() => {
    const latest = new Map()
    for (const e of entries) {
      for (const [k, v] of Object.entries(e)) {
        if (SKIP_KEYS.has(k) || v == null) continue
        latest.set(k, { date: e.date, value: v })  // entries are date-ascending
      }
    }
    return [...latest.entries()]
      .map(([key, l]) => ({ key, latest: l }))
      .sort((a, b) => b.latest.date.localeCompare(a.latest.date) || a.key.localeCompare(b.key))
  }, [entries])

  const seriesByKey = useMemo(() => {
    let cutoff = null
    if (days != null) {
      const c = new Date()
      c.setDate(c.getDate() - days)
      cutoff = ymd(c)
    }
    return Object.fromEntries(metrics.map(m => [m.key, seriesFor(entries, m.key, cutoff, bucket)]))
  }, [entries, metrics, days, bucket])

  return (
    <section id="applehealth" className="mb-16">
      <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-1 h-6 rounded-full" style={{ background: COLOR }} />
          <h2 className="text-white text-xl font-semibold">Apple Health</h2>
          <button onClick={() => setShowRaw(true)} className="font-mono text-[10px] text-[#243450] hover:text-[#475569] px-1 transition-colors" title="raw data">{'{}'}</button>
        </div>
        {metrics.length > 0 && (
          <div className="flex items-center gap-1 bg-[#0d1520] border border-[#243450] rounded-lg p-1">
            {RANGES.map(r => (
              <button
                key={r.label}
                onClick={() => setRange(r.label)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                  range === r.label ? 'text-white shadow' : 'text-[#64748b] hover:text-[#94a3b8]'
                }`}
                style={range === r.label ? { background: COLOR } : {}}
              >
                {r.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <p className="text-[#475569] text-xs mb-6">
        Everything else Apple Health sends, one value per day. {bucket === 'week' ? 'Charts show weekly averages.' : bucket === 'month' ? 'Charts show monthly averages.' : ''}
      </p>

      {metrics.length === 0 ? (
        <div className="bg-[#131d2e] border border-[#243450] rounded-2xl p-6 text-[#374d6c] text-sm">
          Nothing yet. Metrics Health Auto Export sends beyond the sections above appear here.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {metrics.map(m => (
            <MetricCard key={m.key} metric={m} series={seriesByKey[m.key] ?? []} bucket={bucket} />
          ))}
        </div>
      )}

      {showRaw && <RawDataModal label="apple health" data={data} onClose={() => setShowRaw(false)} />}
    </section>
  )
}
