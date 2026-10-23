// Outbound HTTP for links people share. Public addresses only, with size and time limits.
const dns = require('node:dns').promises;
const net = require('node:net');

const UA = 'Mozilla/5.0 (compatible; WellwiseBot/4.0; +https://github.com/)';

function privateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const s = ip.toLowerCase();
  return s === '::1' || s === '::' || s.startsWith('fc') || s.startsWith('fd') || s.startsWith('fe80') || s.startsWith('::ffff:') && privateIp(s.slice(7));
}

async function assertPublic(u) {
  const url = new URL(u);
  if (!/^https?:$/.test(url.protocol)) throw new Error('Only web links work here');
  if (process.env.WELLWISE_ALLOW_PRIVATE_FETCH === '1') return url;
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addrs = net.isIP(host) ? [host] : (await dns.lookup(host, { all: true })).map(a => a.address);
  if (!addrs.length || addrs.some(privateIp)) throw new Error('That address is not reachable');
  return url;
}

/* Fetch a public page. Follows up to 3 redirects, checking each hop. */
async function fetchPublic(u, { maxBytes = 2e6, timeout = 8000, accept = 'text/html,application/xhtml+xml,text/calendar,*/*;q=0.5' } = {}) {
  let url = await assertPublic(u);
  for (let hop = 0; hop < 4; hop++) {
    const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(timeout), headers: { 'user-agent': UA, accept, 'accept-language': 'en' } });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) { url = await assertPublic(new URL(res.headers.get('location'), url).href); continue }
    const reader = res.body?.getReader(); const chunks = []; let size = 0;
    if (reader) for (; ;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > maxBytes) { reader.cancel(); break } chunks.push(value) }
    return { status: res.status, url: url.href, type: res.headers.get('content-type') || '', body: Buffer.concat(chunks) };
  }
  throw new Error('Too many redirects');
}

/* JSON from a fixed, trusted API (weather, product databases, WhatsApp). */
async function getJSON(u, { timeout = 8000, headers = {} } = {}) {
  const res = await fetch(u, { signal: AbortSignal.timeout(timeout), headers: { 'user-agent': UA, accept: 'application/json', ...headers } });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(u).hostname}`);
  return res.json();
}

module.exports = { fetchPublic, getJSON, privateIp, UA };
