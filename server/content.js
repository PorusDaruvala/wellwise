// The live library: the built content file plus any packs an administrator added on this server.
// Pack checks mirror scripts/build.py. Keep the two in step.
const fs = require('node:fs');
const path = require('node:path');
const E = require('../src/engine.js');

const GRADES = ['Strong', 'Moderate', 'Limited', 'Safety practice'];
const EDGE_TYPES = ['complements', 'reinforces', 'shared-goal', 'depends-on', 'potential-conflict'];
const STATUS = ['draft', 'live', 'retired'];
const FAMILIARITY = ['common', 'lesser-known'];

function nextId(used) { const n = used.reduce((m, i) => Math.max(m, parseInt(String(i).slice(3)) || 0), 0) + 1; return 'ww-' + String(n).padStart(3, '0') }

function normalizeTip(raw, content, used, today) {
  const t = { ...raw }, cat = content.CATEGORIES.find(c => c.name === t.category);
  if (!t.id) t.id = nextId(used);
  t.scope = t.scope || 'GLOBAL'; t.regions = t.regions || (t.scope === 'GLOBAL' ? [...content.REGIONS] : [t.scope]);
  t.status = t.status || 'live'; t.added = t.added || today; t.triggerKeys = t.triggerKeys || []; t.notes = t.notes || {};
  t.familiarity = t.familiarity || 'lesser-known';
  t.review = t.review || { status: 'not-reviewed', by: null, date: null }; t.sourceLevel = t.sourceLevel || 'tip'; t.sourceChecked = t.sourceChecked || today;
  if (cat) { t.grade = t.grade || cat.defaultGrade; t.timeline = t.timeline || cat.defaultTimeline; const extra = (t.tags || []).filter(x => x !== cat.tag); t.tags = [cat.tag, ...extra]; t.concepts = [cat.concept, ...extra] }
  return t;
}

function validatePack(pack, content, today = new Date().toISOString().slice(0, 10)) {
  const errors = [], warnings = [], used = content.TIPS.map(t => t.id), tips = [];
  const titles = Object.fromEntries(content.TIPS.map(t => [t.title.toLowerCase(), t.id]));
  const events = E.allEvents(content);
  if (!pack || !Array.isArray(pack.tips)) return { tips, edges: [], errors: ['The file needs a "tips" list.'], warnings };
  for (const raw of pack.tips) {
    const t = normalizeTip(raw, content, used, today), tid = t.id; used.push(tid); tips.push(t);
    for (const f of ['title', 'category', 'action', 'why', 'caution']) if (!t[f]) errors.push(`${tid}: missing "${f}"`);
    if (!Array.isArray(t.sources) || !t.sources.length) errors.push(`${tid}: add at least one source`);
    else t.sources.forEach(u => { if (!/^https:\/\//.test(u)) errors.push(`${tid}: source must start with https:// (${u})`) });
    if (!/^ww-\d{3,}$/.test(tid)) errors.push(`${tid}: id must look like ww-201`);
    if (content.TIPS.some(x => x.id === tid) || tips.filter(x => x.id === tid).length > 1) errors.push(`${tid}: id already used`);
    if (!content.CATEGORIES.some(c => c.name === t.category)) errors.push(`${tid}: unknown category "${t.category}"`);
    if (!GRADES.includes(t.grade)) errors.push(`${tid}: unknown evidence grade "${t.grade}"`);
    if (!STATUS.includes(t.status)) errors.push(`${tid}: status must be draft, live or retired`);
    if (!FAMILIARITY.includes(t.familiarity)) errors.push(`${tid}: familiarity must be common or lesser-known`);
    if (t.scope !== 'GLOBAL' && !content.REGIONS.includes(t.scope)) errors.push(`${tid}: unknown region "${t.scope}"`);
    const k = (t.title || '').toLowerCase(); if (titles[k] && titles[k] !== tid) warnings.push(`${tid}: same title as ${titles[k]}`); titles[k] = tid;
    const unk = t.triggerKeys.filter(x => !events.has(x)); if (unk.length) warnings.push(`${tid}: no moment uses ${unk.join(', ')} yet`);
    if (!t.triggerKeys.some(x => events.has(x))) warnings.push(`${tid}: no moment can bring this tip. It shows in the library and as a daily tip only.`);
    if (!t.hi) warnings.push(`${tid}: no Hindi text yet`);
  }
  const ids = new Set([...content.TIPS.map(t => t.id), ...tips.map(t => t.id)]), edges = pack.edges || [];
  for (const e of edges) {
    if (!ids.has(e.a) || !ids.has(e.b)) errors.push(`Link ${e.a}–${e.b}: unknown tip`);
    if (!EDGE_TYPES.includes(e.type)) errors.push(`Link ${e.a}–${e.b}: unknown type "${e.type}"`);
    if (!e.why) errors.push(`Link ${e.a}–${e.b}: missing "why"`);
  }
  return { tips, edges, errors, warnings };
}

function createLibrary(db, file) {
  let base = null, merged = null, mtime = 0;
  function load() {
    const st = fs.statSync(file);
    if (base && st.mtimeMs === mtime) return;
    base = JSON.parse(fs.readFileSync(file, 'utf8')); mtime = st.mtimeMs; merged = null;
  }
  function current() {
    load();
    if (merged) return merged;
    let c = base, latest = 0;
    for (const p of db.packs()) { c = { ...c, TIPS: [...c.TIPS, ...p.body.tips], EDGES: [...c.EDGES, ...p.body.edges] }; latest = Math.max(latest, p.at) }
    const stamp = latest ? +new Date(latest).toISOString().replace(/\D/g, '').slice(0, 12) : 0;
    merged = { ...c, contentVersion: Math.max(+base.contentVersion, stamp) };
    merged.live = merged.TIPS.filter(t => t.status === 'live');
    merged.byId = Object.fromEntries(merged.TIPS.map(t => [t.id, t]));
    return merged;
  }
  function publicJSON() { const { live, byId, ...c } = current(); return c }
  return { current, publicJSON, invalidate() { merged = null }, validate: pack => validatePack(pack, current()) };
}

module.exports = { createLibrary, validatePack, normalizeTip, nextId };
