import { useState, useEffect, useMemo, useRef } from 'react'
import { search } from '../search'

function fmtDate(date) {
  if (!date) return ''
  const d = new Date(date + 'T00:00:00')
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString('en-US', sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', year: 'numeric' })
}

const STATUS_CLASS = { out: 'text-red-400', normal: 'text-amber-400', optimal: 'text-emerald-400' }

// Search across the dashboard: sections, cards, lab groups, lab markers and Apple Health
// metrics. Opened from the sidebar, the mobile top bar, ⌘K / Ctrl+K or "/".
export default function SearchPalette({ index, onSelect, onClose }) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const results = useMemo(() => search(index, query), [index, query])
  const listRef = useRef(null)

  useEffect(() => { setActive(0) }, [query])
  useEffect(() => {
    listRef.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  function onKeyDown(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, results.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); if (results[active]) onSelect(results[active]) }
    else if (e.key === 'Escape') { e.preventDefault(); onClose() }
  }

  return (
    <div className="no-print fixed inset-0 z-[110] flex justify-center items-start p-3 pt-16 md:pt-[12vh]" role="dialog" aria-modal="true" aria-label="Search">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-xl bg-[#131d2e] border border-[#243450] rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-4 border-b border-[#243450]">
          <svg className="w-4 h-4 text-[#475569] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="7" strokeWidth="2" />
            <line x1="16.5" y1="16.5" x2="22" y2="22" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            autoFocus
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search: body, weight, heart rate, HDL…"
            className="flex-1 min-w-0 bg-transparent border-0 rounded-none px-0 py-4 text-[16px] md:text-sm text-white placeholder-[#475569] outline-none focus:shadow-none"
            role="combobox"
            aria-expanded="true"
            aria-controls="search-results"
            aria-activedescendant={results.length ? `search-result-${active}` : undefined}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck="false"
          />
          <button onClick={onClose} className="text-[10px] text-[#475569] hover:text-[#94a3b8] border border-[#243450] rounded px-1.5 py-0.5 shrink-0">esc</button>
        </div>

        <ul id="search-results" ref={listRef} role="listbox" className="max-h-[60vh] overflow-y-auto py-2">
          {results.length === 0 ? (
            <li className="px-4 py-8 text-center text-[#475569] text-sm">Nothing matches “{query}”</li>
          ) : results.map((r, i) => (
            <li
              key={r.id}
              id={`search-result-${i}`}
              data-i={i}
              role="option"
              aria-selected={i === active}
              onMouseMove={() => setActive(i)}
              onClick={() => onSelect(r)}
              className={`mx-2 px-3 py-2 rounded-xl flex items-center gap-3 cursor-pointer ${i === active ? 'bg-[#1a2540]' : ''}`}
            >
              <span className="w-6 text-center text-base shrink-0">{r.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-[#e2e8f0] truncate">
                  {r.label}
                  {r.hidden && <span className="ml-2 text-[10px] text-[#64748b] border border-[#243450] rounded px-1 py-px align-middle">hidden</span>}
                </p>
                {r.where && <p className="text-[11px] text-[#475569] truncate">{r.where}</p>}
              </div>
              {r.value && (
                <div className="text-right shrink-0">
                  <p className={`text-sm font-medium tabular-nums ${STATUS_CLASS[r.value.status] ?? 'text-white'}`}>
                    {r.value.text}
                    {r.value.unit && <span className="text-[#475569] text-xs font-normal ml-1">{r.value.unit}</span>}
                  </p>
                  <p className="text-[10px] text-[#475569]">{fmtDate(r.value.date)}</p>
                </div>
              )}
            </li>
          ))}
        </ul>

        <div className="hidden md:flex gap-4 px-4 py-2 border-t border-[#243450] text-[10px] text-[#475569]">
          <span>↑↓ move</span><span>↵ open</span><span>esc close</span>
          <span className="ml-auto">{query ? `${results.length} result${results.length === 1 ? '' : 's'}` : 'Sections'}</span>
        </div>
      </div>
    </div>
  )
}
