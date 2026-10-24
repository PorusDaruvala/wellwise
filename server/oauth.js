// Sign-in for AI assistants (OAuth 2.1 with PKCE and dynamic client registration, as MCP clients expect).
// A person pastes the Wellwise connector address into their assistant, approves it once, and is done.
const crypto = require('node:crypto');

const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');
const b64url = buf => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const esc = x => String(x ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ACCESS_TTL = 30 * 864e5, REFRESH_TTL = 365 * 864e5, CODE_TTL = 10 * 60e3;

function okRedirect(u) {
  try { const x = new URL(u); return x.protocol === 'https:' || (x.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(x.hostname)) || /^[a-z][a-z0-9+.-]*:$/.test(x.protocol) && !['http:', 'javascript:', 'data:', 'file:'].includes(x.protocol) } catch (e) { return false }
}

function setup(db) {
  db.db.exec(`
  CREATE TABLE IF NOT EXISTS oauth_clients(id TEXT PRIMARY KEY, name TEXT, redirect_uris TEXT NOT NULL, created INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS oauth_codes(code TEXT PRIMARY KEY, user_id TEXT NOT NULL, client_id TEXT NOT NULL, redirect_uri TEXT NOT NULL, challenge TEXT NOT NULL, expires INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS oauth_tokens(hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, client_id TEXT NOT NULL, kind TEXT NOT NULL, expires INTEGER NOT NULL, created INTEGER NOT NULL);`);
  const q = sql => db.db.prepare(sql);
  return {
    register(body) {
      const uris = Array.isArray(body.redirect_uris) ? body.redirect_uris.map(String) : [];
      if (!uris.length || !uris.every(okRedirect)) return { error: 'invalid_redirect_uri' };
      const id = 'wwc_' + db.id(12), name = String(body.client_name || 'AI assistant').slice(0, 60);
      q('INSERT INTO oauth_clients VALUES(?,?,?,?)').run(id, name, JSON.stringify(uris), Date.now());
      return { client_id: id, client_name: name, redirect_uris: uris, client_id_issued_at: Math.floor(Date.now() / 1000), token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'] };
    },
    client(id) { const r = q('SELECT * FROM oauth_clients WHERE id=?').get(String(id || '')); return r && { ...r, redirect_uris: JSON.parse(r.redirect_uris) } },
    issueCode(uid, clientId, redirectUri, challenge) { const c = db.id(20); q('INSERT INTO oauth_codes VALUES(?,?,?,?,?,?)').run(c, uid, clientId, redirectUri, challenge, Date.now() + CODE_TTL); return c },
    tokens(uid, clientId) {
      const access = 'wwo_' + db.id(24), refresh = 'wwr_' + db.id(24), now = Date.now();
      q('INSERT INTO oauth_tokens VALUES(?,?,?,?,?,?)').run(sha(access), uid, clientId, 'access', now + ACCESS_TTL, now);
      q('INSERT INTO oauth_tokens VALUES(?,?,?,?,?,?)').run(sha(refresh), uid, clientId, 'refresh', now + REFRESH_TTL, now);
      return { access_token: access, token_type: 'Bearer', expires_in: Math.floor(ACCESS_TTL / 1000), refresh_token: refresh, scope: 'wellwise' };
    },
    exchange(form) {
      if (form.grant_type === 'authorization_code') {
        const r = q('SELECT * FROM oauth_codes WHERE code=?').get(String(form.code || ''));
        if (r) q('DELETE FROM oauth_codes WHERE code=?').run(r.code);
        if (!r || r.expires < Date.now() || r.client_id !== form.client_id || r.redirect_uri !== form.redirect_uri) return { error: 'invalid_grant' };
        if (b64url(crypto.createHash('sha256').update(String(form.code_verifier || '')).digest()) !== r.challenge) return { error: 'invalid_grant', error_description: 'PKCE check failed' };
        return this.tokens(r.user_id, r.client_id);
      }
      if (form.grant_type === 'refresh_token') {
        const h = sha(form.refresh_token || ''), r = q("SELECT * FROM oauth_tokens WHERE hash=? AND kind='refresh'").get(h);
        if (!r || r.expires < Date.now() || (form.client_id && form.client_id !== r.client_id)) return { error: 'invalid_grant' };
        q('DELETE FROM oauth_tokens WHERE hash=?').run(h);
        return this.tokens(r.user_id, r.client_id);
      }
      return { error: 'unsupported_grant_type' };
    },
    userFor(token) { const r = q("SELECT * FROM oauth_tokens WHERE hash=? AND kind='access'").get(sha(token)); return r && r.expires > Date.now() ? r.user_id : null },
    connected(uid) { return q("SELECT t.client_id, c.name, MIN(t.created) since FROM oauth_tokens t JOIN oauth_clients c ON c.id=t.client_id WHERE t.user_id=? AND t.expires>? GROUP BY t.client_id, c.name").all(uid, Date.now()) },
    revoke(uid, clientId) { q('DELETE FROM oauth_tokens WHERE user_id=? AND client_id=?').run(uid, clientId) },
    revokeAll(uid) { q('DELETE FROM oauth_tokens WHERE user_id=?').run(uid); q('DELETE FROM oauth_codes WHERE user_id=?').run(uid) },
  };
}

/* The approval page an assistant opens in the browser. */
function page(title, body) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · Wellwise</title>
<style>body{margin:0;font:15px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif;background:#f5f7f2;color:#172a22}.box{max-width:460px;margin:40px auto;padding:0 16px}.card{background:#fff;border:1px solid #e0e8df;border-radius:18px;padding:24px}
.brand{font-size:24px;font-weight:850;letter-spacing:-1px}.brand span{color:#146c4b}h1{font-size:22px;margin:16px 0 8px}ul{padding-left:20px}.btn{border:1px solid #146c4b;background:#146c4b;color:#fff;border-radius:11px;padding:10px 16px;font:inherit;font-weight:700;cursor:pointer}
.ghost{background:#fff;color:#146c4b}.field{width:100%;padding:10px;border:1px solid #cedfd1;border-radius:10px;font:inherit;box-sizing:border-box}.muted{color:#5f7166;font-size:13px}.row{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px}.err{color:#8a2a1f}</style></head>
<body><div class="box"><div class="brand">well<span>wise.</span></div><div class="card">${body}</div></div></body></html>`;
}
function approvePage(client, hidden, err) {
  return page('Connect', `<h1>Connect ${esc(client.name)} to Wellwise?</h1><p>${esc(client.name)} will be able to:</p><ul><li>tell Wellwise about moments in your day, like a purchase or a trip</li><li>get the tip that fits, and save it to your journey</li><li>see which tips you are trying and which are habits</li></ul>
  ${err ? `<p class="err">${esc(err)}</p>` : ''}<form method="post" action="/oauth/authorize">${hidden}<div class="row"><button class="btn" name="decision" value="allow">Allow</button><button class="btn ghost" name="decision" value="deny">Cancel</button></div></form><p class="muted">You can disconnect at any time in Wellwise → Moments → Your agent.</p>`);
}
/* Someone new to Wellwise: one tap starts Wellwise and connects the assistant. People who already use Wellwise elsewhere can bring their journey with a code. */
function codePage(client, hidden, err) {
  return page('Connect', `<h1>Connect ${esc(client.name)} to Wellwise?</h1><p>Wellwise sends you one short, sourced health tip when something in your day makes it useful. ${esc(client.name)} will be able to:</p><ul><li>tell Wellwise about moments in your day, like a purchase or a trip</li><li>get the tip that fits, and save it to your journey</li><li>see which tips you are trying and which are habits</li></ul>
  ${err ? `<p class="err">${esc(err)}</p>` : ''}<form method="post" action="/oauth/authorize">${hidden}<div class="row"><button class="btn" name="decision" value="new">Allow</button><button class="btn ghost" name="decision" value="deny">Cancel</button></div></form>
  <details style="margin-top:18px"><summary class="muted">Already use Wellwise on another device?</summary><p class="muted">In Wellwise there, go to <b>Settings → Your data → Use Wellwise on another device</b>, and enter the 6-digit code here.</p><form method="post" action="/oauth/authorize">${hidden}<input class="field" name="device_code" inputmode="numeric" autocomplete="one-time-code" placeholder="6-digit code" required><div class="row"><button class="btn ghost" name="decision" value="code">Use my code</button></div></form></details>
  <p class="muted">You can disconnect at any time in Wellwise → Moments → Your agent.</p>`);
}

module.exports = { setup, page, approvePage, codePage, esc, b64url };
