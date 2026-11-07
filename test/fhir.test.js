import { test } from 'node:test'
import assert from 'node:assert/strict'
import { labResultsFrom, metricNameFrom, MARKER_BY_LOINC } from '../fhir.js'

// Made-up records in the shape the Health app's export writes (one FHIR resource per file).
function obs({ loinc, text, value, unit = 'mg/dL', date = '2023-03-14T09:30:00Z', category = 'laboratory', low, high, status = 'final', extra = {} }) {
  return {
    resourceType: 'Observation',
    status,
    category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: category }] }],
    code: { text, coding: loinc ? [{ system: 'http://loinc.org', code: loinc, display: text }] : [] },
    effectiveDateTime: date,
    ...(value !== undefined ? { valueQuantity: { value, unit } } : {}),
    ...(low !== undefined || high !== undefined ? { referenceRange: [{ ...(low !== undefined ? { low: { value: low, unit } } : {}), ...(high !== undefined ? { high: { value: high, unit } } : {}) }] } : {}),
    ...extra,
  }
}

test('a known LOINC code lands on the dashboard marker, with its range', () => {
  const { results } = labResultsFrom(obs({ loinc: '2085-9', text: 'HDL', value: 52, low: 40 }))
  assert.deepEqual(results, [{ date: '2023-03-14', metric: 'hdl', value: 52, unit: 'mg/dL', low: 40, high: null, label: 'HDL', loinc: '2085-9' }])
})

test('an unknown test keeps a name made from its label', () => {
  const { results } = labResultsFrom(obs({ loinc: '43396-1', text: 'CHOLESTEROL, NON-HDL', value: 120 }))
  assert.equal(results[0].metric, 'cholesterol_non_hdl')
  assert.equal(metricNameFrom('NEUTROPHILS %, AUTOMATED COUNT'), 'neutrophils_pct_automated_count')
})

test('blood-count percentages map to the markers, absolute counts do not', () => {
  assert.equal(MARKER_BY_LOINC['770-8'], 'neutrophils')
  assert.equal(MARKER_BY_LOINC['751-8'], undefined)
})

test('vital signs, qualitative results and withdrawn results are skipped', () => {
  const { results, skipped } = labResultsFrom([
    obs({ loinc: '8867-4', text: 'Pulse', value: 60, unit: '/min', category: 'vital-signs' }),
    obs({ loinc: '5195-3', text: 'Test A', value: undefined, extra: { valueString: 'Negative' } }),
    obs({ loinc: '2093-3', text: 'Cholesterol', value: 180, status: 'entered-in-error' }),
    { resourceType: 'Condition', code: { text: 'Something' } },
  ])
  assert.equal(results.length, 0)
  assert.deepEqual(skipped, { notLab: 3, notNumeric: 1, noDate: 0, unnamed: 0 })
})

test('a Bundle and a nested array are read the same as single resources', () => {
  const bundle = { resourceType: 'Bundle', entry: [{ resource: obs({ loinc: '4548-4', text: 'HbA1c', value: 5.2, unit: '%' }) }] }
  const { results } = labResultsFrom([bundle, [obs({ loinc: '2571-8', text: 'Triglyceride', value: 90 })]])
  assert.deepEqual(results.map(r => r.metric), ['hba1c', 'triglycerides'])
})

test('the same test twice on one day keeps the later value', () => {
  const { results } = labResultsFrom([
    obs({ loinc: '3016-3', text: 'TSH', value: 2.1, unit: 'mcIU/mL', date: '2023-03-14T15:00:00Z' }),
    obs({ loinc: '3016-3', text: 'TSH', value: 1.9, unit: 'mcIU/mL', date: '2023-03-14T08:00:00Z' }),
  ])
  assert.equal(results.length, 1)
  assert.equal(results[0].value, 2.1)
})

test('a range in other units, or with no number, is dropped', () => {
  const o = obs({ loinc: '2345-7', text: 'Glucose, random', value: 95, low: 70, high: 99 })
  o.referenceRange[0].high.unit = 'mmol/L'
  const { results } = labResultsFrom(o)
  assert.equal(results[0].metric, 'glucose_random')
  assert.equal(results[0].low, 70)
  assert.equal(results[0].high, null)
})

test('an observation without a usable date is skipped', () => {
  const o = obs({ loinc: '2085-9', text: 'HDL', value: 52 })
  delete o.effectiveDateTime
  assert.deepEqual(labResultsFrom(o).skipped, { notLab: 0, notNumeric: 0, noDate: 1, unnamed: 0 })
})
