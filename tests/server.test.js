// Checks for the server and its integrations. Outside services (weather, product data, WhatsApp, shops,
// calendars) are replaced with fixed answers, so this runs offline. Run: npm test (after the build).
const crypto = require('node:crypto');
const path = require('node:path');
process.env.WELLWISE_ALLOW_PRIVATE_FETCH = '1';
delete process.env.ANTHROPIC_API_KEY; delete process.env.ANTHROPIC_AUTH_TOKEN;
Object.assign(process.env, { WHATSAPP_TOKEN: 't', WHATSAPP_PHONE_NUMBER_ID: '999', WHATSAPP_VERIFY_TOKEN: 'verify-me', WHATSAPP_APP_SECRET: 'shh', WHATSAPP_DISPLAY_NUMBER: '+44 7700 900000', WELLWISE_INBOUND_DOMAIN: 'in.wellwise.test', WELLWISE_INBOUND_SECRET: 'mail-secret' });

let failed = 0;
const check = (name, cond) => { if (!cond) failed++; console.log((cond ? 'PASS ' : 'FAIL ') + name) };

/* ---- fake outside world ---- */
const sent = [];
const day = 864e5, ymd = t => new Date(t).toISOString().slice(0, 10).replace(/-/g, '');
const ICS = ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:f1', `DTSTART:${ymd(Date.now() + day / 2)}T090000Z`, `DTEND:${ymd(Date.now() + day / 2)}T110000Z`, 'SUMMARY:Flight BA142 to London', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:b1', `DTSTART:${ymd(Date.now() + 3 * day)}T080000Z`, 'SUMMARY:Blood test at the clinic', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:n1', `DTSTART:${ymd(Date.now() + 4 * day)}T100000Z`, 'SUMMARY:Buy a notebook', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
const realFetch = global.fetch;
global.fetch = async (url, opts = {}) => {
  const u = new URL(String(url));
  const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } });
  if (u.hostname === '127.0.0.1') return realFetch(url, opts);
  if (u.hostname === 'api.open-meteo.com') return json({ timezone: 'Asia/Kolkata', daily: { temperature_2m_max: [31], apparent_temperature_max: [33], uv_index_max: [5], precipitation_sum: [0] }, current: { relative_humidity_2m: 40, temperature_2m: 27 } });
  if (u.hostname === 'air-quality-api.open-meteo.com') return json({ timezone: 'Asia/Kolkata', current: { us_aqi: 178, pm2_5: 98 } });
  if (u.hostname === 'api.bigdatacloud.net') return json({ city: 'New Delhi', principalSubdivision: 'Delhi', countryCode: 'IN', countryName: 'India' });
  if (u.hostname === 'world.openfoodfacts.org') return u.pathname.includes('5449000000996') ? json({ status: 1, product: { product_name: 'Coca-Cola', brands: 'Coca-Cola', categories: 'Beverages, Carbonated drinks, Sodas', ingredients_text: 'water, sugar', additives_tags: [], nova_group: 4, nutriscore_grade: 'e', quantity: '330 ml' } }) : json({ status: 0 });
  if (/openbeautyfacts|openproductsfacts/.test(u.hostname)) return json({ status: 0 });
  if (u.hostname === 'shop.test') return new Response(`<html><head><title>Shop</title><meta property="og:title" content="Prestige Omega Deluxe Granite Non-Stick Tawa 28 cm"></head></html>`, { headers: { 'content-type': 'text/html' } });
  if (u.hostname === 'cal.test') return new Response(ICS, { headers: { 'content-type': 'text/calendar' } });
  if (u.hostname === 'graph.facebook.com') { sent.push(JSON.parse(opts.body)); return json({ messages: [{ id: 'wamid.1' }] }) }
  throw new Error('unexpected fetch ' + u.href);
};

const { createApp } = require('../server/app.js');
const { privateIp } = require('../server/net.js');

