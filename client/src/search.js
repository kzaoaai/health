// Dashboard search. buildIndex turns the loaded data into one list of things to find: the
// sections, the cards each section draws, the lab groups, and every lab marker and Apple
// Health metric the profile has data for. search ranks that list for a query. Each entry
// names the element to scroll to (`target`), so a result jumps straight to its chart.

import { SECTIONS, metricAnchor } from './sections.js'
import { LAB_CATEGORIES, ALL_CATEGORIZED, markerTitle, getMarkerStatus } from './markers.js'
import { DEFAULT_UNITS, displayMetric } from './unitPrefs.js'

const SKIP_KEYS = new Set(['date', 'source', 'notes'])
const SECTION_BY_ID = Object.fromEntries(SECTIONS.map(s => [s.id, s]))

// The cards the fixed sections draw. `key` is the metric whose newest value a result shows;
// an `optional` card is listed only when there is a value to show.
const CARDS = [
  { section: 'body', key: 'weight', label: 'Weight', unit: 'lbs', aliases: ['body weight', 'lbs', 'kg'] },
  { section: 'body', key: 'skeletal_muscle_mass', label: 'Muscle Mass', unit: 'lbs', aliases: ['skeletal muscle', 'smm', 'lean mass'] },
  { section: 'body', key: 'body_fat_mass', label: 'Body Fat Mass', unit: 'lbs', aliases: ['fat'] },
  { section: 'body', key: 'bmi', label: 'BMI', aliases: ['body mass index'] },
  { section: 'body', key: 'visceral_fat', label: 'Visceral Fat', unit: 'level', aliases: ['belly fat', 'fat'] },
  { section: 'body', key: 'body_fat', label: 'Body Fat', unit: '%', optional: true, aliases: ['body fat percentage', 'fat percentage', 'fat'] },
  { section: 'body', key: 'lean_mass', label: 'Lean Mass', unit: 'lbs', optional: true, aliases: ['lean body mass', 'fat free mass'] },
  { section: 'body', key: 'bmr', label: 'BMR', unit: 'kcal', optional: true, aliases: ['basal metabolic rate', 'metabolism'] },
  { section: 'body', key: 'total_body_water', label: 'Body Water', unit: 'L', optional: true, aliases: ['total body water', 'hydration', 'tbw'] },
  { section: 'sleep', key: 'sleep_hours', label: 'Total Sleep', target: 'sleep-night', aliases: ['sleep duration', 'hours slept', 'asleep'] },
  { section: 'sleep', key: 'deep_sleep_hours', label: 'Deep Sleep', target: 'sleep-night', aliases: ['sleep stages'] },
  { section: 'sleep', key: 'rem_sleep_hours', label: 'REM Sleep', target: 'sleep-night', aliases: ['sleep stages', 'dreams'] },
  { section: 'sleep', key: 'core_sleep_hours', label: 'Core Sleep', target: 'sleep-night', aliases: ['light sleep', 'sleep stages'] },
  { section: 'sleep', label: 'Sleep History', target: 'sleep-history', aliases: ['past nights'] },
  { section: 'sleep', label: 'Bedtime', target: 'sleep-bedtime', aliases: ['bed time', 'wake time', 'wake up', 'sleep schedule'] },
  { section: 'exercise', label: 'Workouts This Week', target: 'exercise-stats', aliases: ['sessions', 'workouts today'] },
  { section: 'exercise', key: 'exercise_minutes', label: 'Exercise Minutes', target: 'exercise-minutes', unit: 'min', aliases: ['active minutes', 'exercise time'] },
  { section: 'exercise', label: 'Heart Rate Zones', target: 'exercise-zones', aliases: ['hr zones', 'zone 2', 'z2', 'cardio zones'] },
  { section: 'heartrate', key: 'resting_heart_rate', label: 'Resting Heart Rate', unit: 'bpm', aliases: ['rhr', 'pulse', 'bpm'] },
  { section: 'heartrate', key: 'hrv', label: 'HRV', unit: 'ms', aliases: ['heart rate variability', 'sdnn'] },
  { section: 'heartrate', key: 'heart_rate', label: 'Day Average Heart Rate', unit: 'bpm', aliases: ['average heart rate', 'avg heart rate', 'mean heart rate'] },
]

