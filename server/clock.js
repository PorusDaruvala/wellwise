// Each person's own clock. Scheduled tips and calendar times follow their time zone, not the server's.
const WEEKDAY = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function validZone(tz) { try { if (!tz) return undefined; new Intl.DateTimeFormat('en', { timeZone: tz }); return tz } catch (e) { return undefined } }

function parts(tz, ms) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: validZone(tz), year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', weekday: 'short' });
  return Object.fromEntries(f.formatToParts(new Date(ms)).map(x => [x.type, x.value]));
}

/* Date, hour and weekday where the person is. */
function local(tz, ms = Date.now()) {
  const p = parts(tz, ms);
  return { date: `${p.year}-${p.month}-${p.day}`, hour: +p.hour, weekday: WEEKDAY[p.weekday] };
}

/* Milliseconds the zone is ahead of UTC at that moment. */
function offset(tz, ms) {
  const p = parts(tz, ms);
  return Date.UTC(+p.year, p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(ms / 1000) * 1000;
}

/* A wall-clock time in a zone → UTC milliseconds. */
function zonedToUtc(y, mo, d, h, mi, s, tz) {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  let t = guess - offset(tz, guess);
  const again = guess - offset(tz, t);
  return again !== t ? again : t;
}

function shortDate(ms, tz) {
  return new Date(ms).toLocaleDateString('en-GB', { timeZone: validZone(tz), weekday: 'short', day: 'numeric', month: 'short' });
}

module.exports = { local, offset, zonedToUtc, shortDate, validZone };
