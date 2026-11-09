import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildIndex, search, formatValue } from '../client/src/search.js'
import { markerTitle } from '../client/src/markers.js'

// Made-up data in the shapes the dashboard's GET endpoints return.
const data = {
  body: { entries: [
    { date: '2026-01-02', weight: 181.2, bmi: 24.9 },
    { date: '2026-02-01', weight: 179.4, bmi: 24.6 },
  ] },
  sleep: { entries: [{ date: '2026-02-01', sleep_hours: 7.25, deep_sleep_hours: 1.1 }] },
  heartrate: { entries: [{ date: '2026-02-01', resting_heart_rate: 58, hrv: 61 }] },
  blood: {
    entries: [
      { date: '2025-06-01', hdl: 48, ldl: 120, total_cholesterol: 190, alt: 22, mpv: 9.8 },
      { date: '2026-01-15', hdl: 41, ldl: 165, total_cholesterol: 230 },
    ],
    markers: { hdl: { unit: 'mg/dL', range_low: 40 }, ldl: { unit: 'mg/dL', range_high: 130 }, total_cholesterol: { unit: 'mg/dL' } },
  },
  appleHealth: { entries: [
    { date: '2026-02-01', steps: 8421, walking_heart_rate_average: 96, vo2_max: 41.3 },
  ] },
}
const index = buildIndex(data, new Set(['dna']))
const top = (q, n = 1) => search(index, q).slice(0, n).map(r => r.id)

test('a section name finds the section first', () => {
  assert.deepEqual(top('body'), ['section:body'])
  assert.deepEqual(top('Heart rate'), ['section:heartrate'])
  assert.deepEqual(top('labs'), ['section:labs'])
})

test('a metric name finds its card, with its newest value', () => {
  const [w] = search(index, 'weight')
  assert.equal(w.id, 'card:body:weight')
  assert.equal(w.target, 'm-body-weight')
  assert.deepEqual(w.value, { text: '179.4', unit: 'lbs', date: '2026-02-01', status: null })
  assert.deepEqual(top('bmi'), ['card:body:bmi'])
})

test('a lab marker is found by its name, its abbreviation or what people call it', () => {
  for (const q of ['HDL', 'hdl', 'good cholesterol']) assert.deepEqual(top(q), ['metric:labs:hdl'], q)
  const [hdl] = search(index, 'hdl')
  assert.equal(hdl.label, 'HDL')
  assert.equal(hdl.where, 'Labs · Heart Health')
  assert.deepEqual(hdl.value, { text: '41', unit: 'mg/dL', date: '2026-01-15', status: 'normal' })
  assert.equal(search(index, 'ldl')[0].value.status, 'out')
  assert.deepEqual(top('sgpt'), ['metric:labs:alt'])
})

test('a group or a broad word lists everything under it', () => {
  const ids = search(index, 'cholesterol').map(r => r.id)
  for (const id of ['group:labs:heart', 'metric:labs:hdl', 'metric:labs:ldl', 'metric:labs:total_cholesterol']) {
    assert.ok(ids.includes(id), id)
  }
  const heart = search(index, 'heart rate').map(r => r.id)
  for (const id of ['card:heartrate:resting_heart_rate', 'card:heartrate:hrv', 'metric:applehealth:walking_heart_rate_average']) {
    assert.ok(heart.includes(id), id)
  }
})

test('spelling slips still find the marker', () => {
  const ids = search(index, 'cholestrol').map(r => r.id)
  assert.ok(ids.includes('metric:labs:total_cholesterol'))
  assert.equal(search(index, 'trigliserides').length, 0)            // no triglycerides in this data
  assert.deepEqual(top('restng heart'), ['card:heartrate:resting_heart_rate'])
})

test('markers with no data are not listed, and hidden sections are flagged', () => {
  assert.equal(search(index, 'tsh').length, 0)
  assert.ok(!index.some(e => e.group === 'hormones'))
  assert.ok(index.some(e => e.id === 'group:labs:other'))
  assert.equal(index.find(e => e.id === 'section:dna').hidden, true)
})

test('an empty query lists the sections', () => {
  assert.deepEqual(search(index, '  ').map(r => r.kind), Array(10).fill('section'))
})

test('names and values read the way a lab report writes them', () => {
  assert.equal(markerTitle('hba1c'), 'HbA1c')
  assert.equal(markerTitle('free_t4'), 'Free T4')
  assert.equal(markerTitle('total_cholesterol_hdl_ratio'), 'Total Cholesterol HDL Ratio')
  assert.equal(formatValue('sleep_hours', 7.25), '7h 15m')
  assert.equal(formatValue('steps', 8421), '8,421')
  assert.equal(formatValue('tsh', 1.234), '1.23')
})