// Other names a lab marker goes by, as labs print them or people say them.
const CBC = ['cbc', 'blood count']
const MARKER_ALIASES = {
  hdl: ['good cholesterol', 'hdl cholesterol'],
  ldl: ['bad cholesterol', 'ldl cholesterol'],
  total_cholesterol: ['cholesterol'],
  triglycerides: ['tg', 'trigs'],
  apob: ['apolipoprotein b'],
  crp: ['c reactive protein', 'inflammation'],
  hscrp: ['hs crp', 'c reactive protein', 'inflammation'],
  glucose: ['blood sugar', 'fasting glucose', 'sugar'],
  hba1c: ['a1c', 'glycated hemoglobin', 'blood sugar', 'diabetes'],
  vitamin_d: ['vit d', 'd3', '25 oh vitamin d'],
  vitamin_b12: ['b12', 'vit b12', 'cobalamin'],
  ferritin: ['iron stores'],
  iron: ['fe', 'serum iron'],
  magnesium: ['mg'],
  calcium: ['ca'],
  white_blood_cells: ['wbc', 'leukocytes', ...CBC],
  red_blood_cells: ['rbc', 'erythrocytes', ...CBC],
  hemoglobin: ['hgb', 'hb', ...CBC],
  hematocrit: ['hct', ...CBC],
  platelets: ['plt', 'thrombocytes', ...CBC],
  mcv: ['mean corpuscular volume', ...CBC],
  mch: ['mean corpuscular hemoglobin', ...CBC],
  mchc: [...CBC],
  rdw: ['red cell distribution width', ...CBC],
  rdw_blood: ['red cell distribution width', ...CBC],
  mpv: ['mean platelet volume', ...CBC],
  pdw: ['platelet distribution width', ...CBC],
  neutrophils: ['differential', ...CBC],
  lymphocytes: ['differential', ...CBC],
  monocytes: ['differential', ...CBC],
  eosinophils: ['differential', ...CBC],
  basophils: ['differential', ...CBC],
  sodium: ['na', 'electrolytes'],
  potassium: ['k', 'electrolytes'],
  chloride: ['cl', 'electrolytes'],
  co2: ['bicarbonate', 'electrolytes'],
  creatinine: ['kidney', 'renal'],
  egfr: ['gfr', 'kidney', 'renal'],
  bun: ['urea', 'kidney', 'renal'],
  uric_acid: ['urate', 'gout'],
  alt: ['sgpt', 'liver'],
  ast: ['sgot', 'liver'],
  ggt: ['gamma gt', 'liver'],
  alkaline_phosphatase: ['alp', 'liver'],
  total_bilirubin: ['bilirubin', 'liver'],
  albumin: ['liver', 'protein'],
  tsh: ['thyroid'],
  free_t3: ['ft3', 'thyroid'],
  free_t4: ['ft4', 'thyroid'],
  estradiol: ['e2', 'estrogen'],
  dhea_s: ['dhea'],
  igf1: ['igf 1', 'growth hormone'],
  psa: ['prostate'],
  shbg: ['sex hormone binding globulin'],
}

// Other names for what Health Auto Export sends (as the importer stores it).
const APPLE_ALIASES = {
  steps: ['step count', 'walking'],
  active_calories: ['active energy', 'calories', 'kcal', 'move'],
  resting_calories: ['basal energy', 'calories', 'kcal'],
  distance_miles: ['distance', 'walking running distance', 'miles'],
  vo2_max: ['cardio fitness', 'vo2'],
  blood_oxygen: ['spo2', 'oxygen saturation', 'o2'],
  respiratory_rate: ['breathing rate', 'breaths'],
  bp_systolic: ['blood pressure', 'bp', 'systolic'],
  bp_diastolic: ['blood pressure', 'bp', 'diastolic'],
  body_temp_f: ['temperature'],
  wrist_temp_c: ['temperature', 'wrist temperature'],
  environmental_audio_exposure: ['noise', 'sound', 'decibels', 'db'],
  headphone_audio_exposure: ['noise', 'sound', 'volume', 'decibels', 'db'],
  time_in_daylight: ['sun', 'daylight', 'outdoors'],
  flights_climbed: ['stairs', 'floors'],
  cardio_recovery: ['heart rate recovery', 'hrr'],
  mindful_minutes: ['meditation', 'mindfulness'],
  physical_effort: ['effort', 'mets'],
}

export function normalize(s) {
  return String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim()
}

