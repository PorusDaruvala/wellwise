// Reads photos, documents and free text with Claude, and maps them to known Wellwise events only.
// Without ANTHROPIC_API_KEY (or another credential the SDK finds), every function returns null and
// the caller falls back to barcodes and keyword matching.
const Anthropic = require('@anthropic-ai/sdk');

const MODEL = process.env.WELLWISE_MODEL || 'claude-opus-5-5';
let client = null;
function enabled() { return !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) }
function getClient() { if (!client) client = new Anthropic(); return client }

const SYSTEM = `You read what a person shared with Wellwise, a health-tips app: a photo, a document, a web page or a message.
Describe what it is in a few plain words, then pick which Wellwise events it shows, using only the event keys you are given.
Pick an event only when the content clearly shows it. For example, a photo of a nonstick pan shows the nonstick pan event; a decorative notebook shows nothing.
If nothing fits, return an empty list. Never guess a health link that the content does not show.
If you can read a product barcode (EAN or UPC digits), return the digits.`;

function schema(eventKeys) {
  return {
    type: 'object', additionalProperties: false,
    required: ['summary', 'kind', 'product_name', 'barcode', 'events'],
    properties: {
      summary: { type: 'string', description: 'What this is, in under 12 words.' },
      kind: { type: 'string', enum: ['product', 'order', 'lab_report', 'prescription', 'calendar', 'message', 'other'] },
      product_name: { type: ['string', 'null'] },
      barcode: { type: ['string', 'null'] },
      events: { type: 'array', items: { type: 'string', enum: eventKeys }, maxItems: 3 },
    },
  };
}

function catalog(content) {
  const lines = [], seen = new Set();
  for (const p of content.PRODUCTS) if (!seen.has(p.event)) { seen.add(p.event); lines.push(`${p.event}: ${p.name}`) }
  for (const m of content.MOMENTS) if (!seen.has(m.event)) { seen.add(m.event); lines.push(`${m.event}: ${m.name}`) }
  return { keys: [...seen], text: lines.join('\n') };
}

/* parts: [{type:'text', text}] | [{type:'image', data, mediaType}] | [{type:'pdf', data}] */
async function read(content, parts) {
  if (!enabled()) return null;
  const cat = catalog(content);
  const blocks = parts.map(p =>
    p.type === 'image' ? { type: 'image', source: { type: 'base64', media_type: p.mediaType, data: p.data } }
      : p.type === 'pdf' ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: p.data } }
        : { type: 'text', text: String(p.text).slice(0, 40000) });
  blocks.push({ type: 'text', text: 'Wellwise events (key: meaning):\n' + cat.text });
  try {
    const res = await getClient().beta.messages.create({
      model: MODEL, max_tokens: 2000, system: SYSTEM,
      betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: schema(cat.keys) } },
      messages: [{ role: 'user', content: blocks }],
    });
    if (res.stop_reason === 'refusal') return null;
    const text = res.content.find(b => b.type === 'text');
    if (!text) return null;
    const out = JSON.parse(text.text);
    out.events = (out.events || []).filter(k => cat.keys.includes(k));
    return out;
  } catch (e) {
    if (e instanceof Anthropic.APIError) console.error('Claude API error', e.status, e.message);
    else console.error('Reading failed', e.message);
    return null;
  }
}

module.exports = { enabled, read, MODEL };
