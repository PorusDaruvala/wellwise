// Phone and browser notifications (Web Push). Each person allows them once; after that, tips arrive on their own.
// The server keeps its own key pair, made once and stored, so there is nothing to set up on the host.
const webpush = require('web-push');

function setup(db, { sender, subject } = {}) {
  db.db.exec(`CREATE TABLE IF NOT EXISTS push_subs(endpoint TEXT PRIMARY KEY, user_id TEXT NOT NULL, sub TEXT NOT NULL, created INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS settings(k TEXT PRIMARY KEY, v TEXT NOT NULL);`);
  const q = sql => db.db.prepare(sql);
  let keys = process.env.WELLWISE_VAPID_PUBLIC && process.env.WELLWISE_VAPID_PRIVATE ? { publicKey: process.env.WELLWISE_VAPID_PUBLIC, privateKey: process.env.WELLWISE_VAPID_PRIVATE } : null;
  if (!keys) {
    const row = q("SELECT v FROM settings WHERE k='vapid'").get();
    keys = row ? JSON.parse(row.v) : webpush.generateVAPIDKeys();
    if (!row) q("INSERT INTO settings VALUES('vapid',?)").run(JSON.stringify(keys));
  }
  const send = sender || ((sub, payload) => webpush.sendNotification(sub, payload, { vapidDetails: { subject: subject() , publicKey: keys.publicKey, privateKey: keys.privateKey }, TTL: 12 * 3600 }));

  return {
    publicKey: () => keys.publicKey,
    save(uid, sub) {
      if (!sub || typeof sub.endpoint !== 'string' || !/^https:\/\//.test(sub.endpoint) || !sub.keys?.p256dh || !sub.keys?.auth) return false;
      const known = q('SELECT user_id FROM push_subs WHERE endpoint=?').get(sub.endpoint);
      q('INSERT INTO push_subs VALUES(?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id, sub=excluded.sub').run(sub.endpoint, uid, JSON.stringify({ endpoint: sub.endpoint, keys: sub.keys }), Date.now());
      return { isNew: !known || known.user_id !== uid };
    },
    remove: (uid, endpoint) => q('DELETE FROM push_subs WHERE user_id=? AND endpoint=?').run(uid, String(endpoint || '')),
    removeAll: uid => q('DELETE FROM push_subs WHERE user_id=?').run(uid),
    count: uid => q('SELECT COUNT(*) n FROM push_subs WHERE user_id=?').get(uid).n,
    total: () => q('SELECT COUNT(DISTINCT user_id) n FROM push_subs').get().n,
    /* Sends to every device the person allowed. Devices that have gone away are forgotten. */
    async notify(uid, msg) {
      const subs = q('SELECT * FROM push_subs WHERE user_id=?').all(uid);
      let sent = 0;
      for (const s of subs) {
        try { await send(JSON.parse(s.sub), JSON.stringify(msg)); sent++ }
        catch (e) { if (e.statusCode === 404 || e.statusCode === 410) q('DELETE FROM push_subs WHERE endpoint=?').run(s.endpoint); else console.error('push', e.statusCode || '', e.message) }
      }
      return sent;
    },
  };
}

module.exports = { setup };
