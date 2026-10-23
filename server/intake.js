// One pipeline for everything people send in: text, links, photos, documents and barcodes.
// Every channel (share, scan, WhatsApp, email, agents) calls interpret(), then pickTip().
const E = require('../src/engine.js');
const { fetchPublic, getJSON } = require('./net.js');
const llm = require('./llm.js');
const ics = require('./calendar.js');

const decode = s => String(s || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/\s+/g, ' ').trim();
const URL_RE = /https?:\/\/[^\s<>"')]+/i;

/* Open Food Facts and its sister databases: free, open product data keyed by barcode. */
const PRODUCT_DBS = ['https://world.openfoodfacts.org', 'https://world.openbeautyfacts.org', 'https://world.openproductsfacts.org'];
async function lookupBarcode(db, code) {
  code = String(code || '').replace(/\D/g, '');
  if (code.length < 8 || code.length > 14) return null;
  const cached = db?.cacheGet('bc:' + code); if (cached !== undefined) return cached;
  let found = null;
  for (const base of PRODUCT_DBS) {
    try {
      const j = await getJSON(`${base}/api/v2/product/${code}.json?fields=product_name,brands,categories,categories_tags,ingredients_text,additives_tags,nova_group,nutriscore_grade,quantity`);
      if (j && j.status === 1 && j.product) {
        const p = j.product;
        found = { barcode: code, name: p.product_name || '', brand: p.brands || '', categories: p.categories || (p.categories_tags || []).map(c => c.replace(/^\w\w:/, '').replace(/-/g, ' ')).join(', '),
          ingredients: p.ingredients_text || '', additives: (p.additives_tags || []).map(a => a.replace(/^\w\w:/, '')), nova: p.nova_group || null, nutriscore: p.nutriscore_grade || null, quantity: p.quantity || '', db: new URL(base).hostname };
        break;
      }
    } catch (e) { /* try the next database */ }
  }
  db?.cacheSet('bc:' + code, found, found ? 30 * 864e5 : 864e5);
  return found;
}

/* Title, description and product data from a web page. */
function readPage(html, pageUrl) {
  const meta = (re) => { const m = html.match(re); return m ? decode(m[1]) : '' };
  const out = {
    title: meta(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i) || meta(/<title[^>]*>([^<]+)/i),
    description: meta(/<meta[^>]+(?:name|property)=["'](?:og:)?description["'][^>]+content=["']([^"']+)/i),
    gtin: null, product: null,
  };
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const walk = n => { if (!n || typeof n !== 'object') return; if (Array.isArray(n)) return n.forEach(walk); const t = [].concat(n['@type'] || []);
        if (t.includes('Product') && !out.product) { out.product = decode([n.name, n.brand?.name || n.brand, n.category].filter(x => typeof x === 'string').join(' · ')); out.gtin = n.gtin13 || n.gtin12 || n.gtin || n.gtin8 || null }
        Object.values(n).forEach(walk) };
      walk(JSON.parse(m[1]));
    } catch (e) { /* bad JSON-LD is common */ }
  }
  // Shop URLs often carry the product name in the path, which helps when a page blocks robots.
  try { out.slug = decodeURIComponent(new URL(pageUrl).pathname).replace(/\/(dp|p|ip|product|products|item)\/.*$/i, '').replace(/[-_/+.]+/g, ' ').replace(/\b[a-z0-9]{10,}\b/gi, '').trim() } catch (e) { out.slug = '' }
  return out;
}

function matchesFrom(content, text, why) {
  return E.matchText(content, text).map(m => ({ ...m, why }));
}
function label(content, m) {
  const item = m.kind === 'product' ? content.PRODUCTS.find(p => p.id === m.id) : content.MOMENTS.find(x => x.id === m.id);
  return item ? item.name : m.event;
}
function fromEvents(content, keys, why) {
  return keys.map(k => { const p = content.PRODUCTS.find(x => x.event === k); const mo = content.MOMENTS.find(x => x.event === k);
    return p ? { kind: 'product', id: p.id, event: k, why } : mo ? { kind: 'moment', id: mo.id, event: k, why } : null }).filter(Boolean);
}
function uniq(ms) { const s = new Set(); return ms.filter(m => !s.has(m.event) && s.add(m.event)) }

/* input: { text?, url?, barcode?, image?: {data, mediaType}, doc?: {data, mediaType, name} } (data is base64) */
async function interpret(content, input, db) {
  const out = { kind: 'text', summary: '', product: null, matches: [], events: [], read: [] };
  let text = String(input.text || '').trim();
  let url = input.url || (text.match(URL_RE) || [])[0] || null;
  const parts = [];

  if (input.barcode) {
    out.kind = 'barcode';
    const p = await lookupBarcode(db, input.barcode);
    if (p) { out.product = p; out.summary = [p.brand, p.name].filter(Boolean).join(' ') || 'Product ' + p.barcode; out.read.push(p.db) }
    else out.summary = 'Barcode ' + String(input.barcode).replace(/\D/g, '');
  }

  if (url) {
    out.kind = input.barcode ? out.kind : 'link';
    try {
      const page = await fetchPublic(url);
      if (/text\/calendar/.test(page.type) || /^BEGIN:VCALENDAR/m.test(page.body.slice(0, 200).toString())) {
        out.calendar = ics.parse(page.body.toString('utf8'));
      } else if (/pdf/.test(page.type)) {
        parts.push({ type: 'pdf', data: page.body.toString('base64') });
      } else {
        // An error page tells us nothing, but the address the person shared often still names the product.
        const info = page.status < 400 ? readPage(page.body.toString('utf8'), page.url) : {};
        const slug = readPage('', url).slug;
        out.summary = out.summary || info.product || info.title || slug || new URL(page.url).hostname;
        text = [text.replace(url, ''), info.product, info.title, info.description, info.slug, slug].filter(Boolean).join(' \n ');
        if (info.gtin && !out.product) { const p = await lookupBarcode(db, info.gtin); if (p) out.product = p }
        out.read.push(new URL(page.url).hostname);
      }
    } catch (e) {
      out.note = 'We could not open that link, so we read its address instead.';
      try { const u = new URL(url); text += ' ' + readPage('', u.href).slug; out.summary = out.summary || u.hostname } catch (_) { }
    }
  }

  if (input.image) { out.kind = 'photo'; parts.push({ type: 'image', data: input.image.data, mediaType: input.image.mediaType || 'image/jpeg' }) }
  if (input.doc) {
    out.kind = 'document';
    const mt = input.doc.mediaType || '', name = input.doc.name || '';
    if (/pdf/.test(mt) || /\.pdf$/i.test(name)) parts.push({ type: 'pdf', data: input.doc.data });
    else if (/^image\//.test(mt)) parts.push({ type: 'image', data: input.doc.data, mediaType: mt });
    else {
      const body = Buffer.from(input.doc.data, 'base64').toString('utf8');
      if (/calendar/.test(mt) || /\.ics$/i.test(name) || /^BEGIN:VCALENDAR/m.test(body.slice(0, 200))) out.calendar = ics.parse(body);
      else text += '\n' + body.replace(/<[^>]+>/g, ' ').slice(0, 40000);
    }
    out.summary = out.summary || name;
  }

  if (out.product) {
    const p = out.product;
    out.matches.push(...matchesFrom(content, [p.name, p.categories].join(' \n '), 'product'));
    if (/sweetener|aspartame|sucralose|acesulfame|steviol|saccharin/i.test(p.ingredients + ' ' + p.additives.join(' '))) out.matches.push(...fromEvents(content, ['grocery:sweetener'], 'ingredients'));
  }
  if (out.calendar) {
    out.kind = 'calendar';
    for (const ev of ics.classify(content, out.calendar)) out.matches.push({ kind: 'moment', id: ev.moment, event: content.MOMENTS.find(m => m.id === ev.moment).event, why: 'calendar', title: ev.title, start: ev.start });
    out.summary = out.summary || `${out.calendar.length} calendar entries`;
  }
  if (text.trim()) { out.matches.push(...matchesFrom(content, text, 'text')); out.summary = out.summary || text.trim().slice(0, 80) }

  // Photos, PDFs and text that keywords cannot place go to Claude, limited to known event keys.
  if (parts.length || (!out.matches.length && text.trim().length > 12 && input.allowModel !== false)) {
    const r = await llm.read(content, parts.length ? [...parts, ...(text.trim() ? [{ type: 'text', text }] : [])] : [{ type: 'text', text }]);
    if (r) {
      out.read.push('Claude');
      if (r.summary && (!out.summary || parts.length)) out.summary = r.summary;
      if (r.barcode && !out.product) { const p = await lookupBarcode(db, r.barcode); if (p) { out.product = p; out.matches.unshift(...matchesFrom(content, [p.name, p.categories].join(' \n '), 'product')) } }
      if (r.product_name) out.matches.push(...matchesFrom(content, r.product_name, 'photo'));
      out.matches.push(...fromEvents(content, r.events, 'model'));
      out.docKind = r.kind;
    } else if (parts.length && !out.matches.length) {
      out.note = out.note || (input.image ? 'We could not read this photo. Try a photo of the barcode or the label.' : 'We could not read this document.');
    }
  }
  out.matches = uniq(out.matches).map(m => ({ ...m, label: label(content, m) }));
  out.events = out.matches.map(m => m.event);
  return out;
}

/* The best tip across the matches, using this person's preferences. */
function pickTip(content, matches, prefs) {
  for (const m of matches) {
    const top = E.candidates(content.live, m.event, prefs || {}).scored[0];
    if (top) return { match: m, tip: top.t, why: top.why };
  }
  return null;
}

function friendly(content, match) {
  if (!match) return '';
  if (match.kind === 'product') { const p = content.PRODUCTS.find(x => x.id === match.id); return p ? `Something useful about ${p.object}.` : '' }
  const m = content.MOMENTS.find(x => x.id === match.id); return m ? m.friendly : '';
}

module.exports = { interpret, pickTip, friendly, lookupBarcode, readPage };
