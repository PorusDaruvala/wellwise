/* Wellwise engine: matching and ranking. One copy, used by the app (inlined at build time) and by the server.
   Rules here are product decisions. Change them only with a matching entry in docs/DECISIONS.md. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.WWEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const DAY = 864e5;
  const DIET_BOOST = { Vegan: ['ww-104', 'ww-020', 'ww-009', 'ww-003'], Vegetarian: ['ww-104', 'ww-020', 'ww-009'] };

  function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619); return h >>> 0 }
  const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const hasWord = (text, k) => new RegExp('(^|[^a-z0-9])' + escRe(k.toLowerCase()) + '([^a-z0-9]|$)').test(text);

  /* The product whose longest keyword appears in the text, on word boundaries. */
  function matchProduct(products, text) {
    const s = String(text || '').toLowerCase(); let best = null, len = 0;
    for (const p of products) for (const k of p.keywords) if (k.length > len && hasWord(s, k)) { best = p; len = k.length }
    return best;
  }

  /* Every product and moment named in a piece of text. Used for links, messages, calendar entries and documents. */
  function matchText(content, text) {
    const s = String(text || '').toLowerCase(), out = [], seen = new Set();
    const add = (kind, item, k) => { if (seen.has(item.event)) return; seen.add(item.event); out.push({ kind, id: item.id, event: item.event, keyword: k }) };
    const p = matchProduct(content.PRODUCTS, s); if (p) add('product', p, '');
    for (const pr of content.PRODUCTS) for (const k of pr.keywords) if (hasWord(s, k)) { add('product', pr, k); break }
    // The most specific moment first: "blood test" beats "clinic".
    const hits = [];
    for (const m of content.MOMENTS) { const k = (m.keywords || []).filter(k => hasWord(s, k)).sort((a, b) => b.length - a.length)[0]; if (k) hits.push([m, k]) }
    hits.sort((a, b) => b[1].length - a[1].length).forEach(([m, k]) => add('moment', m, k));
    return out;
  }

  const eligible = (t, prefs) => !prefs.geo || prefs.geo === 'GLOBAL' || t.regions.includes(prefs.geo);

  /* Ranks the tips a moment can bring. Base score 100, then the adjustments listed in docs/ARCHITECTURE.md. */
  function candidates(tips, event, prefs, now) {
    prefs = prefs || {}; const seen = prefs.seen || {}, fb = prefs.feedback || {}, st = prefs.statuses || {}, cats = prefs.cats || [];
    const dayN = Math.floor((now || Date.now()) / DAY);
    const scored = tips.filter(t => t.triggerKeys.includes(event) && eligible(t, prefs)).map(t => {
      let s = 100; const why = [];
      if (seen[t.id]) { s -= 25; why.push('seen before −25') }
      if (cats.length) { if (cats.includes(t.category)) { s += 8; why.push('your interests +8') } else if (prefs.discovery === 'focused') { s -= 15; why.push('outside your interests −15') } }
      if (prefs.discovery === 'exploratory') { const r = hash(t.id + dayN) % 11; s += r; why.push('surprise +' + r) }
      if ((DIET_BOOST[prefs.diet] || []).includes(t.id)) { s += 10; why.push('fits your diet +10') }
      if (fb[t.id] === 'not-useful') { s -= 40; why.push('marked not useful −40') }
      if (fb[t.id] === 'useful') { s += 5; why.push('marked useful +5') }
      if (st[t.id] === 'not-relevant') { s -= 60; why.push('not for me −60') }
      if (st[t.id] === 'adopted') { s -= 20; why.push('already a habit −20') }
      return { t, s, why };
    }).sort((a, b) => b.s - a.s || a.t.id.localeCompare(b.t.id));
    return { scored };
  }

  /* One tip a day, the same all day, from the tips that apply to this person. */
  function dailyTip(tips, prefs, now) {
    prefs = prefs || {}; const cats = prefs.cats || [];
    let a = tips.filter(t => eligible(t, prefs) && (!cats.length || cats.includes(t.category)));
    if (!a.length) a = tips.filter(t => eligible(t, prefs));
    return a[(Math.floor((now || Date.now()) / DAY) * 17 + 31) % a.length];
  }

  /* All event keys any moment or product can raise. */
  function allEvents(content) {
    return new Set([...content.MOMENTS.map(m => m.event), ...content.PRODUCTS.map(p => p.event)]);
  }

  /* Live conditions → moment ids. Thresholds follow the public scales named beside each line. */
  function liveMoments(w) {
    const out = [];
    if (!w) return out;
    if (w.aqi != null && w.aqi >= 101) out.push({ id: 'env-aqi', reason: `US AQI ${Math.round(w.aqi)}` });           // US EPA: 101+ unhealthy for sensitive groups
    if (w.pm25 != null && w.aqi == null && w.pm25 >= 35.5) out.push({ id: 'env-aqi', reason: `PM2.5 ${Math.round(w.pm25)} µg/m³` });
    if (w.tempMax != null && (w.tempMax >= 35 || (w.apparentMax != null && w.apparentMax >= 38))) out.push({ id: 'env-heat', reason: `Up to ${Math.round(w.tempMax)}°C` });
    if (w.uvMax != null && w.uvMax >= 6) out.push({ id: 'env-uv', reason: `UV index ${Math.round(w.uvMax)}` });   // WHO: 6+ high
    if (w.precip != null && w.precip >= 20) out.push({ id: 'env-monsoon', reason: `${Math.round(w.precip)} mm of rain expected` });
    if (w.humidity != null && w.humidity >= 80 && w.tempMax != null && w.tempMax >= 12) out.push({ id: 'env-damp', reason: `Humidity ${Math.round(w.humidity)}%` });
    if (w.tempMax != null && w.tempMax <= 8) out.push({ id: 'env-cold', reason: `High of ${Math.round(w.tempMax)}°C` });
    if (w.pollen != null && w.pollen >= 50) out.push({ id: 'env-pollen', reason: 'High pollen' });
    return out;
  }

  /* IANA time zone → Wellwise region. */
  function regionFromTimezone(tz) {
    tz = String(tz || '');
    if (/^Asia\/(Kolkata|Calcutta)$/.test(tz)) return 'IN';
    if (/^Europe\/(London|Belfast)$/.test(tz)) return 'GB';
    if (/^America\/(New_York|Chicago|Denver|Los_Angeles|Phoenix|Anchorage|Detroit|Boise|Indiana|Kentucky|North_Dakota|Juneau|Sitka|Adak|Menominee|Nome)/.test(tz) || /^Pacific\/Honolulu$/.test(tz)) return 'US';
    return tz ? 'OTHER' : 'GLOBAL';
  }

  return { DAY, DIET_BOOST, hash, matchProduct, matchText, candidates, dailyTip, eligible, allEvents, liveMoments, regionFromTimezone };
});