(async () => {
  const pushed = []; let pushFail = null;
  const app = createApp({ db: ':memory:', adminToken: 'admin-secret', pushSender: async (sub, payload) => { if (pushFail) { const e = new Error('gone'); e.statusCode = pushFail; throw e } pushed.push({ endpoint: sub.endpoint, ...JSON.parse(payload) }) } });
  await new Promise(r => app.server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  let cookie = '';
  async function call(method, p, body, headers = {}) {
    const r = await realFetch(base + p, { method, redirect: 'manual', headers: { ...(cookie ? { cookie } : {}), ...(body !== undefined && !headers['content-type'] ? { 'content-type': 'application/json' } : {}), ...headers }, body: body === undefined ? undefined : typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body) });
    const sc = r.headers.get('set-cookie'); if (sc && /^ww=[a-f0-9]/.test(sc)) cookie = sc.split(';')[0];
    const text = await r.text(); let data; try { data = JSON.parse(text) } catch (e) { data = text }
    return { status: r.status, data, headers: r.headers };
  }
  try {
    const page = await call('GET', '/'); check('serves the app', page.status === 200 && /wellwise/.test(page.data));
    check('serves the manifest with a share target', (await call('GET', '/manifest.webmanifest')).data.share_target?.action === '/share');
    const me = await call('GET', '/api/me'); check('health reports storage', me.data.features.storage === 'memory');
    check('creates a session', me.status === 200 && !!cookie && me.data.features.whatsapp === true && me.data.features.photo === false);
    await call('PUT', '/api/state', { state: { geo: 'IN', frequency: 'both', channel: 'In the app', seen: {}, updatedAt: 5 } });
    check('saves state', (await call('GET', '/api/me')).data.state.geo === 'IN');
    check('rejects non-JSON writes', (await call('POST', '/api/intake', 'text=x', { 'content-type': 'text/plain' })).status === 415);

    // share: text, link, barcode, photo without a model
    let r = await call('POST', '/api/intake', { text: 'Order confirmed: 1 x nonstick frying pan, 28 cm' });
    check('text → nonstick tip', r.data.match?.event === 'commerce:nonstick_pan' && !!r.data.tip);
    r = await call('POST', '/api/intake', { url: 'https://shop.test/p/12345' });
    check('link → reads page title', r.data.kind === 'link' && r.data.match?.event === 'commerce:nonstick_pan' && /Tawa/.test(r.data.summary));
    r = await call('POST', '/api/intake', { barcode: '5449000000996', source: 'scan' });
    check('barcode → Open Food Facts → soft drinks', r.data.product?.name === 'Coca-Cola' && r.data.match?.event === 'grocery:soda');
    r = await call('POST', '/api/intake', { text: 'a decorative notebook with gold edges' });
    check('no forced match', r.data.match?.event !== 'commerce:nonstick_pan' && (!r.data.tip || r.data.match.event === 'commerce:decorative_notebook'));
    r = await call('POST', '/api/intake', { image: { data: Buffer.from('not really a photo').toString('base64'), mediaType: 'image/jpeg' } });
    check('photo without Claude explains itself', r.status === 200 && !r.data.tip && /photo/.test(r.data.note || ''));
    r = await call('POST', '/api/intake', { doc: { data: Buffer.from('Haemoglobin 11.2 g/dL\nHbA1c 6.1%\nFerritin 12').toString('base64'), mediaType: 'text/plain', name: 'report.txt' } });
    check('lab report text → lab results tip', r.data.match?.event === 'health:lab_results');
    check('intake can be reopened', (await call('GET', '/api/intake/' + r.data.id)).data.id === r.data.id);

    // near you
    r = await call('GET', '/api/live?lat=28.6139&lon=77.2090&keep=1');
    check('live air quality → AQI moment', r.data.moments[0]?.id === 'env-aqi' && r.data.region === 'IN' && r.data.place === 'New Delhi, Delhi' && r.data.lat === 28.6);

    // calendar
    r = await call('POST', '/api/calendar', { url: 'webcal://cal.test/basic.ics' });
    check('calendar connects', r.status === 200 && r.data.events === 3);
    check('calendar finds flight and blood test, skips notebook', r.data.moments.map(m => m.moment).join() === 'cal-flight,cal-blood');
    r = await call('POST', '/api/calendar', { url: 'not a url' }); check('calendar rejects bad address', r.status === 400);

    // scheduler: calendar (next 24 h), near you, daily tip
    await app.tick(); await app.tick();
    const inbox = (await call('GET', '/api/inbox')).data.items;
    check('calendar tip delivered before the flight', inbox.some(i => i.source === 'calendar' && /Flight/.test(i.moment)));
    check('blood test not delivered yet', !inbox.some(i => /Blood test/.test(i.moment)));
    check('near-you tip delivered once', inbox.filter(i => i.source === 'environment').length === (new Date().getHours() >= 7 ? 1 : 0));
    check('daily tip delivered once', inbox.filter(i => i.source === 'daily').length === (new Date().getHours() >= 8 ? 1 : 0));

    // agents: REST and MCP
    const key = (await call('POST', '/api/agent-key', {})).data;
    check('agent key made', /^wwk_/.test(key.key) && key.mcp.endsWith('/mcp'));
    const auth = { authorization: 'Bearer ' + key.key };
    check('agent API needs a key', (await call('POST', '/api/agent/v1/moments', { text: 'x' }, { 'content-type': 'application/json' })).status === 401);
    const savedCookie = cookie; cookie = '';
    r = await call('POST', '/api/agent/v1/moments', { agent: 'Muse', text: 'Bought a bedroom HEPA air purifier' }, auth);
    check('agent moment → tip and delivery', r.data.tip && r.data.delivered === true && r.data.understood.matches[0].event === 'commerce:air_purifier');
    r = await call('POST', '/api/agent/v1/moments', { event: 'travel:time_zone' }, auth); check('agent can send an event key', !!r.data.tip);
    r = await call('POST', '/mcp', { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } }, auth); check('MCP initialize', r.data.result?.serverInfo?.name === 'wellwise' && /every time you complete or confirm/.test(r.data.result.instructions));
    r = await call('POST', '/mcp', { jsonrpc: '2.0', method: 'notifications/initialized' }, auth); check('MCP notification accepted', r.status === 202);
    r = await call('POST', '/mcp', { jsonrpc: '2.0', id: 2, method: 'tools/list' }, auth); check('MCP lists tools', r.data.result.tools.length === 3);
    check('tools say when to call and which only read', /right after you book/.test(r.data.result.tools.find(t => t.name === 'wellwise_send_moment').description) && r.data.result.tools.find(t => t.name === 'wellwise_find_tip').annotations.readOnlyHint === true);
    r = await call('POST', '/mcp', { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'wellwise_find_tip', arguments: { text: 'packing for a trip abroad, passport ready' } } }, auth);
    check('MCP find tip', !!r.data.result.structuredContent.tip && r.data.result.structuredContent.delivered === undefined);
    cookie = savedCookie;
    check('agent tips reach the inbox', (await call('GET', '/api/inbox')).data.items.some(i => i.source === 'agent' && /Muse/.test(i.moment)));

    // WhatsApp: verify, link, inbound message, reply
    check('WhatsApp webhook verification', (await call('GET', '/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=42')).data === 42);
    const link = (await call('POST', '/api/whatsapp', {})).data; check('WhatsApp link code', /^\d{6}$/.test(link.code) && /wa\.me\/447700900000\?text=LINK/.test(link.link));
    const hook = async (msg) => { const raw = JSON.stringify({ entry: [{ changes: [{ value: { messages: [msg] } }] }] }); const sig = 'sha256=' + crypto.createHmac('sha256', 'shh').update(raw).digest('hex'); return call('POST', '/webhooks/whatsapp', raw, { 'content-type': 'application/json', 'x-hub-signature-256': sig }) };
    check('WhatsApp rejects bad signatures', (await call('POST', '/webhooks/whatsapp', '{}', { 'content-type': 'application/json', 'x-hub-signature-256': 'sha256=00' })).status === 401);
    await hook({ from: '447700900123', id: 'w1', type: 'text', text: { body: 'LINK ' + link.code } }); await new Promise(r => setTimeout(r, 50));
    check('WhatsApp links the number', (await call('GET', '/api/me')).data.linked.whatsapp === '•••• 0123' && /You are linked/.test(sent.at(-1)?.text?.body));
    await hook({ from: '447700900123', id: 'w2', type: 'text', text: { body: 'Just bought a bottle of red wine for tonight' } }); await new Promise(r => setTimeout(r, 50));
    check('WhatsApp message → tip reply', sent.at(-1)?.to === '447700900123' && /Read more:/.test(sent.at(-1).text.body));
    check('WhatsApp tip joins the journey', (await call('GET', '/api/inbox')).data.items.some(i => i.source === 'whatsapp'));
    await hook({ from: '15550001111', id: 'w3', type: 'text', text: { body: 'hello' } }); await new Promise(r => setTimeout(r, 50));
    check('unknown number gets linking help', /Link WhatsApp/.test(sent.at(-1).text.body));

    // email forwarding
    const addr = (await call('POST', '/api/email', {})).data.address; check('email address', /@in\.wellwise\.test$/.test(addr));
    r = await call('POST', '/webhooks/email?secret=mail-secret', { OriginalRecipient: addr, Subject: 'Your order has shipped', TextBody: '1 x Sunscreen SPF 50, 100 ml', MessageID: 'm1' });
    check('forwarded email → tip', r.data.tip && (await call('GET', '/api/inbox')).data.items.some(i => i.source === 'email'));
    check('email webhook needs the secret', (await call('POST', '/webhooks/email?secret=no', {})).status === 403);

    // share target from another app
    const bnd = 'XyZ', form = `--${bnd}\r\nContent-Disposition: form-data; name="title"\r\n\r\nLook at this\r\n--${bnd}\r\nContent-Disposition: form-data; name="url"\r\n\r\nhttps://shop.test/p/9\r\n--${bnd}--\r\n`;
    r = await call('POST', '/share', form, { 'content-type': 'multipart/form-data; boundary=' + bnd });
    check('share target → intake page', r.status === 303 && /#moments\/intake\/in-/.test(r.headers.get('location')));

    // other devices
    const dc = (await call('POST', '/api/device-code', {})).data.code; const mine = cookie; cookie = '';
    await call('GET', '/api/me'); r = await call('POST', '/api/device-join', { code: dc });
    check('device code joins the same account', r.status === 200 && cookie === mine);

    // connector sign-in for AI assistants (OAuth 2.1 + PKCE)
    r = await call('POST', '/mcp', { jsonrpc: '2.0', id: 9, method: 'tools/list' }, { 'content-type': 'application/json', cookie: '' });
    check('MCP without sign-in points to OAuth', r.status === 401 && /resource_metadata=.*oauth-protected-resource/.test(r.headers.get('www-authenticate') || ''));
    const prm = (await call('GET', '/.well-known/oauth-protected-resource')).data, asm = (await call('GET', '/.well-known/oauth-authorization-server')).data;
    check('OAuth metadata', prm.resource.endsWith('/mcp') && asm.code_challenge_methods_supported.includes('S256') && !!asm.registration_endpoint);
    const reg = (await call('POST', '/oauth/register', { client_name: 'Claude', redirect_uris: ['https://claude.ai/api/mcp/auth_callback'] })).data;
    check('assistant registers itself', /^wwc_/.test(reg.client_id));
    check('bad redirect refused', (await call('POST', '/oauth/register', { redirect_uris: ['javascript:alert(1)'] })).status === 400);
    const verifier = crypto.randomBytes(32).toString('hex'), challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    const aq = new URLSearchParams({ response_type: 'code', client_id: reg.client_id, redirect_uri: 'https://claude.ai/api/mcp/auth_callback', code_challenge: challenge, code_challenge_method: 'S256', state: 'xyz' });
    const signedIn = cookie; cookie = '';
    r = await call('GET', '/oauth/authorize?' + aq); check('new browser is asked for a device code', /6-digit code/.test(r.data));
    cookie = signedIn;
    r = await call('GET', '/oauth/authorize?' + aq); check('signed-in browser sees Allow', /Connect Claude to Wellwise\?/.test(r.data) && r.headers.get('x-frame-options') === 'DENY');
    const csrf = (r.data.match(/name="csrf" value="([a-f0-9]+)"/) || [])[1];
    const approve = new URLSearchParams({ ...Object.fromEntries(aq), csrf, decision: 'allow' });
    check('forged approval refused', !/code=/.test((await call('POST', '/oauth/authorize', new URLSearchParams({ ...Object.fromEntries(aq), csrf: 'nope', decision: 'allow' }).toString(), { 'content-type': 'application/x-www-form-urlencoded' })).headers.get('location') || ''));
    r = await call('POST', '/oauth/authorize', approve.toString(), { 'content-type': 'application/x-www-form-urlencoded' });
    const loc = new URL(r.headers.get('location') || 'https://x/'), code = loc.searchParams.get('code');
    check('Allow returns to the assistant with a code', r.status === 302 && loc.host === 'claude.ai' && loc.searchParams.get('state') === 'xyz' && !!code);
    const tokenForm = v => new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: 'https://claude.ai/api/mcp/auth_callback', client_id: reg.client_id, code_verifier: v }).toString();
    check('wrong PKCE verifier refused', (await call('POST', '/oauth/token', tokenForm('wrong'), { 'content-type': 'application/x-www-form-urlencoded' })).status === 400);
    r = await call('POST', '/oauth/authorize', approve.toString(), { 'content-type': 'application/x-www-form-urlencoded' });
    const code2 = new URL(r.headers.get('location')).searchParams.get('code');
    const tok = (await call('POST', '/oauth/token', new URLSearchParams({ grant_type: 'authorization_code', code: code2, redirect_uri: 'https://claude.ai/api/mcp/auth_callback', client_id: reg.client_id, code_verifier: verifier }).toString(), { 'content-type': 'application/x-www-form-urlencoded' })).data;
    check('token issued', /^wwo_/.test(tok.access_token) && /^wwr_/.test(tok.refresh_token));
    r = await call('POST', '/mcp', { jsonrpc: '2.0', id: 10, method: 'tools/call', params: { name: 'wellwise_send_moment', arguments: { agent: 'Claude', text: 'Booked a flight to Singapore' } } }, { 'content-type': 'application/json', authorization: 'Bearer ' + tok.access_token, cookie: '' });
    check('signed-in assistant can send a moment', !!r.data.result?.structuredContent?.tip);
    const refreshed = (await call('POST', '/oauth/token', { grant_type: 'refresh_token', refresh_token: tok.refresh_token, client_id: reg.client_id })).data;
    check('token refresh', /^wwo_/.test(refreshed.access_token) && refreshed.access_token !== tok.access_token);
    const agents = (await call('GET', '/api/agents')).data;
    check('connected assistants listed', agents.connected.some(c => c.name === 'Claude'));
    await call('DELETE', '/api/agents/' + reg.client_id, {});
    check('disconnect revokes access', (await call('POST', '/mcp', { jsonrpc: '2.0', id: 11, method: 'tools/list' }, { 'content-type': 'application/json', authorization: 'Bearer ' + refreshed.access_token, cookie: '' })).status === 401);

    // someone new to Wellwise connects from their assistant with one tap
    {
      const keep = cookie; cookie = '';
      const page1 = await call('GET', '/oauth/authorize?' + aq);
      check('new person sees Allow, not a dead end', /name="decision" value="new"/.test(page1.data) && /Already use Wellwise/.test(page1.data));
      const anonCsrf = (page1.data.match(/name="csrf" value="([a-f0-9]+)"/) || [])[1];
      r = await call('POST', '/oauth/authorize', new URLSearchParams({ ...Object.fromEntries(aq), csrf: anonCsrf, decision: 'new' }).toString(), { 'content-type': 'application/x-www-form-urlencoded' });
      const newCode = new URL(r.headers.get('location') || 'https://x/').searchParams.get('code');
      check('one tap creates the account and returns to the assistant', r.status === 302 && !!newCode && !!cookie);
      const t2 = (await call('POST', '/oauth/token', new URLSearchParams({ grant_type: 'authorization_code', code: newCode, redirect_uri: 'https://claude.ai/api/mcp/auth_callback', client_id: reg.client_id, code_verifier: verifier }).toString(), { 'content-type': 'application/x-www-form-urlencoded' })).data;
      r = await call('POST', '/mcp', { jsonrpc: '2.0', id: 12, method: 'tools/call', params: { name: 'wellwise_send_moment', arguments: { text: 'Bought sunscreen SPF 50' } } }, { 'content-type': 'application/json', authorization: 'Bearer ' + t2.access_token, cookie: '' });
      check('the new account works straight away', r.data.result?.structuredContent?.delivered === true && (await call('GET', '/api/inbox')).data.items.length >= 1);
      const forged = await call('POST', '/oauth/authorize', new URLSearchParams({ ...Object.fromEntries(aq), csrf: 'nope', decision: 'new' }).toString(), { 'content-type': 'application/x-www-form-urlencoded', cookie: '' });
      check('forged sign-up refused', !forged.headers.get('location'));
      cookie = keep;
    }

    // the same trip from an agent and from the calendar brings one tip, not two
    {
      const keep = cookie; cookie = '';
      await call('GET', '/api/me');
      const k = (await call('POST', '/api/agent-key', {})).data.key;
      r = await call('POST', '/api/agent/v1/moments', { agent: 'Muse', text: 'Booked a flight to London, long-haul' }, { authorization: 'Bearer ' + k, 'content-type': 'application/json', cookie: '' });
      check('agent booking brings a tip', r.data.delivered === true);
      await call('POST', '/api/calendar', { url: 'https://cal.test/basic.ics' });
      await app.tick();
      const items = (await call('GET', '/api/inbox')).data.items;
      check('calendar does not repeat the trip tip', items.filter(i => i.source === 'calendar' && /Flight/.test(i.moment)).length === 0 && items.filter(i => i.source === 'agent').length === 1);
      r = await call('POST', '/api/agent/v1/moments', { agent: 'Muse', text: 'Booked a flight to London, long-haul' }, { authorization: 'Bearer ' + k, 'content-type': 'application/json', cookie: '' });
      check('a repeat from the agent is not sent again', r.data.delivered === false && !!r.data.tip);
      cookie = keep;
    }

    // scheduled tips follow each person's own clock
    const clock = require('../server/clock.js');
    const zones = Array.from({ length: 25 }, (_, i) => 'Etc/GMT' + (i - 12 >= 0 ? '+' : '') + (i - 12)).map(z => z.replace('+-', '-').replace('GMT+0', 'GMT'));
    const morning = zones.find(z => { const h = clock.local(z).hour; return h >= 9 && h <= 20 }), night = zones.find(z => clock.local(z).hour < 6);
    const tzUser = async zone => { cookie = ''; await call('GET', '/api/me'); await call('PUT', '/api/state', { state: { frequency: 'daily', tz: zone, updatedAt: 1 } }); return cookie };
    const cA = await tzUser(morning), cB = await tzUser(night);
    await app.tick();
    cookie = cA; const dA = (await call('GET', '/api/inbox')).data.items.filter(i => i.source === 'daily').length;
    cookie = cB; const dB = (await call('GET', '/api/inbox')).data.items.filter(i => i.source === 'daily').length;
    check(`daily tip at 8:00 local (${morning} yes, ${night} not yet)`, dA === 1 && dB === 0);
    check('calendar times use the event time zone', require('../server/calendar.js').parse('BEGIN:VEVENT\nUID:1\nDTSTART;TZID=Asia/Kolkata:20261101T233000\nSUMMARY:x\nEND:VEVENT', 'Europe/London')[0].start === Date.UTC(2026, 10, 1, 18, 0));
    cookie = signedIn;

    // admin console
    check('admin needs a token', (await call('GET', '/api/admin/status')).status === 401);
    const A = { authorization: 'Bearer admin-secret' };
    r = await call('GET', '/api/admin/status', undefined, A); check('admin status', r.data.stats.users >= 1 && r.data.reach.unreachable.length === 0 && r.data.integrations.whatsapp);
    r = await call('POST', '/api/admin/packs/check', { tips: [{ title: 'x', category: 'Nope', action: 'a', why: 'b', caution: 'c', sources: ['http://x'] }] }, A);
    check('invalid pack blocked', r.data.errors.length >= 2);
    const before = (await call('GET', '/wellwise-content.json')).data;
    r = await call('POST', '/api/admin/packs', { pack: 'Test', tips: [{ title: 'Drink water with meals', category: 'Food & nutrition', action: 'Keep a glass of water on the table', why: 'An easy swap for sugary drinks', caution: 'Follow fluid limits if you have them', sources: ['https://www.cdc.gov/healthy-weight-growth/water-healthy-drinks/index.html'], triggerKeys: ['prompt:grocery'] }] }, A);
    const after = (await call('GET', '/wellwise-content.json')).data;
    check('valid pack goes live', r.data.added === 1 && after.TIPS.length === before.TIPS.length + 1 && after.contentVersion >= before.contentVersion);

    // notifications: allowed once, then tips arrive on their own
    {
      const saved = cookie; cookie = '';
      await call('GET', '/api/me');
      const clock = require('../server/clock.js');
      const zones = Array.from({ length: 25 }, (_, i) => 'Etc/GMT' + (i - 12 >= 0 ? '+' : '') + (i - 12)).map(z => z.replace('+-', '-').replace('GMT+0', 'GMT'));
      const morning = zones.find(z => { const h = clock.local(z).hour; return h >= 9 && h <= 20 });
      await call('PUT', '/api/state', { state: { frequency: 'both', tz: morning, updatedAt: 1 } });
      const k = (await call('GET', '/api/push')).data;
      check('push key offered', typeof k.key === 'string' && k.key.length > 60 && k.devices === 0);
      check('bad subscription refused', (await call('POST', '/api/push', { subscription: { endpoint: 'http://x' } })).status === 400);
      const sub = { endpoint: 'https://push.example/abc', keys: { p256dh: 'BPx', auth: 'au' } };
      r = await call('POST', '/api/push', { subscription: sub });
      check('device subscribed, with a confirmation', r.data.devices === 1 && pushed.some(x => x.tag === 'welcome' && x.endpoint === sub.endpoint));
      const w0 = pushed.length; r = await call('POST', '/api/push', { subscription: sub, quiet: true });
      check('re-registering on open is silent', r.data.devices === 1 && pushed.length === w0);
      const before = pushed.length;
      await app.tick();
      const daily = pushed.slice(before).find(x => x.url && x.url.startsWith('/#tip/'));
      check('daily tip arrives as a notification without opening the app', !!daily && daily.title.length > 3);
      await app.tick();
      check('only one daily notification', pushed.slice(before).filter(x => x.url && x.url.startsWith('/#tip/') && x.body.startsWith('Your Wellwise tip for today')).length === 1);
      pushFail = 410; await call('POST', '/api/agent-key', {}); pushFail = 410;
      const key2 = (await call('POST', '/api/agent-key', {})).data.key;
      await call('POST', '/api/agent/v1/moments', { text: 'Bought sunscreen SPF 50' }, { authorization: 'Bearer ' + key2, cookie: '' });
      pushFail = null;
      check('expired devices are forgotten', (await call('GET', '/api/push')).data.devices === 0);
      cookie = saved;
    }

    // a public address set without https:// still gives assistants absolute sign-in links
    process.env.WELLWISE_PUBLIC_URL = 'wellwise-production.up.railway.app/';
    const app2 = createApp({ db: ':memory:' }); delete process.env.WELLWISE_PUBLIC_URL;
    await new Promise(r => app2.server.listen(0, '127.0.0.1', r));
    const base2 = `http://127.0.0.1:${app2.server.address().port}`;
    const probe = await realFetch(base2 + '/mcp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' }) });
    const meta = (probe.headers.get('www-authenticate') || '').match(/resource_metadata="([^"]+)"/)?.[1];
    check('sign-in pointer is an absolute https link', probe.status === 401 && meta === 'https://wellwise-production.up.railway.app/.well-known/oauth-protected-resource');
    const prm2 = await (await realFetch(base2 + '/.well-known/oauth-protected-resource/mcp')).json();
    const asm2 = await (await realFetch(base2 + '/.well-known/oauth-authorization-server')).json();
    check('metadata addresses are absolute', prm2.resource === 'https://wellwise-production.up.railway.app/mcp' && prm2.authorization_servers[0] === 'https://wellwise-production.up.railway.app' && asm2.registration_endpoint === 'https://wellwise-production.up.railway.app/oauth/register');
    const pre = await realFetch(base2 + '/mcp', { method: 'OPTIONS', headers: { origin: 'https://claude.ai', 'access-control-request-method': 'POST' } });
    check('browser pre-check allowed', pre.status === 204 && pre.headers.get('access-control-allow-origin') === '*' && /www-authenticate/.test(pre.headers.get('access-control-expose-headers') || ''));
    check('trailing slash on the connector works', (await realFetch(base2 + '/mcp/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status === 401);
    app2.server.close();

    // guards
    check('private addresses are blocked', privateIp('127.0.0.1') && privateIp('10.1.2.3') && privateIp('192.168.0.9') && privateIp('::1') && !privateIp('8.8.8.8'));
    r = await call('DELETE', '/api/me', {}); check('delete my data', r.status === 200);
  } catch (e) { failed++; console.log('FAIL crashed:', e.stack) }
  app.server.close();
  if (failed) { console.log(failed + ' check(s) failed'); process.exit(1) }
  console.log('server checks passed');
})();
