// Lab results from FHIR health records: the clinical records a health provider shares with
// the iPhone Health app, which its "Export All Health Data" zip carries as one FHIR JSON
// file per record under apple_health_export/clinical-records/.
//
// Only numeric laboratory Observations become metrics. Vital signs are left out (Apple
// Health already has them), and so are qualitative results ("negative", free text),
// because a metric is a number. A result whose LOINC code names a lab marker the
// dashboard knows is stored under that marker; anything else under a name made from the
// test's own label, which then shows in Labs like any other unrecognised marker.

// LOINC code → lab marker key in BLOOD_MARKERS. Codes for the same quantity in other
// units (mmol/L glucose, for one) have their own LOINC codes and are deliberately absent,
// so a mapped value is always in the marker's unit.
const LOINC_MARKERS = {
  total_cholesterol: ['2093-3'],
  hdl: ['2085-9'],
  ldl: ['13457-7', '18262-6', '2089-1'],
  triglycerides: ['2571-8'],
  total_cholesterol_hdl_ratio: ['9830-1'],
  apob: ['1884-6'],
  glucose: ['1558-6', '17865-7'],                  // fasting; a random glucose keeps its own name
  hba1c: ['4548-4', '17856-6'],
  hemoglobin: ['718-7'],
  hematocrit: ['4544-3', '20570-8'],
  platelets: ['777-3', '26515-7'],
  white_blood_cells: ['6690-2', '26464-8'],
  red_blood_cells: ['789-8', '26453-1'],
  neutrophils: ['770-8', '26511-6'],               // the markers are percentages, so
  lymphocytes: ['736-9', '26478-8'],               // absolute counts keep their own names
  monocytes: ['5905-5', '26485-3'],
  eosinophils: ['713-8', '26450-7'],
  basophils: ['706-2', '30180-4'],
  sodium: ['2951-2', '2947-0'],
  potassium: ['2823-3', '6298-4'],
  creatinine: ['2160-0'],
  egfr: ['98979-8', '33914-3', '62238-1', '48642-3', '48643-1', '88293-6', '88294-4'],
  bun: ['3094-0', '6299-2'],
  uric_acid: ['3084-1'],
  albumin: ['1751-7'],
  total_protein: ['2885-2'],
  globulin: ['10834-0'],
  alt: ['1742-6', '1743-4'],
  ast: ['1920-8', '30239-8'],
  ggt: ['2324-2'],
  alkaline_phosphatase: ['6768-6'],
  total_bilirubin: ['1975-2'],
  calcium: ['17861-6'],
  magnesium: ['19123-9'],
  iron: ['2498-4'],
  ferritin: ['2276-4'],
  vitamin_d: ['1989-3', '62292-8'],
  vitamin_b12: ['2132-9'],
  crp: ['1988-5'],
  hscrp: ['30522-7'],
  homocysteine: ['13965-9'],
  tsh: ['3016-3', '11580-8'],
  free_t4: ['3024-7'],
  free_t3: ['3051-0'],
  testosterone: ['2986-8'],
  free_testosterone: ['2991-8'],
  estradiol: ['2243-4'],
  shbg: ['13967-5'],
  dhea_s: ['2191-5'],
  cortisol: ['2143-6'],
  igf1: ['2484-4'],
  psa: ['2857-1'],
  semen_volume: ['3160-9'],
  semen_ph: ['2752-4'],
  sperm_count_per_ml: ['9780-8'],
  total_sperm_count: ['72517-6'],
  total_sperm_motility: ['6800-7'],
  sperm_progressive_motility: ['14194-5'],
  sperm_non_progressive_motility: ['10620-3'],
  sperm_non_motile: ['10611-2'],
  sperm_morphology: ['10622-9'],
}

export const MARKER_BY_LOINC = Object.fromEntries(
  Object.entries(LOINC_MARKERS).flatMap(([marker, codes]) => codes.map(code => [code, marker])),
)

const LOINC_SYSTEM = 'http://loinc.org'
const LAB_CATEGORIES = new Set(['laboratory', 'lab'])
const DROPPED_STATUSES = new Set(['entered-in-error', 'cancelled'])

// "CHOLESTEROL, NON-HDL" → "cholesterol_non_hdl"
export function metricNameFrom(label) {
  return String(label ?? '')
    .toLowerCase()
    .replace(/%/g, ' pct ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60)
    .replace(/_+$/, '')
}

// A single resource, an array of them, or a Bundle (its entries' resources), flattened.
function resourcesIn(input) {
  if (Array.isArray(input)) return input.flatMap(resourcesIn)
  if (!input || typeof input !== 'object') return []
  if (input.resourceType === 'Bundle') return (input.entry ?? []).flatMap(e => resourcesIn(e?.resource))
  return [input]
}

function isLab(obs) {
  const cats = Array.isArray(obs.category) ? obs.category : [obs.category]
  return cats.some(c => (c?.coding ?? []).some(cc => LAB_CATEGORIES.has(String(cc?.code ?? '').toLowerCase()))
    || LAB_CATEGORIES.has(String(c?.text ?? '').toLowerCase()))
}

function dateOf(obs) {
  const raw = obs.effectiveDateTime ?? obs.effectivePeriod?.start ?? obs.issued
  return typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : null
}

function bound(q, unit) {
  if (typeof q?.value !== 'number') return null
  if (q.unit != null && unit != null && q.unit !== unit) return null   // a range in other units is no use
  return q.value
}

// → { results: [{ date, metric, value, unit, low, high, label, loinc }], skipped: { notLab, notNumeric, noDate, unnamed } }
// A test repeated on one day keeps its latest value.
export function labResultsFrom(input) {
  const skipped = { notLab: 0, notNumeric: 0, noDate: 0, unnamed: 0 }
  const byKey = new Map()
  for (const r of resourcesIn(input)) {
    if (r.resourceType !== 'Observation' || DROPPED_STATUSES.has(r.status) || !isLab(r)) { skipped.notLab++; continue }
    const q = r.valueQuantity
    if (typeof q?.value !== 'number' || !isFinite(q.value)) { skipped.notNumeric++; continue }
    const date = dateOf(r)
    if (!date) { skipped.noDate++; continue }

    const codings = r.code?.coding ?? []
    const loinc = codings.find(c => c?.system === LOINC_SYSTEM && c.code)?.code ?? null
    const label = r.code?.text ?? codings.find(c => c?.display)?.display ?? null
    const metric = (loinc && MARKER_BY_LOINC[loinc]) || metricNameFrom(label)
    if (!metric) { skipped.unnamed++; continue }

    const rr = Array.isArray(r.referenceRange) ? r.referenceRange[0] : null
    const result = {
      date, metric, value: q.value, unit: q.unit ?? null,
      low: bound(rr?.low, q.unit), high: bound(rr?.high, q.unit),
      label, loinc, at: r.effectiveDateTime ?? date,
    }
    const key = `${date}|${metric}`
    const prev = byKey.get(key)
    if (!prev || String(result.at) >= String(prev.at)) byKey.set(key, result)
  }
  const results = [...byKey.values()]
    .sort((a, b) => a.date.localeCompare(b.date) || a.metric.localeCompare(b.metric))
    .map(({ at, ...rest }) => rest)
  return { results, skipped }
}
