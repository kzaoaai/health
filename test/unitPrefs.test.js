import { test } from 'node:test'
import assert from 'node:assert/strict'
import { displayMetric, convertEntries, massToLbs, unitsOf, cmToInches } from '../client/src/unitPrefs.js'

const KG = unitsOf({ units: { weight: 'kg', distance: 'km', temperature: 'c' } })
const US = unitsOf(null)

test('masses, distance and temperatures convert both ways', () => {
  assert.deepEqual(displayMetric('weight', 180, KG), { value: 81.6, unit: 'kg' })
  assert.deepEqual(displayMetric('lean_mass', 150, US), { value: 150, unit: 'lbs' })
  assert.deepEqual(displayMetric('distance_miles', 3, KG), { value: 4.83, unit: 'km' })
  assert.deepEqual(displayMetric('body_temp_f', 98.6, KG), { value: 37, unit: '°C' })
  assert.deepEqual(displayMetric('wrist_temp_c', 35.9, US), { value: 96.62, unit: '°F' })
  assert.equal(displayMetric('steps', 9000, KG), null)
  assert.equal(massToLbs(81.6, KG), 179.9)
  assert.equal(massToLbs(180, US), 180)
  assert.equal(cmToInches(178), 70)
})

test('entries convert only the metrics with a unit choice', () => {
  const rows = [{ date: '2026-01-01', weight: 200, bmi: 27, steps: 5000 }]
  assert.deepEqual(convertEntries(rows, KG), [{ date: '2026-01-01', weight: 90.7, bmi: 27, steps: 5000 }])
  assert.equal(convertEntries(rows, US)[0], rows[0])               // nothing to convert: same object
})