const unique = xs => [...new Set(xs)]

// The newest numeric value of `key`, with its date.
function latest(entries, key) {
  let best = null
  for (const e of entries ?? []) {
    const v = e?.[key]
    if (typeof v !== 'number' || !isFinite(v)) continue
    if (!best || e.date >= best.date) best = { value: v, date: e.date }
  }
  return best
}

export function formatValue(key, v) {
  if (/sleep_hours$/.test(key)) {
    let h = Math.floor(v)
    let m = Math.round((v - h) * 60)
    if (m === 60) { h += 1; m = 0 }
    return m ? `${h}h ${m}m` : `${h}h`
  }
  const a = Math.abs(v)
  if (a >= 1000) return Math.round(v).toLocaleString('en-US')
  if (a >= 10) return String(Math.round(v * 10) / 10)
  return String(Number(v.toPrecision(3)))
}

// The result's value as the dashboard shows it: in the profile's units, with a status
// ('optimal', 'normal', 'out') where the dashboard rates the value.
function valueOf(key, l, unit = '', status = null, units = DEFAULT_UNITS) {
  if (!l) return null
  const shown = displayMetric(key, l.value, units)
  return { text: formatValue(key, shown ? shown.value : l.value), unit: shown ? shown.unit : (unit ?? ''), date: l.date, status }
}

// The Body cards' own ratings (BodySection), as statuses: red there is 'out'.
const CARD_STATUS = {
  bmi: v => (v < 18.5 || v >= 30 ? 'out' : v >= 25 ? 'normal' : 'optimal'),
  visceral_fat: v => (v > 14 ? 'out' : v > 9 ? 'normal' : 'optimal'),
}

function entry({ kind, section, key = null, group = null, label, target, where, aliases = [], context = [], value = null }, hidden) {
  const sec = SECTION_BY_ID[section]
  return {
    id: kind === 'section' ? `section:${section}` : `${kind}:${section}:${key ?? group ?? label}`,
    kind, section, key, group, label, target, value,
    icon: sec.icon,
    where: where ?? (kind === 'section' ? null : sec.label),
    hidden: hidden.has(section),
    // What the query is matched against: the name and its other names first, then the
    // section and group it sits in, which count for less.
    names: unique([label, key?.replace(/_/g, ' '), ...aliases].filter(Boolean).map(normalize)),
    context: unique([kind === 'section' ? null : sec.label, ...context].filter(Boolean).map(normalize)),
  }
}

function keysIn(entries) {
  const keys = new Set()
  for (const e of entries ?? []) {
    for (const [k, v] of Object.entries(e)) if (!SKIP_KEYS.has(k) && v != null) keys.add(k)
  }
  return keys
}

// data: the dashboard's loaded section data ({ body, sleep, exercise, heartrate,
// appleHealth, blood }); hidden: the ids of sections hidden in Settings; units: the
// profile's display units (unitPrefs.js).
export function buildIndex(data = {}, hidden = new Set(), units = DEFAULT_UNITS) {
  const { body, sleep, exercise, heartrate, appleHealth, blood } = data
  const out = []

  for (const s of SECTIONS) {
    out.push(entry({ kind: 'section', section: s.id, label: s.label, target: s.id, aliases: s.aliases }, hidden))
  }

  const sources = { body: body?.entries, sleep: sleep?.entries, exercise: exercise?.entries, heartrate: heartrate?.entries }
  for (const c of CARDS) {
    const l = c.key ? latest(sources[c.section], c.key) : null
    if (c.optional && !l) continue
    out.push(entry({
      kind: 'card', section: c.section, key: c.key ?? null, label: c.label,
      target: c.target ?? metricAnchor(c.section, c.key), aliases: c.aliases,
      value: valueOf(c.key, l, c.unit, l && CARD_STATUS[c.key] ? CARD_STATUS[c.key](l.value) : null, units),
    }, hidden))
  }

  // Labs: the markers the Labs section draws, under the same groups.
  const labEntries = blood?.entries ?? []
  const markers = blood?.markers ?? {}
  const labKeys = keysIn(labEntries)
  const groups = [
    ...LAB_CATEGORIES.map(c => ({ ...c, keys: c.keys.filter(k => labKeys.has(k)) })),
    { id: 'other', label: 'Other', aliases: [], keys: [...labKeys].filter(k => !ALL_CATEGORIZED.has(k)).sort() },
  ].filter(g => g.keys.length)
  for (const g of groups) {
    out.push(entry({
      kind: 'group', section: 'labs', group: g.id, label: g.label, target: `labs-group-${g.id}`,
      aliases: g.aliases, where: `Labs · ${g.keys.length} marker${g.keys.length === 1 ? '' : 's'}`,
    }, hidden))
    for (const k of g.keys) {
      const l = latest(labEntries, k)
      out.push(entry({
        kind: 'metric', section: 'labs', key: k, group: g.id, label: markerTitle(k),
        target: metricAnchor('labs', k), where: `Labs · ${g.label}`, aliases: MARKER_ALIASES[k],
        context: [g.label], value: valueOf(k, l, markers[k]?.unit, getMarkerStatus(k, labEntries, markers), units),
      }, hidden))
    }
  }

  const ahEntries = appleHealth?.entries ?? []
  for (const k of [...keysIn(ahEntries)].sort()) {
    const l = latest(ahEntries, k)
    if (!l) continue
    out.push(entry({
      kind: 'metric', section: 'applehealth', key: k, label: markerTitle(k),
      target: metricAnchor('applehealth', k), aliases: APPLE_ALIASES[k], value: valueOf(k, l, '', null, units),
    }, hidden))
  }

  return out
}

