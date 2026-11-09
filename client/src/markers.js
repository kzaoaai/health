// Lab marker groups, display names and status: shared by the Labs section and the search.

export const LAB_CATEGORIES = [
  {
    id: 'hormones',
    label: 'Hormone Balance',
    color: '#a78bfa',
    aliases: ['hormones', 'thyroid', 'endocrine'],
    keys: [
      'testosterone', 'total_testosterone', 'free_testosterone', 'estrogen', 'estradiol', 'shbg',
      'dhea_s', 'cortisol', 'igf1', 'psa', 'tsh', 'free_t3', 'free_t4',
    ],
  },
  {
    id: 'heart',
    label: 'Heart Health',
    color: '#f87171',
    aliases: ['cholesterol', 'lipids', 'lipid panel', 'cardiovascular'],
    keys: [
      'total_cholesterol', 'ldl', 'hdl', 'triglycerides', 'apob',
      'remnant_cholesterol', 'triglycerides_hdl_ratio', 'total_cholesterol_hdl_ratio',
      'ldl_apob_ratio', 'homocysteine', 'crp', 'hscrp',
    ],
  },
  {
    id: 'fertility',
    label: 'Fertility',
    color: '#f472b6',
    aliases: ['sperm', 'semen', 'spermogram'],
    keys: [
      'oxidative_stress_adduct', 'dna_fragmentation_index', 'high_dna_stainability',
      'semen_volume', 'semen_ph', 'sperm_progressive_motility', 'sperm_non_progressive_motility',
      'sperm_non_motile', 'total_sperm_motility', 'sperm_morphology', 'sperm_count_per_ml',
      'total_sperm_count', 'total_progressive_sperm_count', 'sperm_vitality', 'sperm_anomaly_index',
    ],
  },
  {
    id: 'metabolic',
    label: 'Metabolic Efficiency',
    color: '#34d399',
    aliases: ['metabolism', 'blood count', 'cbc', 'liver', 'kidney', 'vitamins', 'minerals', 'electrolytes'],
    keys: [
      'glucose', 'hba1c', 'fructosamine',
      'vitamin_d', 'vitamin_b12', 'ferritin', 'iron', 'magnesium', 'calcium',
      'white_blood_cells', 'red_blood_cells', 'hemoglobin', 'hematocrit', 'platelets',
      'neutrophils', 'lymphocytes', 'monocytes', 'eosinophils', 'basophils',
      'sodium', 'potassium', 'creatinine', 'egfr', 'bun', 'uric_acid',
      'albumin', 'total_protein', 'globulin',
      'alt', 'ast', 'ggt', 'alkaline_phosphatase', 'total_bilirubin',
    ],
  },
  {
    id: 'microplastics',
    label: 'Microplastics',
    color: '#fb923c',
    aliases: ['plastics'],
    keys: [
      'microplastics_total', 'microplastics_30_70_um', 'microplastics_10_30_um', 'microplastics_under_10_um',
    ],
  },
]

export const ALL_CATEGORIZED = new Set(LAB_CATEGORIES.flatMap(c => c.keys))

// Abbreviations shown as they are written on a lab report, not title-cased ("HDL", not "Hdl").
const WORDS = {
  hdl: 'HDL', ldl: 'LDL', vldl: 'VLDL', hba1c: 'HbA1c', tsh: 'TSH', t3: 'T3', t4: 'T4',
  alt: 'ALT', ast: 'AST', ggt: 'GGT', ldh: 'LDH', bun: 'BUN', crp: 'CRP', hscrp: 'hs-CRP',
  egfr: 'eGFR', psa: 'PSA', shbg: 'SHBG', igf1: 'IGF-1', dhea: 'DHEA', apob: 'ApoB',
  mcv: 'MCV', mch: 'MCH', mchc: 'MCHC', rdw: 'RDW', mpv: 'MPV', pdw: 'PDW', esr: 'ESR',
  co2: 'CO2', ph: 'pH', dna: 'DNA', rbc: 'RBC', wbc: 'WBC', b12: 'B12', lh: 'LH', fsh: 'FSH',
  ck: 'CK', inr: 'INR', hrv: 'HRV', vo2: 'VO2', bmi: 'BMI', bmr: 'BMR', bp: 'BP', um: 'µm',
}

// Metrics whose stored names carry a unit the display may not use.
const NAMES = {
  distance_miles: 'Walking + Running Distance',
  body_temp_f: 'Body Temperature',
  wrist_temp_c: 'Sleeping Wrist Temperature',
}

export function markerTitle(key) {
  if (NAMES[key]) return NAMES[key]
  return String(key)
    .split('_')
    .filter(Boolean)
    .map(w => WORDS[w] ?? w[0].toUpperCase() + w.slice(1))
    .join(' ')
}

// 'optimal', 'normal' or 'out' for a marker's newest value, or null when it has no range.
export function getMarkerStatus(key, entries, markers) {
  const filtered = entries.filter(e => e[key] != null)
  const val = filtered[filtered.length - 1]?.[key]
  if (val == null) return null

  const cfg = markers[key]
  if (!cfg) return null

  const { optimal_low, optimal_high, range_low, range_high } = cfg
  // A one-sided bound (e.g. "higher is better") counts as having a range
  const hasOptimal = optimal_low != null || optimal_high != null
  const hasNormal = range_low != null || range_high != null
  if (!hasOptimal && !hasNormal) return null

  const inOptimal = hasOptimal &&
    (optimal_low == null || val >= optimal_low) &&
    (optimal_high == null || val <= optimal_high)
  const inNormal = hasNormal &&
    (range_low == null || val >= range_low) &&
    (range_high == null || val <= range_high)

  if (inOptimal) return 'optimal'
  if (inNormal) return 'normal'
  return 'out'
}
