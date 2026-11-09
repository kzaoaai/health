import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isNight, nightDate, nightSpans, parseTimeToHours, nightHour, isClippedTail } from '../sleep.js'

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

test('a payload clears only the days of the nights it writes', () => {
  // An evening start on the 10th is the 11th's night: the 10th's own night is not in the
  // payload and must not be cleared.
  const spans = nightSpans([
    { src: 'Watch', ownerDate: '2026-03-11' },
    { src: 'Watch', ownerDate: '2026-03-13' },
    { src: 'Watch', ownerDate: '2026-03-12' },
    { src: 'Ring', ownerDate: '2026-03-12' },
  ])
  assert.deepEqual(spans.get('Watch'), ['2026-03-11', '2026-03-13'])
  assert.deepEqual(spans.get('Ring'), ['2026-03-12', '2026-03-12'])
  assert.equal(nightSpans([]).size, 0)
})

test('nightHour puts a late wake after an early one, and an evening wake before both', () => {
  assert.ok(nightHour(12.5) > nightHour(7))   // a 12:30 wake is later than 07:00
  assert.ok(nightHour(23.5) < nightHour(7))   // an evening "wake" is not
  assert.ok(nightHour(23) < nightHour(1))     // 23:00 bedtime is earlier than 01:00
})

test('the tail of a stored evening night is recognised and not written', () => {
  const stored = { bedtime: 22.5, sleep_hours: 8 }
  assert.equal(isClippedTail(stored, { bedtime: 0.17, sleep_hours: 6.33 }), true)
  // A genuinely shorter night still starts in the evening, so it lands.
  assert.equal(isClippedTail(stored, { bedtime: 23, sleep_hours: 5 }), false)
  // A longer one lands too, as does anything with no stored night.
  assert.equal(isClippedTail(stored, { bedtime: 0.5, sleep_hours: 9 }), false)
  assert.equal(isClippedTail({}, { bedtime: 0.17, sleep_hours: 6 }), false)
  // A stored night that began after midnight is never protected.
  assert.equal(isClippedTail({ bedtime: 4.2, sleep_hours: 7 }, { bedtime: 6, sleep_hours: 4 }), false)
})
