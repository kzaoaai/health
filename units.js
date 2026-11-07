// Unit conversion for imported lab results.
//
// Labs print results in their own units: g/L and mg/L across much of Europe and the Middle
// East, mmol/L where SI units are the rule, mg/dL in the US. The dashboard keeps each marker
// in one unit (the unit its marker_configs row records, else the one in BLOOD_MARKERS), so a
// result printed in another unit is converted before it is stored. One that cannot be
// converted is flagged for review instead of being stored as if it were already in the
// marker's unit, which would put, say, a cholesterol of 2.9 g/L on a chart of mg/dL values.

// Each unit's factor to its family's base unit (named in the comment).
const FAMILIES = {
  mass: {                                                      // g/L
    'g/l': 1, 'g/dl': 10, 'mg/ml': 1, 'mg/dl': 1e-2, 'mg/l': 1e-3, 'ug/ml': 1e-3,
    'ug/dl': 1e-5, 'ug/l': 1e-6, 'ng/ml': 1e-6, 'ng/dl': 1e-8, 'ng/l': 1e-9, 'pg/ml': 1e-9,
  },
  molar: { 'mol/l': 1, 'mmol/l': 1e-3, 'umol/l': 1e-6, 'nmol/l': 1e-9, 'pmol/l': 1e-12 },   // mol/L
  count: { '/ul': 1, '10^3/ul': 1e3, '10^6/ul': 1e6, '10^9/l': 1e3, '10^12/l': 1e6 },     // per µL
  activity: { 'u/l': 1, 'mu/l': 1e-3, 'u/ml': 1e3, 'mu/ml': 1, 'uu/ml': 1e-3, 'ukat/l': 60 }, // U/L; IU is folded into U
  fraction: { '%': 1, 'l/l': 100 },                            // %
  cell_volume: { 'fl': 1, 'um3': 1 },                          // fL
  cell_mass: { 'pg': 1, 'pg/cell': 1 },                        // pg
  per_ml: { '/ml': 1, '10^6/ml': 1e6 },                        // per mL
  number: { '10^6': 1e6 },
  volume: { 'ml': 1, 'l': 1000 },                              // mL
  filtration: { 'ml/min': 1, 'ml/min/1.73m2': 1 },             // mL/min
}

// Molar mass in g/mol, for converting between mmol/L-style and mg/dL-style units. BUN is
// urea's nitrogen, 2 × 14.007, which is also why 1 mmol/L of urea is 2.8 mg/dL of BUN.
const MOLAR_MASS = {
  glucose: 180.16, glucose_random: 180.16,
  total_cholesterol: 386.65, hdl: 386.65, ldl: 386.65, remnant_cholesterol: 386.65,
  triglycerides: 885.7,
  creatinine: 113.12, uric_acid: 168.11, bun: 28.014,
  calcium: 40.078, magnesium: 24.305, iron: 55.845, total_bilirubin: 584.66,
  hemoglobin: 16114.5, homocysteine: 135.18,
  vitamin_d: 400.64, vitamin_b12: 1355.37,
  testosterone: 288.42, total_testosterone: 288.42, free_testosterone: 288.42,
  estradiol: 272.38, cortisol: 362.46, dhea_s: 368.5, free_t4: 776.87, free_t3: 650.97,
}

// mEq/L is mmol/L times the ion's charge.
const VALENCE = { calcium: 2, magnesium: 2 }

// Urea's nitrogen is 28.014 of its 60.056 g/mol: urea g/L × this = BUN g/L.
const UREA_TO_BUN = 28.014 / 60.056

// On a cell count, G/L and T/L are giga- and tera-per-litre (as French labs print them),
// not grams per litre.
const COUNT_ALIASES = { 'g/l': '10^9/l', 't/l': '10^12/l' }

