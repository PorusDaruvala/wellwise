// Sign-in by email code or WhatsApp. Signing in makes a browser use the person's own Wellwise,
// so a phone, a computer and an assistant's browser all reach the same journey.
const crypto = require('node:crypto');

const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');
const sixDigits = () => String(crypto.randomInt(100000, 1000000));
const TTL = 10 * 60e3;

/* Resend's email API. Without RESEND_API_KEY, email sign-in is off. */
function emailSender() {
  const key = process.env.RESEND_API_KEY, from = process.env.WELLWISE_EMAIL_FROM || 'Wellwise <onboarding@resend.dev>';
  if (!key) return null;
  return async (to, code) => {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { authorization: 'Bearer ' + key, 'content-type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject: `Your Wellwise code: ${code}`,
        text: `Your Wellwise sign-in code is ${code}.\n\nIt works for 10 minutes. If you did not ask for it, you can ignore this email.`,
        html: `<p>Your Wellwise sign-in code is</p><p style="font-size:28px;font-weight:800;letter-spacing:4px">${code}</p><p>It works for 10 minutes. If you did not ask for it, you can ignore this email.</p>` }),
    });
    if (!res.ok) throw new Error('Email could not be sent (' + res.status + ')');
  };
}

function setup(db, { sendEmail } = {}) {
  db.db.exec(`CREATE TABLE IF NOT EXISTS login_codes(id TEXT PRIMARY KEY, kind TEXT NOT NULL, target TEXT, code_hash TEXT NOT NULL, created INTEGER NOT NULL, expires INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, claimed_by TEXT);`);
  try { db.db.exec('ALTER TABLE users ADD COLUMN email TEXT') } catch (e) { /* already there */ }
  db.db.exec('CREATE UNIQUE INDEX IF NOT EXISTS users_email ON users(email)');
  const q = sql => db.db.prepare(sql);
  const send = sendEmail === undefined ? emailSender() : sendEmail;
  const norm = e => String(e || '').trim().toLowerCase();
  const valid = e => e.length < 200 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

  return {
    emailEnabled: () => !!send,
    /* Email: send a 6-digit code. At most 5 codes per address in 15 minutes. */
    async startEmail(email) {
      const e = norm(email);
      if (!valid(e)) return { error: 'That email address does not look right.' };
      if (!send) return { error: 'Email sign-in is not available yet.' };
      if (q("SELECT COUNT(*) n FROM login_codes WHERE kind='email' AND target=? AND created>?").get(e, Date.now() - 15 * 60e3).n >= 5) return { error: 'Too many codes for this address. Try again in 15 minutes.' };
      const id = 'lc_' + db.id(8), code = sixDigits();
      q('INSERT INTO login_codes(id,kind,target,code_hash,created,expires) VALUES(?,?,?,?,?,?)').run(id, 'email', e, sha(id + code), Date.now(), Date.now() + TTL);
      try { await send(e, code) } catch (err) { q('DELETE FROM login_codes WHERE id=?').run(id); return { error: 'We could not send the email. Try again in a minute.' } }
      return { id, email: e };
    },
    verifyEmail(id, code) {
      const r = q("SELECT * FROM login_codes WHERE id=? AND kind='email'").get(String(id || ''));
      if (!r) return { error: 'Ask for a new code.' };
      if (r.expires < Date.now()) { q('DELETE FROM login_codes WHERE id=?').run(r.id); return { error: 'That code has expired. Ask for a new one.' } }
      if (r.attempts >= 5) return { error: 'Too many tries. Ask for a new code.' };
      if (sha(r.id + String(code || '').replace(/\D/g, '')) !== r.code_hash) { q('UPDATE login_codes SET attempts=attempts+1 WHERE id=?').run(r.id); return { error: 'That code is not right. Check the email and try again.' } }
      q('DELETE FROM login_codes WHERE id=?').run(r.id);
      return { email: r.target };
    },
    /* WhatsApp: the person sends "SIGNIN 123456" to Wellwise's number; the page waiting on that code then signs in. */
    startWhatsApp() {
      const id = 'lc_' + db.id(8), code = sixDigits();
      q('INSERT INTO login_codes(id,kind,code_hash,created,expires) VALUES(?,?,?,?,?)').run(id, 'whatsapp', sha('wa' + code), Date.now(), Date.now() + TTL);
      return { id, code };
    },
    claimWhatsApp(code, phone) {
      const r = q("SELECT id FROM login_codes WHERE kind='whatsapp' AND code_hash=? AND expires>? AND claimed_by IS NULL").get(sha('wa' + String(code)), Date.now());
      if (!r) return false;
      q('UPDATE login_codes SET claimed_by=? WHERE id=?').run(String(phone), r.id);
      return true;
    },
    checkWhatsApp(id) {
      const r = q("SELECT * FROM login_codes WHERE id=? AND kind='whatsapp'").get(String(id || ''));
      if (!r || r.expires < Date.now()) return { error: 'That code has expired. Start again.' };
      if (!r.claimed_by) return { pending: true };
      q('DELETE FROM login_codes WHERE id=?').run(r.id);
      return { phone: r.claimed_by };
    },
  };
}

/* Combine an unsigned browser's Wellwise into the person's own: tips, journey, connections and devices. */
function mergeState(to, from) {
  const out = { ...to }, byId = (a, b) => { const seen = new Set(); return [...(a || []), ...(b || [])].filter(x => x && !seen.has(x.id) && seen.add(x.id)).sort((x, y) => y.at - x.at).slice(0, 100) };
  out.seen = { ...(from.seen || {}), ...(to.seen || {}) };
  for (const k of Object.keys(from.seen || {})) if (to.seen?.[k]) out.seen[k] = Math.min(to.seen[k], from.seen[k]);
  out.source = { ...(from.source || {}), ...(to.source || {}) };
  out.statuses = { ...(to.statuses || {}) }; out.statusAt = { ...(to.statusAt || {}) };
  for (const [k, v] of Object.entries(from.statuses || {})) if (!out.statusAt[k] || (from.statusAt?.[k] || 0) > out.statusAt[k]) { out.statuses[k] = v; out.statusAt[k] = from.statusAt?.[k] || Date.now() }
  out.feedback = { ...(from.feedback || {}), ...(to.feedback || {}) };
  out.checkins = { ...(from.checkins || {}), ...(to.checkins || {}) };
  out.delivered = { ...(from.delivered || {}), ...(to.delivered || {}) };
  out.notifications = byId(to.notifications, from.notifications);
  out.events = byId(to.events, from.events);
  out.updatedAt = Date.now();
  return out;
}
function mergeAccounts(db, fromId, toId) {
  const a = db.userById(fromId), b = db.userById(toId);
  if (!a || !b || a.id === b.id) return;
  for (const t of ['inbox', 'intakes', 'feedback', 'calendar_events', 'oauth_tokens', 'oauth_codes', 'push_subs', 'push_log'])
    try { db.db.prepare(`UPDATE OR IGNORE ${t} SET user_id=? WHERE user_id=?`).run(toId, fromId) } catch (e) { /* table not there */ }
  for (const f of ['phone', 'agent_key', 'inbound', 'calendar_url', 'calendar_synced', 'lat', 'lon']) if (b[f] == null && a[f] != null) { db.setField(fromId, f, null); db.setField(toId, f, a[f]) }
  db.saveState(toId, { ...mergeState(b.state || {}, a.state || {}), _server: { ...(a.state?._server || {}), ...(b.state?._server || {}) } });
  db.deleteUser(fromId);
}

module.exports = { setup, mergeAccounts, mergeState };
