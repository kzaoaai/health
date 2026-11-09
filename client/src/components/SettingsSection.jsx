import { useState } from 'react'
import { useUser, useUnits } from '../context/UserContext'
import { UNIT_OPTIONS } from '../unitPrefs'

const CATEGORIES = [
  { id: 'body',      label: 'Body',       icon: '⚖️',  description: 'Weight, BMI, and body composition' },
  { id: 'sleep',     label: 'Sleep',      icon: '🌙',  description: 'Sleep duration and quality' },
  { id: 'exercise',  label: 'Exercise',   icon: '🏃',  description: 'Workouts and activity' },
  { id: 'heartrate', label: 'Heart Rate', icon: '❤️',  description: 'Resting and active heart rate' },
  { id: 'applehealth', label: 'Apple Health', icon: '📈', description: 'Steps, calories and every other metric Apple Health sends' },
  { id: 'labs',      label: 'Labs',       icon: '🧪',  description: 'Blood work and lab results' },
  { id: 'dna',       label: 'DNA',        icon: '🧬',  description: 'Genetic traits and DNA test uploads' },
  { id: 'events',    label: 'Life Events', icon: '📅', description: 'Milestones and logged events' },
  { id: 'protocols', label: 'Protocols',  icon: '📋',  description: 'Supplement and health protocols' },
  { id: 'import',    label: 'Import',     icon: '↑',   description: 'Data import tools' },
]

// Display units, saved on the profile so every device shows the same.
function UnitSettings() {
  const { currentUserId, updateUser } = useUser()
  const units = useUnits()
  const [saving, setSaving] = useState(null)
  const [error, setError] = useState(null)

  async function choose(key, value) {
    if (units[key] === value) return
    setSaving(key)
    setError(null)
    try {
      await updateUser(currentUserId, { units: { [key]: value } })
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="rounded-xl overflow-hidden border border-[#243450] mb-5">
      <div className="px-4 py-2.5 bg-[#0d1520] border-b border-[#243450]">
        <span className="text-[#94a3b8] text-xs font-semibold uppercase tracking-wider">Units</span>
      </div>
      <div className="divide-y divide-[#1e2d42]">
        {UNIT_OPTIONS.map(opt => (
          <div key={opt.key} className="flex items-center justify-between px-5 py-3">
            <p className="text-white text-sm font-medium">{opt.label}</p>
            <div className={`flex items-center gap-1 bg-[#0d1520] border border-[#243450] rounded-lg p-1 ${saving === opt.key ? 'opacity-60' : ''}`}>
              {opt.choices.map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => choose(opt.key, value)}
                  disabled={saving != null}
                  aria-pressed={units[opt.key] === value}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${units[opt.key] === value ? 'bg-[#7c3aed] text-white' : 'text-[#64748b] hover:text-[#94a3b8]'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      {error && <p className="px-5 py-2 text-red-400 text-xs border-t border-[#243450]">{error}</p>}
      <p className="px-5 py-2 text-[#475569] text-[11px] border-t border-[#243450]">Saved on this profile, so your other devices show the same. Values are stored as before and converted for display.</p>
    </div>
  )
}

export default function SettingsSection({ hiddenSections, onToggle }) {
  return (
    <div>
      <UnitSettings />
      <p className="text-[#475569] text-xs mb-4">Choose which sections appear on your dashboard.</p>
      <div className="rounded-xl overflow-hidden border border-[#243450]">
        <div className="px-4 py-2.5 bg-[#0d1520] border-b border-[#243450]">
          <span className="text-[#94a3b8] text-xs font-semibold uppercase tracking-wider">Dashboard sections</span>
        </div>
        <div className="divide-y divide-[#1e2d42]">
          {CATEGORIES.map((cat) => {
            const hidden = hiddenSections.has(cat.id)
            return (
              <div key={cat.id} className="flex items-center justify-between px-5 py-4">
                <div className="flex items-center gap-3">
                  <span className="text-lg">{cat.icon}</span>
                  <div>
                    <p className="text-white text-sm font-medium">{cat.label}</p>
                    <p className="text-[#475569] text-xs mt-0.5">{cat.description}</p>
                  </div>
                </div>
                <button
                  onClick={() => onToggle(cat.id)}
                  className={`relative w-10 h-5.5 rounded-full transition-colors duration-200 flex-shrink-0 ${
                    hidden ? 'bg-[#1e2d42]' : 'bg-[#7c3aed]'
                  }`}
                  style={{ height: 22, width: 40 }}
                  aria-pressed={!hidden}
                >
                  <span
                    className="absolute top-0.5 left-0.5 w-[18px] h-[18px] bg-white rounded-full shadow transition-transform duration-200"
                    style={{ transform: hidden ? 'translateX(0)' : 'translateX(18px)' }}
                  />
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