// One spelling per unit: "x10 3/mm3", "×10³/µL", "10*3/uL", "K/uL" and "x1000/mcL" all
// become "10^3/ul"; "mcg/dL" becomes "ug/dl"; "IU/L", "UI/L" and "U/L" become "u/l".
export function canonicalUnit(raw) {
  let u = String(raw ?? '').trim()
  if (/^(ratio|index|none|n\/a|-)$/i.test(u)) return ''
  u = u.replace(/[µμ]/g, 'u').replace(/×/g, 'x').replace(/¹²/g, '12').replace(/³/g, '3')
    .replace(/⁶/g, '6').replace(/⁹/g, '9').replace(/²/g, '2')
  u = u.toLowerCase().replace(/\s+/g, '')
  u = u.replace(/(^|\/)mc/g, '$1u')                       // mcg → ug, mcL → uL, mcIU → uIU
  u = u.replace(/iu/g, 'u').replace(/ui(?=\/)/g, 'u')     // IU (and French UI) → U
  u = u.replace(/^gm\//, 'g/').replace(/^mg%$/, 'mg/dl').replace(/\/100ml$/, '/dl')
  u = u.replace(/\/(?:cu)?mm3$/, '/ul').replace(/\/cumm$/, '/ul')   // per mm³ is per µL
  u = u.replace(/^cells(?=\/)/, '')
  u = u.replace(/^x?10(?:\^|\*|e)?(3|6|9|12)(?=\/|$)/, '10^$1')       // x10^3, 10*3, x10e3, x103
  u = u.replace(/^(?:x?1000|k|thou|thousand)(?=\/)/, '10^3')
  u = u.replace(/^(?:m|mil|mill|million|millions)(?=\/|$)/, '10^6')
  return u
}

function lookup(u, metric) {
  if (u === 'meq/l') return { family: 'molar', factor: 1e-3 / (VALENCE[metric] ?? 1) }
  if (u === 'mmol/mol' && metric === 'hba1c') return { family: 'ifcc', factor: 1 }
  for (const [family, units] of Object.entries(FAMILIES)) {
    if (u in units) return { family, factor: units[u] }
  }
  return null
}

const round = x => Number(Number(x).toPrecision(4))

// A function taking a value in `from` to `to` for this metric, or null when there is none.
export function converter(from, to, metric) {
  const f = canonicalUnit(from)
  const t = canonicalUnit(to)
  if (f === t) return x => x
  const tu = lookup(t, metric)
  const fu = lookup(tu?.family === 'count' && COUNT_ALIASES[f] ? COUNT_ALIASES[f] : f, metric)
  if (!tu || !fu) return null
  if (fu.family === tu.family) {
    if (fu.factor === tu.factor) return x => x
    return x => round(x * fu.factor / tu.factor)
  }
  const mw = MOLAR_MASS[metric]
  if (mw && fu.family === 'molar' && tu.family === 'mass') return x => round(x * fu.factor * mw / tu.factor)
  if (mw && fu.family === 'mass' && tu.family === 'molar') return x => round(x * fu.factor / mw / tu.factor)
  // HbA1c: IFCC mmol/mol to NGSP %, the master equation both bodies publish.
  if (fu.family === 'ifcc' && tu.family === 'fraction') return x => round((0.09148 * x + 2.152) / tu.factor)
  return null
}

const isBlank = u => u == null || String(u).trim() === ''

// Urea is reported where BUN is the US convention. They differ by urea's nitrogen share,
// so a urea result is stored as BUN rather than as a marker of its own. Null when it
// cannot be (no unit, or one that is neither a mass nor a molar concentration).
function ureaAsBun(value, unit, range, bunUnit) {
  const u = lookup(canonicalUnit(unit), 'urea')
  if (bunUnit == null || !(u?.family === 'mass' || u?.family === 'molar')) return null
  // By mass, urea's weight becomes its nitrogen's; by moles, a mole of urea is a mole of BUN.
  const [from, pre] = u.family === 'mass' ? ['g/L', x => x * u.factor * UREA_TO_BUN] : [unit, x => x]
  const convert = converter(from, bunUnit, 'bun')
  if (!convert) return null
  const f = x => (x == null ? null : convert(pre(x)))
  return { value: f(value), range: range && { low: f(range.low), high: f(range.high) } }
}

// parsed: the OCR result, { metrics: {name: value}, reference_ranges: {name: {low, high}},
// units: {name: printed unit}, source_type }.
// unitFor(metric): the unit the dashboard keeps that marker in, or null if it has none yet.
//
// Returns parsed with every value and range in the dashboard's unit, plus
//   units:       { metric: the unit the stored value is in }
//   conversions: { metric: { status, from_value, from_unit, from_metric? } }
// where status is
//   'same'      printed in the marker's unit (or an equal one), stored as printed
//   'converted' converted from the printed unit
//   'new'       a marker with no unit yet: stored as printed, and its unit recorded
//   'unknown'   printed in a unit with no known conversion: held back for review
//   'no_unit'   no unit read for a marker that has one: held back for review
// A value held back is left as printed; importing it anyway takes it as being in the
// marker's unit.
export function convertReport(parsed, unitFor) {
  // InBody scans are already asked for in the dashboard's units (lbs, %, kcal).
  if (!parsed || parsed.source_type === 'inbody') return parsed
  const metrics = parsed.metrics ?? {}
  const printed = parsed.units ?? {}
  const ranges = parsed.reference_ranges ?? {}
  const out = { metrics: {}, reference_ranges: {}, units: {}, conversions: {} }

  for (const [name, raw] of Object.entries(metrics)) {
    const num = Number(raw)
    if (raw == null || raw === '' || !isFinite(num)) continue
    const unit = isBlank(printed[name]) ? null : printed[name]
    const range = ranges[name] && typeof ranges[name] === 'object' ? ranges[name] : null
    const from = { from_value: num, from_unit: unit }

    const bun = name === 'urea' && !('bun' in metrics) ? ureaAsBun(num, unit, range, unitFor('bun')) : null
    if (bun) {
      out.metrics.bun = bun.value
      if (bun.range) out.reference_ranges.bun = bun.range
      out.units.bun = unitFor('bun')
      out.conversions.bun = { status: 'converted', ...from, from_metric: 'urea' }
      continue
    }

    const target = unitFor(name)
    let status
    let convert = null
    if (target == null) status = 'new'
    else if (unit == null && !isBlank(target)) status = 'no_unit'
    else {
      convert = converter(unit, target, name)
      status = convert ? 'converted' : 'unknown'
    }

    let value = num
    let storedRange = range
    if (convert) {
      value = convert(num)
      if (range) storedRange = { low: range.low == null ? null : convert(range.low), high: range.high == null ? null : convert(range.high) }
      if (value === num) status = 'same'
    }
    out.metrics[name] = value
    if (storedRange) out.reference_ranges[name] = storedRange
    out.units[name] = target ?? unit
    out.conversions[name] = { status, ...from }
  }
  return { ...parsed, ...out }
}

// Statuses a review should leave unticked.
export const HELD_BACK = new Set(['unknown', 'no_unit'])
