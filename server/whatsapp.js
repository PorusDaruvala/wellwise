// WhatsApp Business Cloud API. People link their number once, then can send Wellwise a link, photo,
// document or message and get a tip back. Wellwise can also send tips to a linked number.
const crypto = require('node:crypto');
const { getJSON } = require('./net.js');

const API = 'https://graph.facebook.com/v25.0'; // supported until July 2028
const env = () => ({ token: process.env.WHATSAPP_TOKEN, phoneId: process.env.WHATSAPP_PHONE_NUMBER_ID, verify: process.env.WHATSAPP_VERIFY_TOKEN, secret: process.env.WHATSAPP_APP_SECRET, number: process.env.WHATSAPP_DISPLAY_NUMBER, template: process.env.WHATSAPP_TEMPLATE });
const enabled = () => !!(env().token && env().phoneId);

function verifySignature(raw, header) {
  const { secret } = env();
  if (!secret) return true;
  if (!header) return false;
  const want = 'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex');
  return want.length === header.length && crypto.timingSafeEqual(Buffer.from(want), Buffer.from(header));
}

async function post(body) {
  if (!enabled()) return { skipped: true };
  const res = await fetch(`${API}/${env().phoneId}/messages`, { method: 'POST', headers: { authorization: 'Bearer ' + env().token, 'content-type': 'application/json' }, body: JSON.stringify({ messaging_product: 'whatsapp', ...body }) });
  if (!res.ok) console.error('WhatsApp send failed', res.status, await res.text());
  return { ok: res.ok };
}
const sendText = (to, text) => post({ to, type: 'text', text: { body: text.slice(0, 4000), preview_url: true } });
const sendTemplate = (to, params) => post({ to, type: 'template', template: { name: env().template, language: { code: process.env.WHATSAPP_TEMPLATE_LANG || 'en' }, components: [{ type: 'body', parameters: params.map(t => ({ type: 'text', text: String(t).slice(0, 900) })) }] } });

async function media(id) {
  const meta = await getJSON(`${API}/${id}`, { headers: { authorization: 'Bearer ' + env().token } });
  const res = await fetch(meta.url, { headers: { authorization: 'Bearer ' + env().token } });
  if (!res.ok) throw new Error('Media download failed');
  return { data: Buffer.from(await res.arrayBuffer()).toString('base64'), mediaType: meta.mime_type };
}

/* Turns one webhook message into an intake input. */
async function toInput(msg) {
  if (msg.type === 'text') return { text: msg.text.body };
  if (msg.type === 'image') { const m = await media(msg.image.id); return { image: m, text: msg.image.caption || '' } }
  if (msg.type === 'document') { const m = await media(msg.document.id); return { doc: { ...m, name: msg.document.filename || '' }, text: msg.document.caption || '' } }
  if (msg.type === 'interactive') return { text: msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || '' };
  if (msg.type === 'button') return { text: msg.button?.text || '' };
  return null;
}

function tipMessage(tip, friendly, url) {
  return `${friendly ? friendly + '\n\n' : ''}*${tip.title}*\n${tip.action}.\n\n${tip.why}.\n\nRead more: ${url}`;
}

/* Inside 24 hours of the person's last message, any text can be sent. After that, only an approved template. */
async function deliver(user, tip, friendly, url) {
  const last = user.state?._server?.waLastInbound || 0;
  if (!user.phone || !enabled()) return { skipped: true };
  if (Date.now() - last < 23.5 * 3600e3) return sendText(user.phone, tipMessage(tip, friendly, url));
  if (env().template) return sendTemplate(user.phone, [tip.title, tip.action, url]);
  return { skipped: true, reason: 'outside the 24-hour window and no template set' };
}

module.exports = { env, enabled, verifySignature, sendText, toInput, tipMessage, deliver };
