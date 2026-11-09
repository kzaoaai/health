import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isNight, nightDate, parseTimeToHours } from '../sleep.js'

test('parseTimeToHours reads the clock time of an HAE timestamp', () => {
  assert.equal(parseTimeToHours('2026-07-08 23:10:30 -0600'), 23.175)
  assert.ok(isNaN(parseTimeToHours('')))
  assert.ok(isNaN(parseTimeToHours(undefined)))
})

test('an evening start belongs to the next day, whatever its length', () => {
  assert.equal(nightDate('2026-11-05 22:40:00 +0200', '2026-11-06 06:10:00 +0200', 7), '2026-11-06')
  assert.equal(nightDate('2026-11-05 19:00:00 +0200', '2026-11-05 20:00:00 +0200', 1), '2026-11-06')
  assert.equal(nightDate('2026-12-31 23:30:00 +0200', '2027-01-01 07:00:00 +0200', 7), '2027-01-01')
})

test('a start after midnight and before 2 AM belongs to its own day', () => {
  assert.equal(nightDate('2026-11-06 01:15:00 +0200', '2026-11-06 08:00:00 +0200', 6.5), '2026-11-06')
  assert.equal(nightDate('2026-11-06 00:00:00 +0200', '2026-11-06 01:00:00 +0200', 1), '2026-11-06')
})

test('a long sleep that starts after 2 AM is a night, filed under the day it starts', () => {
  assert.equal(nightDate('2026-11-06 04:30:00 +0200', '2026-11-06 11:30:00 +0200', 6.8), '2026-11-06')
  assert.equal(nightDate('2026-11-05 09:00:00 +0200', '2026-11-05 17:00:00 +0200', 3), '2026-11-05')
  assert.equal(nightDate('2026-11-05 18:00:00 +0200', '2026-11-06 02:00:00 +0200', 7.5), '2026-11-05')
})

test('an afternoon sleep that runs past midnight stays on its own day', () => {
  // The pattern that made 18-hour "nights": both of these used to be filed under the 9th.
  assert.equal(nightDate('2025-03-08 15:26:06 +0200', '2025-03-09 03:12:19 +0200', 9.2), '2025-03-08')
  assert.equal(nightDate('2025-03-09 14:12:23 +0200', '2025-03-09 23:53:23 +0200', 9.6), '2025-03-09')
})

test('a short sleep that starts after 2 AM is still a nap', () => {
  assert.equal(nightDate('2026-11-06 14:00:00 +0200', '2026-11-06 15:30:00 +0200', 1.4), null)
  assert.equal(nightDate('2026-11-06 02:00:00 +0200', '2026-11-06 04:59:00 +0200', 2.99), null)
})

test('an unreadable start is never a night', () => {
  assert.equal(nightDate('', '2026-11-06 08:00:00 +0200', 8), null)
  assert.equal(isNight(NaN, 8), false)
})

test('isNight applies the same rule to a summarized point', () => {
  assert.equal(isNight(23.5, 0.5), true)
  assert.equal(isNight(1.9, 0.5), true)
  assert.equal(isNight(4.6, 7), true)
  assert.equal(isNight(13, 2), false)
})
