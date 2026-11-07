import { test } from 'node:test'
import assert from 'node:assert/strict'
import { canonicalUnit, converter, convertReport, HELD_BACK } from '../units.js'

// Made-up results. Target units are the dashboard's own (BLOOD_MARKERS) or ones a health
// records import writes into marker_configs ("x1000/mcL", "Mill/mcL", "mcIU/mL", "fL").
const TARGETS = {
  total_cholesterol: 'mg/dL', hdl: 'mg/dL', triglycerides: 'mg/dL', glucose: 'mg/dL',
  hba1c: '%', albumin: 'g/dL', calcium: 'mg/dL', sodium: 'mEq/L', bun: 'mg/dL',
  white_blood_cells: 'x1000/mcL', platelets: 'x1000/mcL', red_blood_cells: 'Mill/mcL',
  hematocrit: '%', mcv: 'fL', tsh: 'mcIU/mL', alt: 'U/L', testosterone: 'ng/dL',
  vitamin_d: 'ng/mL', ferritin: 'ng/mL', total_cholesterol_hdl_ratio: '',
}
const unitFor = m => (m in TARGETS ? TARGETS[m] : null)
const conv = (value, from, metric) => converter(from, TARGETS[metric], metric)?.(value)

test('spellings of one unit agree', () => {
  for (const u of ['x10 3/mm3', '×10³/µL', '10*3/uL', 'K/uL', 'x1000/mcL', 'X10E3/uL', 'thou/mm3']) {
    assert.equal(canonicalUnit(u), '10^3/ul', u)
  }
  assert.equal(canonicalUnit('Mill/mcL'), '10^6/ul')
  assert.equal(canonicalUnit('mcg/dL'), 'ug/dl')
  assert.equal(canonicalUnit('UI/L'), 'u/l')
  assert.equal(canonicalUnit('IU/L'), 'u/l')
  assert.equal(canonicalUnit('mUI/L'), 'mu/l')
  assert.equal(canonicalUnit('mcIU/mL'), 'uu/ml')
})

test('mass units convert by powers of ten', () => {
  assert.equal(conv(1.85, 'g/L', 'total_cholesterol'), 185)
  assert.equal(conv(0.52, 'g/L', 'hdl'), 52)
  assert.equal(conv(41, 'g/L', 'albumin'), 4.1)
  assert.equal(conv(91.5, 'mg/L', 'calcium'), 9.15)
})

test('molar units convert through the molar mass', () => {
  assert.equal(conv(5, 'mmol/L', 'total_cholesterol'), 193.3)
  assert.equal(conv(5.5, 'mmol/L', 'glucose'), 99.09)
  assert.equal(conv(1.2, 'mmol/L', 'triglycerides'), 106.3)
  assert.equal(conv(2.4, 'mmol/L', 'calcium'), 9.619)
  assert.equal(conv(4.8, 'mEq/L', 'calcium'), 9.619)              // calcium carries two charges
  assert.equal(conv(20, 'nmol/L', 'testosterone'), 576.8)
  assert.equal(conv(75, 'nmol/L', 'vitamin_d'), 30.05)
  assert.equal(conv(48, 'mmol/mol', 'hba1c'), 6.543)              // IFCC → NGSP
})

test('equal units keep the printed value', () => {
  assert.equal(conv(140, 'mmol/L', 'sodium'), 140)
  assert.equal(conv(6.2, '10^3/mm3', 'white_blood_cells'), 6.2)
  assert.equal(conv(250, 'G/L', 'platelets'), 250)                // giga per litre on a count
  assert.equal(conv(4.9, 'x10^12/L', 'red_blood_cells'), 4.9)
  assert.equal(conv(88, 'um3', 'mcv'), 88)
  assert.equal(conv(1.8, 'mUI/L', 'tsh'), 1.8)
  assert.equal(conv(30, 'IU/L', 'alt'), 30)
  assert.equal(conv(0.44, 'L/L', 'hematocrit'), 44)
})

test('units with no conversion between them have none', () => {
  assert.equal(converter('mmol/L', 'U/L', 'alt'), null)
  assert.equal(converter('pmol/L', 'ng/mL', 'ferritin'), null)    // no molar mass for a protein
  assert.equal(converter('%', 'x1000/mcL', 'white_blood_cells'), null)
})

test('a report is converted value by value, with its ranges', () => {
  const out = convertReport({
    source_type: 'blood_panel',
    metrics: { total_cholesterol: 1.85, sodium: 140, mch: 29, alt: 30, glucose: 95, total_cholesterol_hdl_ratio: 3.6 },
    units: { total_cholesterol: 'g/L', sodium: 'mmol/L', mch: 'pg', alt: 'mmol/L', glucose: '', total_cholesterol_hdl_ratio: '' },
    reference_ranges: { total_cholesterol: { low: 0, high: 2 }, sodium: { low: 135, high: 145 } },
  }, unitFor)

  assert.equal(out.metrics.total_cholesterol, 185)
  assert.deepEqual(out.reference_ranges.total_cholesterol, { low: 0, high: 200 })
  assert.deepEqual(out.conversions.total_cholesterol, { status: 'converted', from_value: 1.85, from_unit: 'g/L' })
  assert.equal(out.units.total_cholesterol, 'mg/dL')

  assert.equal(out.conversions.sodium.status, 'same')
  assert.deepEqual(out.reference_ranges.sodium, { low: 135, high: 145 })

  assert.equal(out.conversions.mch.status, 'new')             // no unit yet: kept, unit recorded
  assert.equal(out.units.mch, 'pg')

  assert.equal(out.conversions.alt.status, 'unknown')
  assert.equal(out.conversions.glucose.status, 'no_unit')
  assert.ok(HELD_BACK.has('unknown') && HELD_BACK.has('no_unit'))
  assert.equal(out.metrics.alt, 30)                           // held back as printed

  assert.equal(out.conversions.total_cholesterol_hdl_ratio.status, 'same')
})

test('urea becomes BUN', () => {
  const byMass = convertReport({ metrics: { urea: 0.3 }, units: { urea: 'g/L' }, reference_ranges: { urea: { low: 0.15, high: 0.45 } } }, unitFor)
  assert.equal(byMass.metrics.bun, 13.99)
  assert.equal(byMass.metrics.urea, undefined)
  assert.deepEqual(byMass.reference_ranges.bun, { low: 6.997, high: 20.99 })
  assert.deepEqual(byMass.conversions.bun, { status: 'converted', from_value: 0.3, from_unit: 'g/L', from_metric: 'urea' })

  const byMoles = convertReport({ metrics: { urea: 5 }, units: { urea: 'mmol/L' } }, unitFor)
  assert.equal(byMoles.metrics.bun, 14.01)

  // A report that also has BUN keeps its urea as a marker of its own.
  const both = convertReport({ metrics: { urea: 30, bun: 14 }, units: { urea: 'mg/dL', bun: 'mg/dL' } }, unitFor)
  assert.equal(both.metrics.urea, 30)
  assert.equal(both.metrics.bun, 14)
})

test('InBody scans are left alone', () => {
  const scan = { source_type: 'inbody', metrics: { weight: 180 }, units: { weight: 'lbs' } }
  assert.equal(convertReport(scan, unitFor), scan)
})
