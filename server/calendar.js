// Calendar feeds (iCalendar / .ics). Google, Outlook and Apple calendars all publish a private .ics address.
const E = require('../src/engine.js');

function unfold(s) { return s.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '') }
function unescape(s) { return String(s || '').replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').trim() }
function toMs(v) {
  if (!v) return null;
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?/);
  if (!m) return null;
  const [, y, mo, d, h = '00', mi = '00', s = '00', z] = m;
  // Times with a TZID are read as server-local time. Good enough to know which day and part of the day.
  return z ? Date.UTC(+y, mo - 1, +d, +h, +mi, +s) : new Date(+y, mo - 1, +d, +h, +mi, +s).getTime();
}

function parse(text) {
  const out = [];
  const lines = unfold(String(text)).split(/\r?\n/);
  let cur = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { cur = {}; continue }
    if (line === 'END:VEVENT') { if (cur && cur.start) out.push(cur); cur = null; continue }
    if (!cur) continue;
    const i = line.indexOf(':'); if (i < 0) continue;
    const key = line.slice(0, i).split(';')[0].toUpperCase(), val = line.slice(i + 1), allDay = /VALUE=DATE(?!-)/.test(line.slice(0, i));
    if (key === 'UID') cur.uid = val;
    else if (key === 'SUMMARY') cur.title = unescape(val);
    else if (key === 'LOCATION') cur.location = unescape(val);
    else if (key === 'DESCRIPTION') cur.description = unescape(val).slice(0, 500);
    else if (key === 'DTSTART') { cur.start = toMs(val); cur.allDay = allDay || /^\d{8}$/.test(val) }
    else if (key === 'DTEND') cur.end = toMs(val);
    else if (key === 'STATUS') cur.status = val;
  }
  return out.filter(e => e.status !== 'CANCELLED').map(e => ({ ...e, uid: e.uid || `${e.start}-${e.title}`, end: e.end || e.start + 3600e3 }));
}

const CAL_SOURCES = new Set(['calendar', 'prompt', 'environment']);
/* Each event → at most one moment. Late finishes and packed days are found from the times, not just the words. */
function classify(content, events, { from = Date.now() - 864e5, to = Date.now() + 14 * 864e5 } = {}) {
  const out = [], byDay = {};
  for (const e of events) {
    if (e.start < from || e.start > to) continue;
    const text = [e.title, e.location, e.description].filter(Boolean).join(' \n ');
    const hit = E.matchText({ PRODUCTS: [], MOMENTS: content.MOMENTS.filter(m => CAL_SOURCES.has(m.source)) }, text)[0];
    let moment = hit ? hit.id : null;
    const endH = new Date(e.end).getHours(), startH = new Date(e.start).getHours();
    if (!moment && !e.allDay && (endH >= 23 || (endH < 4 && e.end > e.start + 3600e3) || startH >= 21)) moment = 'cal-late';
    if (moment) out.push({ uid: e.uid, start: e.start, title: e.title, moment });
    if (!e.allDay) { const d = new Date(e.start).toDateString(); (byDay[d] = byDay[d] || []).push(e) }
  }
  for (const [d, list] of Object.entries(byDay)) {
    const hours = list.reduce((s, e) => s + Math.min(e.end - e.start, 4 * 3600e3), 0) / 3600e3;
    const wd = new Date(d).getDay();
    if (hours >= 5 && wd > 0 && wd < 6 && !out.some(o => o.moment === 'cal-desk' && new Date(o.start).toDateString() === d)) {
      const first = list.sort((a, b) => a.start - b.start)[0];
      out.push({ uid: 'desk-' + d, start: first.start, title: `${Math.round(hours)} hours of meetings`, moment: 'cal-desk' });
    }
  }
  return out.filter(o => content.MOMENTS.some(m => m.id === o.moment)).sort((a, b) => a.start - b.start);
}

module.exports = { parse, classify };
