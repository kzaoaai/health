// Display units. Values are stored the way they always were (body masses in lbs, distance
// in miles, body temperature in °F, sleeping wrist temperature in °C); each profile picks
// what it sees, and the dashboard converts on the way to the screen and back from forms.

export const DEFAULT_UNITS = { weight: 'lbs', distance: 'mi', temperature: 'f', height: 'in' }

export const UNIT_OPTIONS = [
  { key: 'weight',      label: 'Weight',      choices: [['kg', 'kg'], ['lbs', 'lbs']] },
  { key: 'distance',    label: 'Distance',    choices: [['km', 'km'], ['mi', 'mi']] },
  { key: 'temperature', label: 'Temperature', choices: [['c', '°C'], ['f', '°F']] },
  { key: 'height',      label: 'Height',      choices: [['cm', 'cm'], ['in', 'ft / in']] },
]

export function unitsOf(user) {
  return { ...DEFAULT_UNITS, ...(user?.units ?? {}) }
}

const LB_KG = 0.45359237
const MI_KM = 1.609344
const round = (x, d = 1) => Math.round(x * 10 ** d) / 10 ** d

// Metrics stored in lbs.
export const MASS_KEYS = new Set(['weight', 'skeletal_muscle_mass', 'body_fat_mass', 'lean_mass'])

// How a stored metric is shown under these units: { value, unit }, or null for a metric
// with no unit choice (its value is shown as stored).
export function displayMetric(key, value, units) {
  if (value == null) return null
  if (MASS_KEYS.has(key)) {
    return units.weight === 'kg' ? { value: round(value * LB_KG), unit: 'kg' } : { value, unit: 'lbs' }
  }
  if (key === 'distance_miles') {
    return units.distance === 'km' ? { value: round(value * MI_KM, 2), unit: 'km' } : { value, unit: 'mi' }
  }
  if (key === 'body_temp_f') {
    return units.temperature === 'c' ? { value: round((value - 32) * 5 / 9, 2), unit: '°C' } : { value, unit: '°F' }
  }
  if (key === 'wrist_temp_c') {
    return units.temperature === 'f' ? { value: round(value * 9 / 5 + 32, 2), unit: '°F' } : { value, unit: '°C' }
  }
  return null
}

// The unit a metric is shown in, or null when it has no unit choice.
export function displayUnit(key, units) {
  return displayMetric(key, 0, units)?.unit ?? null
}

// Every row of a section's entries with its converted metrics, so charts, deltas and
// averages all work in the shown unit.
export function convertEntries(entries, units) {
  return (entries ?? []).map(e => {
    let out = e
    for (const k of Object.keys(e)) {
      const d = typeof e[k] === 'number' ? displayMetric(k, e[k], units) : null
      if (d && d.value !== e[k]) {
        if (out === e) out = { ...e }
        out[k] = d.value
      }
    }
    return out
  })
}

// A mass typed into a form, back to the lbs it is stored in.
export function massToLbs(value, units) {
  return units.weight === 'kg' ? round(value / LB_KG, 2) : value
}

export function cmToInches(cm) {
  return Math.round(cm / 2.54)
}
