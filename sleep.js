// Which sleep sessions count as a night, and which night they belong to.
//
// A session that starts between 7 PM and 2 AM is a night, whatever its length: one that
// starts in the evening belongs to the next day, one that starts after midnight to its own
// day. A session that starts at any other hour used to be skipped as a nap, which threw
// away every night of anyone who goes to bed after 2 AM or sleeps by day. It now counts as
// a night when it holds at least MIN_NIGHT_SLEEP_HOURS of sleep, and belongs to the day it
// starts on. (It was filed under the day it ended until 2026-11-09: a sleep from 3 PM to
// 3 AM then landed on the next day, on top of that day's own sleep, which made 15–20 hour
// "nights" and left the day before empty.) A shorter one is still a nap.
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

// The YYYY-MM-DD a session starting at `start` (an HAE timestamp) is filed under, or null
// when it is a nap or has no readable start. `end` is not needed since 2026-11-09 and is
// accepted so callers need not change.
export function nightDate(start, end, asleepHours) {
  const startH = parseTimeToHours(start)
  if (!isNight(startH, asleepHours)) return null
  if (!/^\d{4}-\d{2}-\d{2}/.test(start)) return null
  if (startH >= NIGHT_STARTS_AT) {
    const d = new Date(start.slice(0, 10) + 'T00:00:00')
    d.setDate(d.getDate() + 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  return start.slice(0, 10)
}

// The days a sleep payload rewrites, per source: { src → [first, last] }, from the nights
// it will write ({ src, ownerDate }). A re-send clears a source's rows on those days first,
// so a night an older rule filed on another day does not linger. The span comes from the
// nights, not from the intervals' own dates: a payload whose first interval starts on day
// D (an evening start, which is D+1's night, or a nap) would otherwise clear D's night
// without writing it again.
export function nightSpans(nights) {
  const spans = new Map()
  for (const { src, ownerDate } of nights) {
    const span = spans.get(src)
    if (!span) spans.set(src, [ownerDate, ownerDate])
    else {
      if (ownerDate < span[0]) span[0] = ownerDate
      if (ownerDate > span[1]) span[1] = ownerDate
    }
  }
  return spans
}

// A clock hour on one axis for a night that crosses midnight, so sources can be compared
// on "earlier" and "later": hours from 18:00 keep their value, earlier hours become
// 24..42. The boundary is 18:00 rather than noon because a wake at 12:30 must still beat
// one at 07:00. Since daytime sleeps count as nights, a bedtime can fall anywhere; two
// sources only disagree across the boundary when they put the same sleep on either side
// of 18:00, and then the later one is read as earlier.
export function nightHour(v) {
  return v < 18 ? v + 24 : v
}

// Whether an incoming night is only the tail of one already stored, as an export window
// that opens after midnight delivers: the stored night began in the evening, the incoming
// one did not, and the incoming one is no longer. Writing it would cut the night short and
// move bedtime to the window's start. Deliberately narrow: a genuinely shorter night
// still begins in the evening, so a correction still lands. stored/incoming are
// { bedtime, sleep_hours } with bedtime in decimal hours.
export function isClippedTail(stored, incoming) {
  if (stored?.bedtime == null || stored.sleep_hours == null) return false
  if (incoming?.bedtime == null || isNaN(incoming.bedtime)) return false
  return nightHour(stored.bedtime) < 24 && nightHour(incoming.bedtime) >= 24 &&
    incoming.sleep_hours <= stored.sleep_hours
}