function textScore(text, q, tokens) {
  if (text === q) return 100
  if (text.startsWith(q)) return 90
  if (` ${text}`.includes(` ${q}`)) return 75
  const words = text.split(' ')
  if (tokens.every(t => words.some(w => w.startsWith(t)))) return 60
  if (q.length >= 3 && text.includes(q)) return 40
  return 0
}

function scoreEntry(e, q, tokens) {
  let best = 0
  // The name itself ranks a little above its other names.
  e.names.forEach((n, i) => { best = Math.max(best, textScore(n, q, tokens) - (i ? 5 : 0)) })
  for (const c of e.context) best = Math.max(best, textScore(c, q, tokens) * 0.4)
  if (!best) {
    // Words from both: "labs hdl", "sleep deep".
    const words = [...e.names, ...e.context].join(' ').split(' ')
    if (tokens.every(t => words.some(w => w.startsWith(t)))) best = 35
  }
  return best
}

// Edit distance, giving up past `max`.
function distance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    let rowMin = i
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
      rowMin = Math.min(rowMin, cur[j])
    }
    if (rowMin > max) return max + 1
    prev = cur
  }
  return prev[b.length]
}

// Spelling slips ("cholestrol", "trigliserides"), tried only when nothing else matched.
function typoScore(e, tokens) {
  const words = unique([...e.names, ...e.context].join(' ').split(' '))
  const ok = tokens.every(t => {
    if (t.length < 4) return words.some(w => w.startsWith(t))
    const max = t.length >= 7 ? 2 : 1
    return words.some(w => distance(t, w, max) <= max)
  })
  return ok ? 20 : 0
}

const KIND_ORDER = { section: 0, group: 1, card: 2, metric: 3 }

export const isOutOfRange = e => e.value?.status === 'out'

// outOfRange: only results whose newest value is out of range; with no query, all of them.
export function search(index, query, { outOfRange = false, limit = 40 } = {}) {
  const pool = outOfRange ? index.filter(isOutOfRange) : index
  const q = normalize(query)
  if (!q) {
    if (!outOfRange) return pool.filter(e => e.kind === 'section')
    return [...pool].sort((a, b) => (a.where ?? '').localeCompare(b.where ?? '') || a.label.localeCompare(b.label))
  }
  const tokens = q.split(' ')

  let scored = pool.map(e => ({ e, s: scoreEntry(e, q, tokens) })).filter(x => x.s > 0)
  if (!scored.length && q.length >= 4) {
    scored = pool.map(e => ({ e, s: typoScore(e, tokens) })).filter(x => x.s > 0)
  }
  return scored
    .sort((a, b) =>
      b.s - a.s ||
      KIND_ORDER[a.e.kind] - KIND_ORDER[b.e.kind] ||
      (b.e.value ? 1 : 0) - (a.e.value ? 1 : 0) ||
      a.e.label.length - b.e.label.length ||
      a.e.label.localeCompare(b.e.label))
    .slice(0, limit)
    .map(x => x.e)
}
