// Which sleep sessions count as a night, and which night they belong to.
//
// A session that starts between 7 PM and 2 AM is a night, whatever its length: one that
// starts in the evening belongs to the next day, one that starts after midnight to its own
// day. A session that starts at any other hour used to be skipped as a nap, which threw
// away every night of anyone who goes to bed after 2 AM or sleeps by day. It now counts as
// a night when it holds at least MIN_NIGHT_SLEEP_HOURS of sleep, and belongs to the day it
// ends on: the day you wake up, which is what the evening rule gives too. A shorter one is
// still a nap.

export const NIGHT_STARTS_AT = 19
export const NIGHT_STARTS_BY = 2
export const MIN_NIGHT_SLEEP_HOURS = 3

// Parse "2026-07-08 23:10:31 -0600" → decimal hours (23.175)
export function parseTimeToHours(str) {
  if (!str || typeof str !== 'string') return NaN
  const m = str.match(/(\d{2}):(\d{2}):(\d{2})/)
  if (!m) return NaN
  return parseInt(m[1]) + parseInt(m[2]) / 60 + parseInt(m[3]) / 3600
}

function startsInNightWindow(startH) {
  return startH >= NIGHT_STARTS_AT || startH < NIGHT_STARTS_BY
}

// startH: the session's start as decimal hours; asleepHours: its time asleep, awake excluded.
export function isNight(startH, asleepHours) {
  if (isNaN(startH)) return false
  return startsInNightWindow(startH) || asleepHours >= MIN_NIGHT_SLEEP_HOURS
}

// The YYYY-MM-DD a session from `start` to `end` (HAE timestamps) is filed under, or null
// when it is a nap or has no readable start.
export function nightDate(start, end, asleepHours) {
  const startH = parseTimeToHours(start)
  if (!isNight(startH, asleepHours)) return null
  if (startH >= NIGHT_STARTS_AT) {
    const d = new Date(start.slice(0, 10) + 'T00:00:00')
    d.setDate(d.getDate() + 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  if (startH < NIGHT_STARTS_BY) return start.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}/.test(end ?? '') ? end.slice(0, 10) : null
}
