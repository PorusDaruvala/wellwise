// Wellwise server: the app, its API, integrations and the admin console. Node 22.5+ and one dependency.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const E = require('../src/engine.js');
const { open } = require('./db.js');
const { createLibrary } = require('./content.js');
const intake = require('./intake.js');
const live = require('./live.js');
const ics = require('./calendar.js');
const wa = require('./whatsapp.js');
const llm = require('./llm.js');
const { fetchPublic } = require('./net.js');
const oauth = require('./oauth.js');
const clock = require('./clock.js');
const pushMod = require('./push.js');
const authMod = require('./auth.js');

const ROOT = path.join(__dirname, '..');
const STATIC = { '/': 'index.html', '/index.html': 'index.html', '/admin': 'admin.html', '/manifest.webmanifest': 'manifest.webmanifest', '/sw.js': 'sw.js', '/icon.svg': 'icon.svg', '/icon-192.png': 'icon-192.png', '/icon-512.png': 'icon-512.png', '/vendor/zxing.min.js': 'vendor/zxing.min.js', '/vendor/zxing-LICENSE.txt': 'vendor/zxing-LICENSE.txt' };
const TYPES = { '.png': 'image/png', '.txt': 'text/plain; charset=utf-8', '.html': 'text/html; charset=utf-8', '.webmanifest': 'application/manifest+json', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json' };
const SOURCE_LABEL = { share: 'Share', scan: 'Scan', photo: 'Photo', document: 'Document', calendar: 'Calendar', environment: 'Near you', whatsapp: 'WhatsApp', email: 'Email', agent: 'Your agent', daily: 'Daily tip', weekly: 'Weekly tip', checkin: 'Check-in', prompt: 'Quick check-in' };

function createApp(opts = {}) {
  const dist = opts.dist || path.join(ROOT, 'dist');
  // On Railway, data goes on the attached volume wherever it is mounted. Without a volume, every redeploy wipes it.
  const onRailway = !!(process.env.RAILWAY_ENVIRONMENT_NAME || process.env.RAILWAY_PROJECT_ID);
  const volume = process.env.RAILWAY_VOLUME_MOUNT_PATH;
  const dbFile = opts.db || (volume ? path.join(volume, 'wellwise.db') : process.env.WELLWISE_DB || path.join(ROOT, 'data', 'wellwise.db'));
  const storage = opts.db === ':memory:' ? 'memory' : onRailway ? (volume ? 'persistent' : 'temporary') : 'local disk';
  if (storage === 'temporary') console.error('WARNING: no Railway volume is attached. Accounts, journeys and notification sign-ups are wiped on every redeploy. Attach a volume to this service.');
  const db = open(dbFile);
  const lib = createLibrary(db, opts.content || path.join(dist, 'wellwise-content.json'));
  const adminToken = opts.adminToken ?? process.env.WELLWISE_ADMIN_TOKEN ?? '';
  const oa = oauth.setup(db);
  const auth = authMod.setup(db, opts.sendEmail !== undefined ? { sendEmail: opts.sendEmail } : {});
  const signedIn = u => !!(u && (u.email || u.phone));
  /* Make this browser use the person's own Wellwise. An unsigned Wellwise already in this browser is merged into it. */
  function signInAs(req, res, current, { email, phone }) {
    let target = email ? db.userByEmail(email) : db.userByPhone(phone);
    if (!target) {
      target = current && !signedIn(current) ? current : db.createUser();
      db.setField(target.id, email ? 'email' : 'phone', email || phone);
    } else if (current && current.id !== target.id && !signedIn(current)) authMod.mergeAccounts(db, current.id, target.id);
    target = db.userById(target.id);
    res.setHeader('set-cookie', sessionCookie(req, target.token));
    return target;
  }
  const push = pushMod.setup(db, { sender: opts.pushSender, subject: () => /^https:/.test(baseUrl) ? baseUrl : 'mailto:wellwise@example.com' });
  const SECRET = process.env.WELLWISE_SECRET || crypto.randomBytes(32).toString('hex');
  const sign = (...xs) => crypto.createHmac('sha256', SECRET).update(xs.join('|')).digest('hex');
  // The public address, always absolute. "wellwise.example.com" in the settings becomes "https://wellwise.example.com".
  const absolute = u => { u = String(u || '').trim().replace(/\/+$/, ''); return !u ? '' : /^https?:\/\//i.test(u) ? u : 'https://' + u };
  const ENV_URL = absolute(process.env.WELLWISE_PUBLIC_URL);
  const publicUrl = (req) => ENV_URL || `${String(req?.headers['x-forwarded-proto'] || 'http').split(',')[0].trim()}://${req?.headers.host || 'localhost:8787'}`;
  let baseUrl = ENV_URL;
  const tipUrl = id => `${baseUrl}/#tip/${id}`;

  /* ---------- helpers ---------- */
  const send = (res, status, body, headers = {}) => { const json = typeof body !== 'string' && !Buffer.isBuffer(body); res.writeHead(status, { 'content-type': json ? 'application/json' : 'text/plain; charset=utf-8', 'cache-control': 'no-store', ...headers }); res.end(json ? JSON.stringify(body) : body) };
  const fail = (res, status, message) => send(res, status, { error: message });
  const cookies = req => Object.fromEntries((req.headers.cookie || '').split(';').map(c => c.trim().split('=')).filter(x => x[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
  const sessionCookie = (req, token) => `ww=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${400 * 864e2}${(req.headers['x-forwarded-proto'] || '').includes('https') ? '; Secure' : ''}`;
  function readBody(req, limit = 12e6) {
    return new Promise((resolve, reject) => { const chunks = []; let n = 0;
      req.on('data', c => { n += c.length; if (n > limit) { reject(Object.assign(new Error('That file is too large. The limit is 12 MB.'), { status: 413 })); req.destroy() } else chunks.push(c) });
      req.on('end', () => resolve(Buffer.concat(chunks))); req.on('error', reject) });
  }
  async function json(req) { const b = await readBody(req); if (!b.length) return {}; try { return JSON.parse(b) } catch (e) { throw Object.assign(new Error('Bad JSON'), { status: 400 }) } }
  function multipart(buf, type) {
    const b = (type.match(/boundary=("?)([^";]+)\1/) || [])[2]; if (!b) return {};
    const out = {}, sep = Buffer.from('--' + b); let i = buf.indexOf(sep);
    while (i >= 0) { const next = buf.indexOf(sep, i + sep.length); if (next < 0) break;
      const part = buf.slice(i + sep.length + 2, next - 2), h = part.indexOf('\r\n\r\n');
      if (h > 0) { const head = part.slice(0, h).toString(), body = part.slice(h + 4), name = (head.match(/name="([^"]*)"/) || [])[1], file = (head.match(/filename="([^"]*)"/) || [])[1], ct = (head.match(/content-type:\s*([^\r\n]+)/i) || [])[1];
        if (name) out[name] = file !== undefined ? { name: file, mediaType: ct || 'application/octet-stream', data: body.toString('base64') } : body.toString() }
      i = next }
    return out;
  }
  const buckets = new Map();
  function limited(key, perMin) { const now = Date.now(), b = buckets.get(key) || { n: 0, t: now }; if (now - b.t > 60e3) { b.n = 0; b.t = now } b.n++; buckets.set(key, b); return b.n > perMin }

  function me(req, res, create = true) {
    let u = db.userByToken(cookies(req).ww);
    if (!u && create) { u = db.createUser(); res.setHeader('set-cookie', sessionCookie(req, u.token)) }
    if (u) db.touch(u.id);
    return u;
  }
  const prefsOf = u => u.state || {};
  const summaryOf = u => ({
    whatsapp: u.phone ? '•••• ' + u.phone.slice(-4) : null, calendar: !!u.calendar_url, calendarSynced: u.calendar_synced || null,
    agent: !!u.agent_key, email: u.inbound && process.env.WELLWISE_INBOUND_DOMAIN ? `${u.inbound}@${process.env.WELLWISE_INBOUND_DOMAIN}` : null, location: u.lat != null,
  });
  const features = () => ({ signIn: { email: auth.emailEnabled(), whatsapp: wa.enabled() }, photo: llm.enabled(), whatsapp: wa.enabled(), whatsappNumber: wa.env().number || null, email: !!process.env.WELLWISE_INBOUND_DOMAIN, server: true, storage });
  const tipOut = t => t && { id: t.id, title: t.title, action: t.action, why: t.why, caution: t.caution, category: t.category, grade: t.grade, familiarity: t.familiarity, sources: t.sources, url: tipUrl(t.id) };

  /* Save a tip to someone's inbox, and send it on WhatsApp when that is their channel. */
  /* The same trip can reach Wellwise from an agent, the calendar and a forwarded email. Automatic sources send one tip for it:
     never the same tip twice within 30 days, and one tip per kind of moment within 7 days. */
  const AUTO_SOURCES = new Set(['agent', 'calendar', 'email']);
  async function deliver(u, pick, source, { moment, dedupe, message } = {}) {
    const content = lib.current(), event = pick.match?.event || null;
    if (AUTO_SOURCES.has(source) && db.sentRecently(u.id, { tip: pick.tip.id, event }, 30, 7)) return null;
    const item = db.addInbox(u.id, { tip: pick.tip.id, moment: moment || pick.match?.label || SOURCE_LABEL[source], source, via: SOURCE_LABEL[source] || source, message: message ?? intake.friendly(content, pick.match), channel: u.state.channel === 'WhatsApp' && u.phone ? 'WhatsApp' : 'In the app', dedupe: dedupe || null, event });
    if (item && item.channel === 'WhatsApp' && source !== 'whatsapp') await wa.deliver(u, pick.tip, item.message, tipUrl(pick.tip.id)).catch(e => console.error(e.message));
    // A notification on every device the person allowed (not for WhatsApp replies: they are already in the chat).
    if (item && source !== 'whatsapp') await push.notify(u.id, { title: pick.tip.title, body: [item.message, pick.tip.action].filter(Boolean).join(' · '), url: '/#tip/' + pick.tip.id, tag: item.id }).catch(e => console.error('push', e.message));
    return item;
  }
  async function runIntake(u, input, source) {
    const content = lib.current();
    const r = await intake.interpret(content, input, db);
    const pick = intake.pickTip(content, r.matches, prefsOf(u));
    const result = { ...r, tip: pick ? pick.tip.id : null, match: pick ? pick.match : null, why: pick ? pick.why : [], friendly: pick ? intake.friendly(content, pick.match) : '' };
    result.id = db.addIntake(u.id, source, r.kind, r.summary, result);
    return { result, pick };
  }

  /* ---------- calendar ---------- */
  async function syncCalendar(u) {
    const page = await fetchPublic(u.calendar_url.replace(/^webcal:/i, 'https:'), { maxBytes: 5e6 });
    if (page.status >= 400) throw new Error('The calendar address returned an error');
    const events = ics.parse(page.body.toString('utf8'), u.state.tz);
    if (!events.length && !/BEGIN:VCALENDAR/.test(page.body.slice(0, 500).toString())) throw new Error('That address is not a calendar feed (.ics)');
    const found = ics.classify(lib.current(), events, { tz: u.state.tz });
    db.clearCal(u.id);
    for (const e of found) db.upsertCalEvent(u.id, e);
    db.setField(u.id, 'calendar_synced', Date.now());
    return { events: events.length, moments: found };
  }

  /* ---------- scheduler: calendar, near you, daily tips, check-ins ---------- */
  async function tick() {
    const content = lib.current();
    for (const u of db.allUsers()) {
      const s = u.state || {}, freq = s.frequency || 'both', here = clock.local(s.tz);
      try {
        if (u.calendar_url && (!u.calendar_synced || Date.now() - u.calendar_synced > 30 * 60e3)) await syncCalendar(u).catch(e => console.error('calendar', u.id, e.message));
        if (freq !== 'off' && freq !== 'daily' && freq !== 'weekly') {
          for (const e of u.calendar_url ? db.calEvents(u.id, Date.now() - 2 * 3600e3) : []) {
            if (e.start > Date.now() + 24 * 3600e3) continue;
            const m = content.MOMENTS.find(x => x.id === e.moment); if (!m) continue;
            const pick = intake.pickTip(content, [{ kind: 'moment', id: m.id, event: m.event, label: m.name }], s);
            if (pick) await deliver(u, pick, 'calendar', { moment: `${e.title} · ${clock.shortDate(e.start, s.tz)}`, dedupe: 'cal:' + e.uid, message: m.friendly });
          }
          if (u.lat != null && here.hour >= 7) {
            const c = await live.conditions(db, u.lat, u.lon).catch(() => null);
            const lm = c && c.moments[0], m = lm && content.MOMENTS.find(x => x.id === lm.id);
            const pick = m && intake.pickTip(content, [{ kind: 'moment', id: m.id, event: m.event, label: m.name }], s);
            if (pick) await deliver(u, pick, 'environment', { moment: `${m.name} · ${lm.reason}${c.place ? ' · ' + c.place : ''}`, dedupe: `live:${here.date}`, message: m.friendly });
          }
        }
        if ((freq === 'daily' || freq === 'both') && here.hour >= 8) {
          const t = E.dailyTip(content.live, s);
          if (t) await deliver(u, { tip: t, match: null }, 'daily', { moment: 'Your daily tip', dedupe: 'daily:' + here.date, message: 'Your Wellwise tip for today' });
        }
        if (freq === 'weekly' && here.weekday === 1 && here.hour >= 8) {
          const t = E.dailyTip(content.live, s);
          if (t) await deliver(u, { tip: t, match: null }, 'weekly', { moment: 'Your weekly tip', dedupe: 'weekly:' + here.date, message: 'Your Wellwise tip for the week' });
        }
        for (const [tid, st] of Object.entries(s.statuses || {})) {
          const at = (s.statusAt || {})[tid], t = content.byId[tid]; if (st !== 'trying' || !at || !t) continue;
          const age = (Date.now() - at) / 864e5;
          for (const stage of [30, 7]) if (age >= stage && !(s.checkins || {})[`${tid}:${stage}`]) {
            await deliver(u, { tip: t, match: null }, 'checkin', { moment: `${stage}-day check-in`, dedupe: `checkin:${tid}:${stage}`, message: `${stage} days ago you started this. How is it going? Open the tip to tell us.` }); break;
          }
        }
      } catch (e) { console.error('tick', u.id, e.message) }
    }
  }

  /* ---------- agent API and MCP ---------- */
  /* Agents sign in with a personal key (wwk_…) or an OAuth token from the connector sign-in (wwo_…). */
  function agentUser(req) {
    const k = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
    if (k.startsWith('wwo_')) { const uid = oa.userFor(k); return uid ? db.userById(uid) : null }
    return db.userByAgentKey(k);
  }
  const formOrJson = async req => { const b = (await readBody(req, 1e5)).toString(); if (/json/.test(req.headers['content-type'] || '')) { try { return JSON.parse(b || '{}') } catch (e) { return {} } } return Object.fromEntries(new URLSearchParams(b)) };
  const AUTH_FIELDS = ['client_id', 'redirect_uri', 'state', 'code_challenge', 'code_challenge_method', 'scope', 'resource'];
  function authHidden(q, uid) { const v = Object.fromEntries(AUTH_FIELDS.map(k => [k, q[k] || ''])); return AUTH_FIELDS.map(k => `<input type="hidden" name="${k}" value="${oauth.esc(v[k])}">`).join('') + `<input type="hidden" name="csrf" value="${sign(uid || 'anon', v.client_id, v.redirect_uri, v.code_challenge)}">` }
  function authCheck(q) {
    const client = oa.client(q.client_id);
    if (!client) return { error: 'This assistant is not registered with Wellwise. Try adding the connector again.' };
    if (!client.redirect_uris.includes(q.redirect_uri)) return { error: 'This sign-in link is not valid. Try adding the connector again.' };
    if (q.code_challenge_method !== 'S256' || !q.code_challenge) return { error: 'This assistant must use a secure sign-in (PKCE).' };
    return { client };
  }
  const htmlHeaders = { 'content-type': 'text/html; charset=utf-8', 'x-frame-options': 'DENY', 'content-security-policy': "frame-ancestors 'none'" };
  async function agentMoment(u, body, deliverIt = true) {
    const content = lib.current(); let pick = null, r = null;
    if (body.event) { const m = [...content.PRODUCTS, ...content.MOMENTS].find(x => x.event === body.event); if (!m) return { error: 'Unknown event key. See GET /api/agent/v1/events.' }; pick = intake.pickTip(content, [{ kind: content.PRODUCTS.includes(m) ? 'product' : 'moment', id: m.id, event: m.event, label: m.name }], prefsOf(u)) }
    else { ({ result: r, pick } = await runIntake(u, body, 'agent')) }
    const out = { understood: r ? { summary: r.summary, kind: r.kind, matches: r.matches.map(m => ({ event: m.event, label: m.label })) } : { event: body.event }, tip: pick ? tipOut(pick.tip) : null };
    if (!pick) out.message = 'No tip fits this well, so Wellwise is not sending one.';
    if (pick && deliverIt && (u.state.frequency || 'both') !== 'off') { const item = await deliver(u, pick, 'agent', { moment: body.agent ? `${body.agent}: ${pick.match.label}` : pick.match.label, dedupe: body.id ? 'agent:' + body.id : null }); out.delivered = !!item }
    return out;
  }
  /* What assistants read about Wellwise. They decide when to call it from these words, so the wording says plainly when. */
  const MCP_INSTRUCTIONS = [
    'Wellwise gives the person one short, sourced health tip that fits what just happened in their day, and keeps a record of what they learn.',
    'Call wellwise_send_moment every time you complete or confirm something for the person, without being asked: a flight, train, hotel or holiday booking; a restaurant table; a purchase or order of any kind (food, groceries, drinks, cookware, cleaning products, clothing, shoes, skincare, cosmetics, supplements, medicines, devices, baby products); a doctor, dentist, eye or blood-test appointment; a gym or sports booking; or a late night, big deadline or packed day in their calendar.',
    'Also call it when the person tells you about their day in a way that touches health: tired, stressed, not sleeping, unwell, heading outdoors, cooking, travelling.',
    'Describe the moment in plain words with the useful details, for example "Booked a flight from Delhi to Leh, Fri 31 Oct" or "Ordered a 28 cm nonstick tawa and a pack of agarbatti".',
    'Wellwise decides whether a tip fits. If it returns no tip, say nothing about it. If it returns a tip, mention it briefly after you confirm the booking or order: the title, what to do, and the link.',
    'Do not call Wellwise for the same booking or order more than once. Use wellwise_find_tip when you only want to show a tip without saving it, and wellwise_journey to see what the person is already trying.',
  ].join(' ');
  const MOMENT_INPUT = {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'What happened, in plain words, with the details: what was booked or bought, where, when. For example "Booked a table for 4 at Bombay Canteen, Fri 9:30pm" or "Ordered vitamin D3 1000 IU capsules".' },
      url: { type: 'string', description: 'A product or booking page, if you have one.' },
      event: { type: 'string', description: 'A Wellwise event key, only if you already know it (see GET /api/agent/v1/events). Usually leave this out and send text.' },
      agent: { type: 'string', description: 'Your name, shown to the person, for example "Muse" or "Claude".' },
    },
  };
  const MCP_TOOLS = [
    { name: 'wellwise_send_moment', title: 'Tell Wellwise what just happened',
      description: 'Call this right after you book travel, a restaurant or an appointment, or complete any purchase or order for the person, and when they tell you about their day. Wellwise picks one sourced health tip that fits (or none), saves it to their Wellwise journey, and sends it to them. Show the returned tip briefly in your reply.',
      inputSchema: MOMENT_INPUT, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } },
    { name: 'wellwise_find_tip', title: 'Find a tip without saving it',
      description: 'Find the one sourced health tip that fits a moment, a product, a link or a calendar entry, without saving it or notifying the person. Returns no tip when nothing fits well.',
      inputSchema: MOMENT_INPUT, annotations: { readOnlyHint: true, openWorldHint: false } },
    { name: 'wellwise_journey', title: 'What the person is trying',
      description: 'The tips the person is trying and has made habits, so you do not repeat them.',
      inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true, openWorldHint: false } },
  ];
  async function mcp(u, msg) {
    const ok = result => ({ jsonrpc: '2.0', id: msg.id, result });
    if (msg.method === 'initialize') return ok({ protocolVersion: msg.params?.protocolVersion || '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'wellwise', version: '4.0.0' }, instructions: MCP_INSTRUCTIONS });
    if (msg.method === 'ping') return ok({});
    if (msg.method === 'tools/list') return ok({ tools: MCP_TOOLS });
    if (msg.method === 'tools/call') {
      const a = msg.params?.arguments || {}, name = msg.params?.name;
      let data;
      if (name === 'wellwise_find_tip') data = await agentMoment(u, a, false);
      else if (name === 'wellwise_send_moment') data = await agentMoment(u, a, true);
      else if (name === 'wellwise_journey') { const s = u.state || {}, by = lib.current().byId; data = { trying: Object.keys(s.statuses || {}).filter(k => s.statuses[k] === 'trying').map(k => by[k]?.title), habits: Object.keys(s.statuses || {}).filter(k => s.statuses[k] === 'adopted').map(k => by[k]?.title), seen: Object.keys(s.seen || {}).length } }
      else return { jsonrpc: '2.0', id: msg.id, error: { code: -32602, message: 'Unknown tool' } };
      return ok({ content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data, isError: !!data.error });
    }
    return { jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: 'Method not found' } };
  }

  /* ---------- admin ---------- */
  function isAdmin(req) {
    const t = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    return !!adminToken && t.length === adminToken.length && crypto.timingSafeEqual(Buffer.from(t), Buffer.from(adminToken));
  }
  function reach(c) {
    const ev = E.allEvents(c), live = c.TIPS.filter(t => t.status === 'live');
    return { live: live.length, reachable: live.filter(t => t.triggerKeys.some(k => ev.has(k))).length, unreachable: live.filter(t => !t.triggerKeys.some(k => ev.has(k))).map(t => ({ id: t.id, title: t.title })),
      byCategory: c.CATEGORIES.map(cat => ({ name: cat.name, tips: live.filter(t => t.category === cat.name).length, common: live.filter(t => t.category === cat.name && t.familiarity === 'common').length })) };
  }

  /* ---------- router ---------- */
  async function handle(req, res) {
    const url = new URL(req.url, 'http://x'), m = req.method;
    let p = url.pathname;
    if (p === '/mcp/') p = '/mcp';
    // Learn the public address from real visitors, not from the host's health check.
    if (!ENV_URL && p !== '/api/health' && req.headers.host) baseUrl = publicUrl(req);
    // Assistants reach the connector and its sign-in from other sites, so these paths allow cross-origin calls.
    if (p === '/mcp' || p === '/mcp/' || p.startsWith('/.well-known/') || p === '/oauth/token' || p === '/oauth/register') {
      res.setHeader('access-control-allow-origin', '*');
      res.setHeader('access-control-allow-headers', 'authorization, content-type, mcp-protocol-version, mcp-session-id');
      res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
      res.setHeader('access-control-expose-headers', 'www-authenticate, mcp-session-id');
      if (m === 'OPTIONS') { res.writeHead(204); return res.end() }
    }
    try {
      if (m === 'GET' && STATIC[p]) {
        const f = path.join(dist, STATIC[p]); if (!fs.existsSync(f)) return fail(res, 404, 'Run python3 scripts/build.py first');
        return send(res, 200, fs.readFileSync(f), { 'content-type': TYPES[path.extname(f)], 'cache-control': 'no-cache' });
      }
      if (m === 'GET' && p === '/wellwise-content.json') return send(res, 200, lib.publicJSON(), { 'cache-control': 'no-cache' });
      if (m === 'GET' && p === '/api/health') return send(res, 200, { ok: true, features: features() });

      /* ---- connector sign-in for AI assistants (OAuth 2.1 + PKCE + dynamic registration) ---- */
      if (m === 'GET' && p.startsWith('/.well-known/oauth-protected-resource')) return send(res, 200, { resource: baseUrl + '/mcp', authorization_servers: [baseUrl], bearer_methods_supported: ['header'], scopes_supported: ['wellwise'], resource_name: 'Wellwise' });
      if (m === 'GET' && (p.startsWith('/.well-known/oauth-authorization-server') || p.startsWith('/.well-known/openid-configuration'))) return send(res, 200, { issuer: baseUrl, authorization_endpoint: baseUrl + '/oauth/authorize', token_endpoint: baseUrl + '/oauth/token', registration_endpoint: baseUrl + '/oauth/register', response_types_supported: ['code'], grant_types_supported: ['authorization_code', 'refresh_token'], code_challenge_methods_supported: ['S256'], token_endpoint_auth_methods_supported: ['none', 'client_secret_basic', 'client_secret_post'], scopes_supported: ['wellwise'] });
      if (m === 'POST' && p === '/oauth/register') { if (limited('reg:' + (req.socket.remoteAddress || ''), 20)) return fail(res, 429, 'Slow down'); const r = oa.register(await formOrJson(req)); return send(res, r.error ? 400 : 201, r) }
      if (m === 'POST' && p === '/oauth/token') {
        const basic = (req.headers.authorization || '').match(/^Basic\s+(.+)$/i), basicId = basic ? decodeURIComponent(Buffer.from(basic[1], 'base64').toString().split(':')[0]) : null;
        const form = await formOrJson(req), r = oa.exchange(form, basicId);
        if (r.access_token && form.grant_type === 'authorization_code') {
          const info = oa.tokenInfo(r.access_token);
          if (info) push.notify(info.user_id, { title: `${info.name || 'Your assistant'} is connected to Wellwise`, body: `When ${info.name || 'it'} books or buys something for you, a tip that fits will arrive here.`, url: '/#moments', tag: 'connected-' + info.client_id }).catch(() => {});
        }
        return send(res, r.error ? 400 : 200, r);
      }
      if (p === '/oauth/authorize') {
        const q = m === 'GET' ? Object.fromEntries(url.searchParams) : await formOrJson(req);
        const { client, error } = authCheck(q);
        if (error) { oa.log(q.client_id, 'authorize', false, error + ' · redirect ' + (q.redirect_uri || '') + ' · method ' + (q.code_challenge_method || '')) }
        if (error) return send(res, 400, oauth.page('Sign-in problem', `<h1>Something is not right</h1><p>${oauth.esc(error)}</p>`), htmlHeaders);
        let u = me(req, res, false);
        const signInOpts = extra => ({ email: auth.emailEnabled(), whatsapp: wa.enabled(), uid: u?.id, ...extra });
        const authUrl = baseUrl + '/oauth/authorize?' + new URLSearchParams({ response_type: 'code', ...Object.fromEntries(AUTH_FIELDS.filter(k => q[k]).map(k => [k, q[k]])) });
        if (m === 'POST' && q.decision === 'switch') return send(res, 200, oauth.signInPage(client, authHidden(q, u?.id), signInOpts()), htmlHeaders);
        if (m === 'POST' && q.decision === 'email') {
          if (limited('authpage:' + (req.socket.remoteAddress || ''), 10)) return send(res, 200, oauth.signInPage(client, authHidden(q, u?.id), signInOpts({ err: 'Too many tries. Wait a minute.' })), htmlHeaders);
          const r = await auth.startEmail(q.email);
          if (r.error) return send(res, 200, oauth.signInPage(client, authHidden(q, u?.id), signInOpts({ err: r.error })), htmlHeaders);
          oa.log(client.id, 'sign-in', true, 'email code sent');
          return send(res, 200, oauth.emailCodePage(client, authHidden(q, u?.id), r.email, r.id), htmlHeaders);
        }
        if (m === 'POST' && q.decision === 'verify') {
          const r = auth.verifyEmail(q.login_id, q.login_code);
          if (r.error) return send(res, 200, oauth.emailCodePage(client, authHidden(q, u?.id), q.email, q.login_id, r.error), htmlHeaders);
          u = signInAs(req, res, u, { email: r.email });
          oa.log(client.id, 'sign-in', true, 'signed in ' + oauth.shortId(u.id));
          return send(res, 200, oauth.signedInPage(client, authHidden(q, u.id), u), htmlHeaders);
        }
        if (m === 'POST' && q.decision === 'wa') {
          const r = auth.startWhatsApp(), num = (wa.env().number || '').replace(/\D/g, '');
          return send(res, 200, oauth.whatsappPage(client, authHidden(q, u?.id), r.code, num ? `https://wa.me/${num}?text=${encodeURIComponent('SIGNIN ' + r.code)}` : null, wa.env().number, r.id, authUrl), htmlHeaders);
        }
        if (m === 'POST') {
          if (q.decision === 'code') {
            const uid = db.useCode(String(q.device_code || '').trim(), 'device'), other = uid && db.userById(uid);
            if (!other) return send(res, 200, oauth.codePage(client, authHidden(q, null), 'That code did not work. Codes last 10 minutes.'), htmlHeaders);
            res.setHeader('set-cookie', sessionCookie(req, other.token));
            return send(res, 200, oauth.approvePage(client, authHidden(q, other.id), null, other.id), htmlHeaders);
          }
          if (!u && (q.decision === 'new' || q.decision === 'deny')) {
            if (q.csrf !== sign('anon', q.client_id, q.redirect_uri, q.code_challenge)) return send(res, 200, oauth.codePage(client, authHidden(q, null), 'Please try again.'), htmlHeaders);
            const back = new URL(q.redirect_uri);
            if (q.decision === 'new') { const fresh = db.createUser(); res.setHeader('set-cookie', sessionCookie(req, fresh.token)); back.searchParams.set('code', oa.issueCode(fresh.id, client.id, q.redirect_uri, q.code_challenge)); oa.log(client.id, 'allow', true, 'new account ' + oauth.shortId(fresh.id) + ' → ' + back.origin) }
            else back.searchParams.set('error', 'access_denied');
            if (q.state) back.searchParams.set('state', q.state);
            res.writeHead(302, { location: back.href }); return res.end();
          }
          if (!u || q.csrf !== sign(u.id, q.client_id, q.redirect_uri, q.code_challenge)) return send(res, 200, signedIn(u) ? oauth.signedInPage(client, authHidden(q, u.id), u, 'Please try again.') : oauth.signInPage(client, authHidden(q, u?.id), signInOpts({ err: 'Please try again.' })), htmlHeaders);
          const back = new URL(q.redirect_uri);
          if (q.decision === 'allow') { back.searchParams.set('code', oa.issueCode(u.id, client.id, q.redirect_uri, q.code_challenge)); oa.log(client.id, 'allow', true, 'existing account ' + oauth.shortId(u.id) + ' → ' + back.origin) }
          else back.searchParams.set('error', 'access_denied');
          if (q.state) back.searchParams.set('state', q.state);
          res.writeHead(302, { location: back.href }); return res.end();
        }
        return send(res, 200, signedIn(u) ? oauth.signedInPage(client, authHidden(q, u.id), u) : oauth.signInPage(client, authHidden(q, u?.id), signInOpts()), htmlHeaders);
      }

      /* share target: other apps share a link, text or photo straight into Wellwise */
      if (m === 'POST' && p === '/share') {
        const u = me(req, res), form = multipart(await readBody(req), req.headers['content-type'] || '');
        const file = Object.values(form).find(v => v && typeof v === 'object');
        const input = { text: [form.title, form.text].filter(Boolean).join(' '), url: form.url || undefined };
        if (file) { if (/^image\//.test(file.mediaType)) input.image = file; else input.doc = file }
        const { result } = await runIntake(u, input, 'share');
        res.writeHead(303, { location: '/#moments/intake/' + result.id }); return res.end();
      }

      /* ---- the person's own API (cookie session) ---- */
      if (p.startsWith('/api/') && !p.startsWith('/api/agent/') && !p.startsWith('/api/admin/')) {
        if (m !== 'GET' && !/json/.test(req.headers['content-type'] || '')) return fail(res, 415, 'Send JSON');
        const u = me(req, res);
        if (m === 'GET' && p === '/api/me') return send(res, 200, { id: u.id, account: signedIn(u) ? { email: u.email || null, phone: u.phone ? oauth.accountLabel({ phone: u.phone }) : null } : null, state: u.state, linked: summaryOf(u), features: features() });
        if (p.startsWith('/api/auth/')) {
          if (limited('auth:' + (req.socket.remoteAddress || ''), 20)) return fail(res, 429, 'Too many tries. Wait a minute.');
          if (m === 'POST' && p === '/api/auth/email') { const b = await json(req), r = await auth.startEmail(b.email); return r.error ? fail(res, 400, r.error) : send(res, 200, r) }
          if (m === 'POST' && p === '/api/auth/email/verify') { const b = await json(req), r = auth.verifyEmail(b.id, b.code); if (r.error) return fail(res, 400, r.error); const t = signInAs(req, res, u, { email: r.email }); return send(res, 200, { ok: true, account: { email: t.email } }) }
          if (m === 'POST' && p === '/api/auth/whatsapp') { const r = auth.startWhatsApp(), num = (wa.env().number || '').replace(/\D/g, ''); return send(res, 200, { ...r, number: wa.env().number || null, link: num ? `https://wa.me/${num}?text=${encodeURIComponent('SIGNIN ' + r.code)}` : null, enabled: wa.enabled() }) }
          let am; if (m === 'GET' && (am = p.match(/^\/api\/auth\/whatsapp\/(lc_[a-f0-9]+)$/))) { const r = auth.checkWhatsApp(am[1]); if (r.error || r.pending) return send(res, 200, r); signInAs(req, res, u, { phone: r.phone }); return send(res, 200, { ok: true }) }
          if (m === 'POST' && p === '/api/auth/signout') { const fresh = db.createUser(); return send(res, 200, { ok: true }, { 'set-cookie': sessionCookie(req, fresh.token) }) }
          return fail(res, 404, 'Not found');
        }
        if (m === 'PUT' && p === '/api/state') { const b = await json(req); const st = { ...(b.state || {}), _server: u.state._server || {} }; db.saveState(u.id, st); return send(res, 200, { ok: true }) }
        if (m === 'DELETE' && p === '/api/me') { oa.revokeAll(u.id); push.removeAll(u.id); db.deleteUser(u.id); return send(res, 200, { ok: true }, { 'set-cookie': 'ww=; Path=/; Max-Age=0' }) }
        if (m === 'GET' && p === '/api/inbox') return send(res, 200, { items: db.inboxSince(u.id, +url.searchParams.get('since') || 0) });
        if (m === 'POST' && p === '/api/feedback') { const b = await json(req); db.vote(u.id, String(b.tip), b.source, b.vote === 'useful' || b.vote === 'not-useful' ? b.vote : null); return send(res, 200, { ok: true }) }
        if (m === 'GET' && p === '/api/live') {
          const c = await live.conditions(db, url.searchParams.get('lat'), url.searchParams.get('lon'));
          if (url.searchParams.get('keep') === '1') { db.setField(u.id, 'lat', c.lat); db.setField(u.id, 'lon', c.lon) }
          return send(res, 200, c);
        }
        if (m === 'DELETE' && p === '/api/location') { db.setField(u.id, 'lat', null); db.setField(u.id, 'lon', null); return send(res, 200, { ok: true }) }
        if (m === 'POST' && p === '/api/intake') {
          if (limited('in:' + u.id, 20)) return fail(res, 429, 'Too many at once. Try again in a minute.');
          const b = await json(req), input = {};
          for (const k of ['text', 'url', 'barcode']) if (b[k]) input[k] = String(b[k]).slice(0, 50000);
          if (b.image?.data) input.image = { data: b.image.data, mediaType: b.image.mediaType };
          if (b.doc?.data) input.doc = { data: b.doc.data, mediaType: b.doc.mediaType, name: b.doc.name };
          if (!Object.keys(input).length) return fail(res, 400, 'Nothing to read');
          const { result } = await runIntake(u, input, ['share', 'scan', 'photo', 'document'].includes(b.source) ? b.source : 'share');
          return send(res, 200, result);
        }
        let mm;
        if (m === 'GET' && (mm = p.match(/^\/api\/intake\/(in-[a-f0-9]+)$/))) { const r = db.intake(u.id, mm[1]); return r ? send(res, 200, r.result) : fail(res, 404, 'Not found') }
        if (p === '/api/calendar') {
          if (m === 'GET') return send(res, 200, { connected: !!u.calendar_url, synced: u.calendar_synced, upcoming: db.calEvents(u.id, Date.now() - 2 * 3600e3) });
          if (m === 'DELETE') { db.setField(u.id, 'calendar_url', null); db.clearCal(u.id); return send(res, 200, { ok: true }) }
          if (m === 'POST') {
            const b = await json(req), cal = String(b.url || '').trim();
            if (!/^(https?|webcal):\/\//i.test(cal)) return fail(res, 400, 'Paste the calendar’s secret address. It starts with https:// or webcal://');
            db.setField(u.id, 'calendar_url', cal);
            try { const r = await syncCalendar(db.userById(u.id)); return send(res, 200, { connected: true, ...r, upcoming: db.calEvents(u.id, Date.now() - 2 * 3600e3) }) }
            catch (e) { db.setField(u.id, 'calendar_url', null); return fail(res, 400, e.message) }
          }
        }
        if (m === 'POST' && p === '/api/calendar/sync') { if (!u.calendar_url) return fail(res, 400, 'No calendar connected'); const r = await syncCalendar(u); await tick(); return send(res, 200, { ...r, upcoming: db.calEvents(u.id, Date.now() - 2 * 3600e3) }) }
        if (p === '/api/whatsapp') {
          if (m === 'POST') { const c = db.newCode(u.id, 'whatsapp'), num = (wa.env().number || '').replace(/\D/g, ''); return send(res, 200, { code: c, number: wa.env().number || null, link: num ? `https://wa.me/${num}?text=${encodeURIComponent('LINK ' + c)}` : null, enabled: wa.enabled() }) }
          if (m === 'DELETE') { db.setField(u.id, 'phone', null); return send(res, 200, { ok: true }) }
        }
        if (p === '/api/push') {
          if (m === 'GET') return send(res, 200, { key: push.publicKey(), devices: push.count(u.id) });
          const b = await json(req);
          if (m === 'POST') { const saved = push.save(u.id, b.subscription); if (!saved) return fail(res, 400, 'That subscription is not valid'); if (saved.isNew && !b.quiet) push.notify(u.id, { title: 'Notifications are on', body: 'Your Wellwise tips will arrive here.', url: '/', tag: 'welcome' }).catch(() => {}); return send(res, 200, { ok: true, devices: push.count(u.id) }) }
          if (m === 'DELETE') { push.remove(u.id, b.endpoint); return send(res, 200, { ok: true, devices: push.count(u.id) }) }
        }
        if (m === 'GET' && p === '/api/agents') return send(res, 200, { mcp: baseUrl + '/mcp', connected: oa.connected(u.id).map(c => ({ id: c.client_id, name: c.name, since: c.since })) });
        if (m === 'DELETE' && (mm = p.match(/^\/api\/agents\/(wwc_[a-f0-9]+)$/))) { oa.revoke(u.id, mm[1]); return send(res, 200, { ok: true }) }
        if (p === '/api/agent-key') {
          if (m === 'POST') { const k = 'wwk_' + db.id(20); db.setField(u.id, 'agent_key', k); return send(res, 200, { key: k, api: baseUrl + '/api/agent/v1', mcp: baseUrl + '/mcp' }) }
          if (m === 'DELETE') { db.setField(u.id, 'agent_key', null); return send(res, 200, { ok: true }) }
        }
        if (p === '/api/email') {
          if (m === 'POST') { const a = u.inbound || 'u' + db.id(5); db.setField(u.id, 'inbound', a); return send(res, 200, { address: process.env.WELLWISE_INBOUND_DOMAIN ? `${a}@${process.env.WELLWISE_INBOUND_DOMAIN}` : null }) }
          if (m === 'DELETE') { db.setField(u.id, 'inbound', null); return send(res, 200, { ok: true }) }
        }
        if (m === 'POST' && p === '/api/device-code') return send(res, 200, { code: db.newCode(u.id, 'device', 10 * 60e3) });
        if (m === 'POST' && p === '/api/device-join') { const b = await json(req), uid = db.useCode(String(b.code || '').trim(), 'device'); const other = uid && db.userById(uid); if (!other) return fail(res, 400, 'That code did not work. Codes last 10 minutes.'); return send(res, 200, { ok: true }, { 'set-cookie': sessionCookie(req, other.token) }) }
        return fail(res, 404, 'Not found');
      }

      /* ---- agents: REST and MCP, with a personal key ---- */
      if (p.startsWith('/api/agent/v1/') || p === '/mcp') {
        const u = agentUser(req);
        if (!u && p === '/mcp' && /^Bearer\s+\S/i.test(req.headers.authorization || '')) oa.log(null, 'mcp', false, 'Access refused: ' + ((req.headers.authorization || '').replace(/^Bearer\s+/i, '').slice(0, 4) || '?') + '… token not recognised or expired');
        if (!u) return send(res, 401, { error: 'Sign in to Wellwise, or send your agent key as: Authorization: Bearer wwk_…' }, { 'www-authenticate': `Bearer resource_metadata="${baseUrl}/.well-known/oauth-protected-resource"` });
        if (limited('ag:' + u.id, 30)) return fail(res, 429, 'Slow down');
        if (p === '/mcp') {
          if (m !== 'POST') return send(res, 405, 'Use POST', { allow: 'POST' });
          const body = await json(req), batch = Array.isArray(body) ? body : [body];
          const tok = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim(), info = tok.startsWith('wwo_') ? oa.tokenInfo(tok) : null;
          for (const x of batch) if (x && x.method && x.method !== 'ping' && !String(x.method).startsWith('notifications/')) oa.log(info ? info.client_id : 'key', 'mcp', true, x.method + (x.params?.name ? ' · ' + x.params.name : '') + (x.params?.arguments?.text ? ' · "' + String(x.params.arguments.text).slice(0, 80) + '"' : ''));
          const replies = (await Promise.all(batch.map(x => x.id === undefined ? null : mcp(db.userById(u.id), x)))).filter(Boolean);
          if (!replies.length) { res.writeHead(202); return res.end() }
          return send(res, 200, Array.isArray(body) ? replies : replies[0]);
        }
        if (m === 'GET' && p === '/api/agent/v1/events') { const c = lib.current(); return send(res, 200, { events: [...c.PRODUCTS.map(x => ({ event: x.event, label: x.name, kind: 'product' })), ...c.MOMENTS.map(x => ({ event: x.event, label: x.name, kind: x.source }))] }) }
        if (m === 'GET' && p === '/api/agent/v1/tips') { const ev = url.searchParams.get('event'); return send(res, 200, { tips: E.candidates(lib.current().live, ev, prefsOf(u)).scored.slice(0, 5).map(x => tipOut(x.t)) }) }
        if (m === 'POST' && p === '/api/agent/v1/moments') return send(res, 200, await agentMoment(u, await json(req), true));
        return fail(res, 404, 'Not found');
      }

      /* ---- WhatsApp webhook ---- */
      if (p === '/webhooks/whatsapp') {
        if (m === 'GET') { const q = url.searchParams; return q.get('hub.mode') === 'subscribe' && q.get('hub.verify_token') && q.get('hub.verify_token') === wa.env().verify ? send(res, 200, q.get('hub.challenge') || '') : fail(res, 403, 'Forbidden') }
        const raw = await readBody(req);
        if (!wa.verifySignature(raw, req.headers['x-hub-signature-256'])) return fail(res, 401, 'Bad signature');
        send(res, 200, { ok: true });
        const body = JSON.parse(raw.toString() || '{}');
        for (const entry of body.entry || []) for (const ch of entry.changes || []) for (const msg of ch.value?.messages || []) await onWhatsApp(msg).catch(e => console.error('whatsapp', e.message));
        return;
      }
      /* ---- inbound email (Postmark-style JSON). Forward order confirmations, bookings or results. ---- */
      if (m === 'POST' && p === '/webhooks/email') {
        if (!process.env.WELLWISE_INBOUND_SECRET || url.searchParams.get('secret') !== process.env.WELLWISE_INBOUND_SECRET) return fail(res, 403, 'Forbidden');
        const b = await json(req), to = String(b.OriginalRecipient || b.To || '').toLowerCase(), local = (to.match(/([a-z0-9]+)@/) || [])[1];
        const u = db.userByInbound(local); if (!u) return send(res, 200, { ignored: true });
        const att = (b.Attachments || []).find(a => /pdf|image|calendar/.test(a.ContentType));
        const input = { text: [b.Subject, b.TextBody || String(b.HtmlBody || '').replace(/<[^>]+>/g, ' ')].join('\n').slice(0, 40000) };
        if (att) input.doc = { data: att.Content, mediaType: att.ContentType, name: att.Name };
        const { result, pick } = await runIntake(u, input, 'email');
        if (pick) await deliver(u, pick, 'email', { moment: 'Email: ' + (b.Subject || result.summary).slice(0, 80), dedupe: 'mail:' + (b.MessageID || result.id) });
        return send(res, 200, { ok: true, tip: pick ? pick.tip.id : null });
      }

      /* ---- admin console API ---- */
      if (p.startsWith('/api/admin/')) {
        if (!isAdmin(req)) return fail(res, 401, adminToken ? 'Wrong admin token' : 'Set WELLWISE_ADMIN_TOKEN on the server to use the admin console');
        const c = lib.current();
        if (m === 'GET' && p === '/api/admin/status') return send(res, 200, { stats: db.stats(), feedback: { bySource: db.feedbackBySource(), byTip: db.feedbackByTip().map(r => ({ ...r, title: c.byId[r.tip]?.title })) }, reach: reach(c), packs: db.packs().map(x => ({ id: x.id, name: x.name, at: x.at, tips: x.body.tips.length })), contentVersion: c.contentVersion,
          connectors: oa.recent(), integrations: { storage, signInEmail: auth.emailEnabled(), push: push.total(), claude: llm.enabled() ? llm.MODEL : null, whatsapp: wa.enabled(), whatsappWebhook: !!wa.env().verify, whatsappTemplate: wa.env().template || null, email: !!process.env.WELLWISE_INBOUND_DOMAIN, publicUrl: baseUrl } });
        if (m === 'POST' && p === '/api/admin/packs/check') return send(res, 200, lib.validate(await json(req)));
        if (m === 'POST' && p === '/api/admin/packs') { const b = await json(req), r = lib.validate(b); if (r.errors.length) return send(res, 400, r); db.savePack('pk-' + db.id(4), b.pack || 'Pack', { tips: r.tips, edges: r.edges }); lib.invalidate(); return send(res, 200, { ok: true, added: r.tips.length }) }
        let pm; if (m === 'DELETE' && (pm = p.match(/^\/api\/admin\/packs\/(pk-[a-f0-9]+)$/))) { db.deletePack(pm[1]); lib.invalidate(); return send(res, 200, { ok: true }) }
        if (m === 'GET' && p === '/api/admin/content') return send(res, 200, lib.publicJSON(), { 'content-disposition': 'attachment; filename="wellwise-content.json"' });
        if (m === 'POST' && p === '/api/admin/tick') { await tick(); return send(res, 200, { ok: true }) }
        if (m === 'POST' && p === '/api/admin/try') { const b = await json(req); return send(res, 200, await intake.interpret(c, b, db)) }
        return fail(res, 404, 'Not found');
      }
      return fail(res, 404, 'Not found');
    } catch (e) {
      if (!res.headersSent) fail(res, e.status || 500, e.status ? e.message : 'Something went wrong. Please try again.');
      if (!e.status) console.error(e);
    }
  }

  async function onWhatsApp(msg) {
    const from = msg.from, content = lib.current();
    const text = msg.type === 'text' ? msg.text.body.trim() : '';
    const signinCode = text.match(/^signin\s+(\d{6})$/i);
    if (signinCode) return wa.sendText(from, auth.claimWhatsApp(signinCode[1], from) ? 'You are signed in to Wellwise. Go back to the page that showed the code; it moves on by itself.' : 'That code did not work or has expired. Start the sign-in again.');
    const link = text.match(/^link\s+(\d{6})$/i);
    if (link) {
      const uid = db.useCode(link[1], 'whatsapp');
      if (!uid) return wa.sendText(from, 'That code did not work. Open Wellwise, tap Link WhatsApp, and send the new code.');
      const prev = db.userByPhone(from); if (prev && prev.id !== uid) db.setField(prev.id, 'phone', null);
      db.setField(uid, 'phone', from);
      const u = db.userById(uid); db.saveState(uid, { ...u.state, _server: { ...(u.state._server || {}), waLastInbound: Date.now() } });
      return wa.sendText(from, 'You are linked. Send Wellwise a product link, a photo of a label or barcode, an order confirmation, a lab report or a few words about your day, and get one useful tip back.\n\nSend STOP to unlink.');
    }
    const u = db.userByPhone(from);
    if (!u) return wa.sendText(from, `Hi! To use Wellwise here, open ${baseUrl}, go to Moments → WhatsApp, and tap Link WhatsApp.`);
    db.saveState(u.id, { ...u.state, _server: { ...(u.state._server || {}), waLastInbound: Date.now() } });
    if (/^stop$/i.test(text)) { db.setField(u.id, 'phone', null); return wa.sendText(from, 'Unlinked. You will not get messages from Wellwise here.') }
    if (/^(tip|today|hi|hello)$/i.test(text)) { const t = E.dailyTip(content.live, u.state); await deliver(u, { tip: t, match: null }, 'whatsapp', { moment: 'Asked on WhatsApp', message: 'Your Wellwise tip for today' }); return wa.sendText(from, wa.tipMessage(t, 'Your tip for today:', tipUrl(t.id))) }
    const input = await wa.toInput(msg); if (!input) return wa.sendText(from, 'Send a link, a photo, a document or a few words.');
    const { result, pick } = await runIntake(u, input, 'whatsapp');
    if (!pick) return wa.sendText(from, `${result.summary ? 'We read: ' + result.summary + '.\n\n' : ''}No tip fits this well, so we will not force one.${result.note ? '\n\n' + result.note : ''}`);
    await deliver(u, pick, 'whatsapp', { moment: 'WhatsApp: ' + (result.summary || pick.match.label).slice(0, 80), dedupe: 'wa:' + msg.id });
    return wa.sendText(from, wa.tipMessage(pick.tip, result.friendly, tipUrl(pick.tip.id)));
  }

  const server = http.createServer(handle);
  return { server, db, lib, tick, handle };
}

module.exports = { createApp };
