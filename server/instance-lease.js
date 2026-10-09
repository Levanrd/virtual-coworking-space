import { randomUUID } from 'node:crypto';

// The beta owns presence/seats in one process. Fail closed if another process
// tries to serve the same database; a Socket.IO adapter alone is insufficient.
export function claimInstance(db, now = Date.now) {
  const owner = randomUUID(), ttl = 30000;
  db.exec('CREATE TABLE IF NOT EXISTS runtime_lease (id INTEGER PRIMARY KEY CHECK(id=1), owner TEXT NOT NULL, expires INTEGER NOT NULL)');
  const claim = db.prepare('INSERT INTO runtime_lease VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET owner=excluded.owner, expires=excluded.expires WHERE runtime_lease.expires <= ?');
  if (claim.run(owner, now() + ttl, now()).changes !== 1) throw new Error('Another app instance owns this database. Run exactly one app instance for the friends beta.');
  const owned = () => !!db.prepare('SELECT 1 FROM runtime_lease WHERE id=1 AND owner=? AND expires>?').get(owner, now());
  return { owned,
    renew() { return db.prepare('UPDATE runtime_lease SET expires=? WHERE id=1 AND owner=? AND expires>?').run(now() + ttl, owner, now()).changes === 1; },
    release() { db.prepare('DELETE FROM runtime_lease WHERE id=1 AND owner=?').run(owner); },
  };
}
