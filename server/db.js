// SQLite storage (Node's built-in node:sqlite). One file, no extra service to run.
const { DatabaseSync } = require('node:sqlite');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const id = (n = 16) => crypto.randomBytes(n).toString('hex');
const code = () => String(crypto.randomInt(100000, 1000000));

function open(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
  PRAGMA journal_mode=WAL;
  CREATE TABLE IF NOT EXISTS users(
    id TEXT PRIMARY KEY, token TEXT UNIQUE NOT NULL, created INTEGER NOT NULL, seen INTEGER,
    state TEXT NOT NULL DEFAULT '{}', phone TEXT UNIQUE, agent_key TEXT UNIQUE, inbound TEXT UNIQUE,
    calendar_url TEXT, calendar_synced INTEGER, lat REAL, lon REAL);
  CREATE TABLE IF NOT EXISTS link_codes(code TEXT PRIMARY KEY, user_id TEXT NOT NULL, kind TEXT NOT NULL, expires INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS inbox(
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, at INTEGER NOT NULL, tip TEXT NOT NULL, moment TEXT NOT NULL,
    source TEXT NOT NULL, via TEXT, message TEXT, channel TEXT, dedupe TEXT, UNIQUE(user_id, dedupe));
  CREATE INDEX IF NOT EXISTS inbox_user ON inbox(user_id, at);
  CREATE TABLE IF NOT EXISTS intakes(
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, at INTEGER NOT NULL, source TEXT NOT NULL, kind TEXT NOT NULL,
    summary TEXT, result TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS calendar_events(
    user_id TEXT NOT NULL, uid TEXT NOT NULL, start INTEGER NOT NULL, title TEXT, moment TEXT, PRIMARY KEY(user_id, uid));
  CREATE TABLE IF NOT EXISTS feedback(user_id TEXT NOT NULL, tip TEXT NOT NULL, source TEXT, vote TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY(user_id, tip));
  CREATE TABLE IF NOT EXISTS packs(id TEXT PRIMARY KEY, name TEXT, at INTEGER NOT NULL, body TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS cache(k TEXT PRIMARY KEY, v TEXT NOT NULL, expires INTEGER NOT NULL);
  `);
  const q = sql => db.prepare(sql);
  const now = () => Date.now();
  const parse = u => u && { ...u, state: JSON.parse(u.state || '{}') };

  return {
    db, id, code,
    createUser() { const u = { id: id(8), token: id(24) }; q('INSERT INTO users(id,token,created,seen) VALUES(?,?,?,?)').run(u.id, u.token, now(), now()); return this.userById(u.id) },
    userByToken: t => t ? parse(q('SELECT * FROM users WHERE token=?').get(t)) : null,
    userById: i => parse(q('SELECT * FROM users WHERE id=?').get(i)),
    userByPhone: p => parse(q('SELECT * FROM users WHERE phone=?').get(p)),
    userByAgentKey: k => k ? parse(q('SELECT * FROM users WHERE agent_key=?').get(k)) : null,
    userByInbound: a => a ? parse(q('SELECT * FROM users WHERE inbound=?').get(a)) : null,
    touch: uid => q('UPDATE users SET seen=? WHERE id=?').run(now(), uid),
    saveState: (uid, s) => q('UPDATE users SET state=? WHERE id=?').run(JSON.stringify(s), uid),
    setField(uid, field, v) {
      if (!['phone', 'agent_key', 'inbound', 'calendar_url', 'calendar_synced', 'lat', 'lon'].includes(field)) throw new Error('bad field');
      q(`UPDATE users SET ${field}=? WHERE id=?`).run(v ?? null, uid);
    },
    usersWith: field => q(`SELECT * FROM users WHERE ${field} IS NOT NULL`).all().map(parse),
    allUsers: () => q('SELECT * FROM users').all().map(parse),
    deleteUser(uid) { for (const t of ['inbox', 'intakes', 'calendar_events', 'feedback', 'link_codes']) q(`DELETE FROM ${t} WHERE user_id=?`).run(uid); q('DELETE FROM users WHERE id=?').run(uid) },

    newCode(uid, kind, ttl = 15 * 60e3) { q('DELETE FROM link_codes WHERE user_id=? AND kind=?').run(uid, kind); const c = code(); q('INSERT INTO link_codes VALUES(?,?,?,?)').run(c, uid, kind, now() + ttl); return c },
    useCode(c, kind) { const r = q('SELECT * FROM link_codes WHERE code=? AND kind=?').get(String(c), kind); if (!r || r.expires < now()) return null; q('DELETE FROM link_codes WHERE code=?').run(String(c)); return r.user_id },

    addInbox(uid, item) {
      const row = { id: 'evt-' + now() + '-' + id(3), at: now(), via: null, message: '', channel: 'In the app', dedupe: null, ...item };
      const r = q('INSERT OR IGNORE INTO inbox(id,user_id,at,tip,moment,source,via,message,channel,dedupe) VALUES(?,?,?,?,?,?,?,?,?,?)')
        .run(row.id, uid, row.at, row.tip, row.moment, row.source, row.via, row.message, row.channel, row.dedupe);
      return r.changes ? row : null;
    },
    inboxSince: (uid, since) => q('SELECT id,at,tip,moment,source,via,message,channel FROM inbox WHERE user_id=? AND at>? ORDER BY at').all(uid, since || 0),

    addIntake(uid, source, kind, summary, result) { const i = 'in-' + id(6); q('INSERT INTO intakes VALUES(?,?,?,?,?,?,?)').run(i, uid, now(), source, kind, summary || '', JSON.stringify({ ...result, id: i })); return i },
    intake: (uid, i) => { const r = q('SELECT * FROM intakes WHERE id=? AND user_id=?').get(i, uid); return r && { ...r, result: JSON.parse(r.result) } },
    recentIntakes: (uid, source, n = 10) => q('SELECT * FROM intakes WHERE user_id=? AND source=? ORDER BY at DESC LIMIT ?').all(uid, source, n).map(r => ({ ...r, result: JSON.parse(r.result) })),

    upsertCalEvent: (uid, e) => q('INSERT INTO calendar_events VALUES(?,?,?,?,?) ON CONFLICT(user_id,uid) DO UPDATE SET start=excluded.start,title=excluded.title,moment=excluded.moment').run(uid, e.uid, e.start, e.title, e.moment),
    calEvents: (uid, from) => q('SELECT * FROM calendar_events WHERE user_id=? AND start>=? ORDER BY start LIMIT 50').all(uid, from),
    clearCal: uid => q('DELETE FROM calendar_events WHERE user_id=?').run(uid),

    vote(uid, tip, source, vote) { if (!vote) q('DELETE FROM feedback WHERE user_id=? AND tip=?').run(uid, tip); else q('INSERT INTO feedback VALUES(?,?,?,?,?) ON CONFLICT(user_id,tip) DO UPDATE SET vote=excluded.vote,source=excluded.source,at=excluded.at').run(uid, tip, source || null, vote, now()) },
    feedbackBySource: () => q("SELECT COALESCE(source,'Explore') source, SUM(vote='useful') useful, COUNT(*) total FROM feedback GROUP BY 1 ORDER BY total DESC").all(),
    feedbackByTip: () => q("SELECT tip, SUM(vote='useful') useful, COUNT(*) total FROM feedback GROUP BY tip ORDER BY total DESC LIMIT 30").all(),

    savePack: (pid, name, body) => q('INSERT INTO packs VALUES(?,?,?,?)').run(pid, name, now(), JSON.stringify(body)),
    packs: () => q('SELECT * FROM packs ORDER BY at').all().map(p => ({ ...p, body: JSON.parse(p.body) })),
    deletePack: pid => q('DELETE FROM packs WHERE id=?').run(pid),

    cacheGet(k) { const r = q('SELECT v,expires FROM cache WHERE k=?').get(k); return r && r.expires > now() ? JSON.parse(r.v) : undefined },
    cacheSet: (k, v, ttl) => q('INSERT INTO cache VALUES(?,?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v,expires=excluded.expires').run(k, JSON.stringify(v), now() + ttl),
    stats: () => ({
      users: q('SELECT COUNT(*) n FROM users').get().n,
      active7: q('SELECT COUNT(*) n FROM users WHERE seen>?').get(now() - 7 * 864e5).n,
      whatsapp: q('SELECT COUNT(*) n FROM users WHERE phone IS NOT NULL').get().n,
      calendars: q('SELECT COUNT(*) n FROM users WHERE calendar_url IS NOT NULL').get().n,
      agents: q('SELECT COUNT(*) n FROM users WHERE agent_key IS NOT NULL').get().n,
      deliveries7: q('SELECT source, COUNT(*) n FROM inbox WHERE at>? GROUP BY source').all(now() - 7 * 864e5),
      intakes7: q('SELECT source, kind, COUNT(*) n FROM intakes WHERE at>? GROUP BY source, kind').all(now() - 7 * 864e5),
    }),
  };
}
module.exports = { open };
